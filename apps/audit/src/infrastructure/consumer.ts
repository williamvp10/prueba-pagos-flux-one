import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import formats from "ajv-formats";
import { rootPath, connectBroker } from "@fluxone/backend-kit";
import { PgAuditStore } from "./store";
import { AuditFault } from "../domain/ports";
export class AuditConsumer {
  ready = false;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;
  private broker: Awaited<ReturnType<typeof connectBroker>> | null = null;
  private valid;
  constructor(private store: PgAuditStore) {
    const ajv = new Ajv2020({ strict: true });
    formats(ajv);
    this.valid = ajv.compile(
      JSON.parse(
        readFileSync(
          resolve(rootPath(), "docs/contracts/audit-event.v1.schema.json"),
          "utf8",
        ),
      ),
    );
  }
  start() {
    void this.connect();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ready = false;
    await this.broker?.conn.close().catch(() => {});
  }
  private async connect() {
    if (this.stopped) return;
    try {
      const broker = await connectBroker();
      this.broker = broker;
      broker.conn.on("error", () => {});
      broker.conn.on("close", () => this.retry());
      broker.channel.on("error", () => this.retry());
      await broker.channel.prefetch(10);
      await broker.channel.consume(
        "fluxone.audit.v1.persist",
        (message) => {
          if (message) void this.consume(message, broker);
        },
        { noAck: false },
      );
      this.ready = true;
    } catch {
      this.retry();
    }
  }
  private retry() {
    this.ready = false;
    this.broker = null;
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.connect();
    }, 2000);
  }
  private async consume(
    message: any,
    broker: Awaited<ReturnType<typeof connectBroker>>,
  ) {
    let event: any;
    try {
      event = JSON.parse(message.content.toString());
      if (!this.valid(event)) throw new AuditFault(422, "INVALID_EVENT");
      await this.store.persist(event);
      broker.channel.ack(message);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof AuditFault) {
        try {
          await new Promise<void>((ok, fail) =>
            broker.channel.publish(
              "fluxone.audit.v1.dead",
              "",
              message.content,
              {
                persistent: true,
                messageId: message.properties.messageId,
                headers: {
                  reason:
                    error instanceof AuditFault ? error.code : "INVALID_JSON",
                },
              },
              (e) => (e ? fail(e) : ok()),
            ),
          );
          broker.channel.ack(message);
        } catch {
          await broker.conn.close().catch(() => {});
        }
      } else {
        console.error(
          JSON.stringify({
            worker: "audit",
            status: "db_retry",
            eventId: event?.eventId,
          }),
        );
        await broker.conn.close().catch(() => {});
      }
    }
  }
}
