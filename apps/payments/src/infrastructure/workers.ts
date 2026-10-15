import { DataSource } from "typeorm";
import { randomUUID } from "node:crypto";
import { connectBroker } from "@fluxone/backend-kit";
import { PgTransaction, updatedRows } from "./store";
import { BankRail, BankResult } from "../domain/ports";
import { settleBankResult, startBankAttempt } from "../application/reconcile";
export class PaymentWorkers {
  private stopped = false;
  private bankBusy = false;
  private outboxBusy = false;
  private timers: NodeJS.Timeout[] = [];
  private broker: Awaited<ReturnType<typeof connectBroker>> | null = null;
  constructor(
    private db: DataSource,
    private bank: BankRail,
  ) {}
  start() {
    this.timers = [
      setInterval(() => {
        void this.bankTick();
      }, 500),
      setInterval(() => {
        void this.outboxTick();
      }, 500),
    ];
  }
  async stop() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    await this.broker?.conn.close().catch(() => {});
  }
  private async bankTick() {
    if (this.stopped || this.bankBusy) return;
    this.bankBusy = true;
    try {
      for (const reverse of [false, true]) {
        await this.bankOne(reverse);
      }
    } catch (e) {
      console.error(
        JSON.stringify({
          worker: "bank",
          error: e instanceof Error ? e.name : "error",
        }),
      );
    } finally {
      this.bankBusy = false;
    }
  }
  async bankOne(reverse: boolean) {
    const table = reverse ? "reversals" : "transfers",
      lease = randomUUID();
    const job = await this.db.transaction(async (m) => {
      const [row] = await m.query(
        `SELECT * FROM ${table} WHERE status IN ('PENDING','UNKNOWN','PROCESSING') ${reverse ? "" : "AND destination_kind='EXTERNAL'"} AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      if (!row) return null;
      const tx = new PgTransaction(m),
        t = await tx.transfer(reverse ? row.transfer_id : row.id, true);
      if (!t) return null;
      const r = reverse ? await tx.latestReversal(t.id) : null;
      if (reverse && r?.id !== row.id) throw Error("Mismatched reversal");
      const state = reverse ? r!.status : t.status;
      const attempts = row.attempts + 1;
      await m.query(
        `UPDATE ${table} SET lease_token=$2,lease_until=now()+interval '30 seconds',attempts=attempts+1 WHERE id=$1`,
        [row.id, lease],
      );
      await startBankAttempt(tx, t, r);
      const source = await tx.findAccount(t.source);
      return {
        t,
        r,
        sourceCode: source!.code,
        attempts,
        consult: row.attempts > 0 || state !== "PENDING",
        id: row.id,
      };
    });
    if (!job) return;
    let result: BankResult = job.consult
      ? await this.bank.lookup(job.t, job.r)
      : "NOT_FOUND";
    if (result === "NOT_FOUND")
      result = await this.bank.submit(job.t, job.r, job.sourceCode);
    await this.db.transaction(async (m) => {
      const tx = new PgTransaction(m),
        t = await tx.transfer(job.t.id, true);
      if (!t) return;
      const [claim] = await m.query(
        `SELECT lease_token FROM ${table} WHERE id=$1 FOR UPDATE`,
        [job.id],
      );
      if (claim?.lease_token !== lease) return;
      const r = reverse ? await tx.latestReversal(t.id) : null;
      if (reverse && r?.id !== job.id) return;
      const target = r ?? t;
      if (!["PROCESSING", "UNKNOWN", "PENDING"].includes(target.status)) return;
      await settleBankResult(tx, t, r, result);
      const wait = Math.min(
        30,
        result === "UNKNOWN"
          ? 5 * 2 ** Math.min(job.attempts - 1, 3)
          : 2 ** Math.min(job.attempts - 1, 5),
      );
      await m.query(
        `UPDATE ${table} SET lease_until=NULL,lease_token=NULL,next_attempt_at=now()+($2*interval '1 second') WHERE id=$1`,
        [job.id, wait * (0.8 + Math.random() * 0.4)],
      );
      if (job.attempts >= 20)
        console.warn(
          JSON.stringify({
            alert: "bank_reconciliation_delayed",
            transferId: t.id,
            attempts: job.attempts,
          }),
        );
    });
  }
  private async outboxTick() {
    if (this.stopped || this.outboxBusy) return;
    this.outboxBusy = true;
    const lease = randomUUID();
    try {
      const rawRows = await this.db.transaction((m) =>
        m.query(
          "UPDATE outbox_events SET lease_token=$1,lease_until=now()+interval '30 seconds' WHERE event_id IN (SELECT event_id FROM outbox_events WHERE published_at IS NULL AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY transfer_id,sequence FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING *",
          [lease],
        ),
      );
      const rows = updatedRows(rawRows);
      if (!rows.length) return;
      if (!this.broker) {
        this.broker = await connectBroker();
        this.broker.conn.on("error", () => {});
        this.broker.conn.on("close", () => {
          this.broker = null;
        });
        this.broker.channel.on("error", () => {
          this.broker = null;
        });
      }
      for (const row of rows) {
        const channel = this.broker!.channel;
        let returned = false;
        const listener = (message: any) => {
          if (message.properties.messageId === row.event_id) returned = true;
        };
        channel.on("return", listener);
        try {
          await new Promise<void>((ok, fail) => {
            channel.publish(
              "fluxone.audit.v1",
              `transfer.${row.payload.type}`,
              Buffer.from(JSON.stringify(row.payload)),
              {
                persistent: true,
                mandatory: true,
                messageId: row.event_id,
                contentType: "application/json",
              },
              (error) => (error ? fail(error) : ok()),
            );
          });
          if (returned) throw Error("Unroutable event");
          await this.db.query(
            "UPDATE outbox_events SET published_at=now(),lease_until=NULL,lease_token=NULL WHERE event_id=$1 AND lease_token=$2",
            [row.event_id, lease],
          );
        } catch {
          await this.db.query(
            "UPDATE outbox_events SET lease_until=NULL,lease_token=NULL,attempts=attempts+1,next_attempt_at=now()+(LEAST(30,power(2,LEAST(attempts,5)))*(0.8+random()*0.4)*interval '1 second') WHERE event_id=$1 AND lease_token=$2",
            [row.event_id, lease],
          );
        } finally {
          channel.off("return", listener);
        }
      }
    } catch {
      await this.db
        .query(
          "UPDATE outbox_events SET lease_until=NULL,lease_token=NULL,attempts=attempts+1,next_attempt_at=now()+(LEAST(30,power(2,LEAST(attempts,5)))*interval '1 second') WHERE lease_token=$1 AND published_at IS NULL",
          [lease],
        )
        .catch(() => {});
      if (!this.stopped)
        console.warn(
          JSON.stringify({ worker: "outbox", status: "retry_pending" }),
        );
    } finally {
      this.outboxBusy = false;
    }
  }
}
