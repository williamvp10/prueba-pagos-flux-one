import {
  DataSource,
  EntityManager,
  MigrationInterface,
  QueryRunner,
} from "typeorm";
import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "@fluxone/backend-kit";
import {
  Account,
  Transfer,
  Reversal,
  Transaction,
  UnitOfWork,
  Identifiers,
  Result,
} from "../domain/ports";
import { money } from "../domain/money";
export const updatedRows = (result: any): any[] =>
  Array.isArray(result[0]) && typeof result[1] === "number"
    ? result[0]
    : result;
export const ids: Identifiers = {
  uuid: randomUUID,
  now: () => new Date().toISOString(),
  hash: (p) => createHash("sha256").update(JSON.stringify(p)).digest("hex"),
};
const account = (r: any): Account => ({
  id: r.id,
  code: r.code,
  owner: r.owner_id,
  balance: BigInt(r.balance_minor),
  reserved: BigInt(r.reserved_minor),
});
export const transfer = (r: any): Transfer => ({
  id: r.id,
  actor: r.actor_id,
  source: r.source_id,
  kind: r.destination_kind,
  destination: r.destination_code,
  amount: BigInt(r.amount_minor),
  status: r.status,
  sequence: r.sequence,
  bankRef: r.bank_reference,
  correlation: r.correlation_id,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  failureCode: r.failure_code,
});
const reversal = (r: any): Reversal => ({
  id: r.id,
  transferId: r.transfer_id,
  amount: BigInt(r.amount_minor),
  status: r.status,
  bankRef: r.bank_reference,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  failureCode: r.failure_code,
});
export class PaymentsMigration1792073600001 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
 CREATE TABLE accounts(id uuid PRIMARY KEY,code text NOT NULL UNIQUE,owner_id uuid NOT NULL,role text NOT NULL DEFAULT 'PRIMARY',balance_minor bigint NOT NULL DEFAULT 0,reserved_minor bigint NOT NULL DEFAULT 0,UNIQUE(owner_id,role),CHECK(balance_minor>=0 AND balance_minor<=99999999999999 AND reserved_minor>=0 AND reserved_minor<=balance_minor));
 CREATE TABLE external_beneficiaries(code text PRIMARY KEY,label text NOT NULL);
 INSERT INTO external_beneficiaries VALUES('EXT-001','Banco demo · cuenta 1'),('EXT-002','Banco demo · cuenta 2');
 CREATE TABLE transfers(id uuid PRIMARY KEY,actor_id uuid NOT NULL,source_id uuid NOT NULL REFERENCES accounts(id),destination_kind text NOT NULL CHECK(destination_kind IN ('INTERNAL','EXTERNAL')),destination_code text NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=99999999999999),status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','UNKNOWN','COMPLETED','FAILED','REVERSED')),sequence integer NOT NULL DEFAULT 0,bank_reference uuid NOT NULL UNIQUE,correlation_id text NOT NULL,failure_code text,lease_until timestamptz,lease_token uuid,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX transfer_history ON transfers(created_at DESC,id DESC);CREATE INDEX transfer_actor ON transfers(actor_id);
 CREATE TABLE reversals(id uuid PRIMARY KEY,transfer_id uuid NOT NULL REFERENCES transfers(id),amount_minor bigint NOT NULL CHECK(amount_minor>0),status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','UNKNOWN','COMPLETED','FAILED')),bank_reference uuid NOT NULL UNIQUE,failure_code text,lease_until timestamptz,lease_token uuid,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
 CREATE UNIQUE INDEX one_live_reversal ON reversals(transfer_id) WHERE status IN ('PENDING','PROCESSING','UNKNOWN','COMPLETED');
 CREATE TABLE ledger_entries(id uuid PRIMARY KEY,operation_key text NOT NULL UNIQUE,account_id uuid NOT NULL REFERENCES accounts(id),direction text NOT NULL CHECK(direction IN ('DEBIT','CREDIT')),amount_minor bigint NOT NULL CHECK(amount_minor>0),transfer_id uuid REFERENCES transfers(id),reversal_id uuid REFERENCES reversals(id),created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE idempotency_records(subject_id uuid NOT NULL,operation text NOT NULL,key text NOT NULL,payload_hash text NOT NULL,http_status integer,response_body jsonb,PRIMARY KEY(subject_id,operation,key));
 CREATE TABLE outbox_events(event_id uuid PRIMARY KEY,transfer_id uuid NOT NULL REFERENCES transfers(id),sequence integer NOT NULL,payload jsonb NOT NULL,published_at timestamptz,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,UNIQUE(transfer_id,sequence));
 `);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TABLE outbox_events,idempotency_records,ledger_entries,reversals,transfers,external_beneficiaries,accounts",
    );
  }
}
export class PgTransaction implements Transaction {
  constructor(public m: EntityManager) {}
  async claim(actor: string, operation: string, key: string, hash: string) {
    const inserted = await this.m.query(
      "INSERT INTO idempotency_records(subject_id,operation,key,payload_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key",
      [actor, operation, key, hash],
    );
    if (inserted.length) return null;
    const [r] = await this.m.query(
      "SELECT * FROM idempotency_records WHERE subject_id=$1 AND operation=$2 AND key=$3",
      [actor, operation, key],
    );
    if (r.payload_hash !== hash)
      return {
        status: 409,
        body: {
          code: "IDEMPOTENCY_CONFLICT",
          message: "La clave ya representa otra solicitud",
        },
        replayed: true,
      };
    if (!r.http_status) throw new Error("Incomplete idempotency record");
    return { status: r.http_status, body: r.response_body, replayed: true };
  }
  async saveResult(
    actor: string,
    operation: string,
    key: string,
    result: Result,
  ) {
    await this.m.query(
      "UPDATE idempotency_records SET http_status=$4,response_body=$5 WHERE subject_id=$1 AND operation=$2 AND key=$3",
      [actor, operation, key, result.status, result.body],
    );
  }
  async findAccount(id: string) {
    const [r] = await this.m.query("SELECT * FROM accounts WHERE id=$1", [id]);
    return r ? account(r) : null;
  }
  async byCode(code: string) {
    const [r] = await this.m.query("SELECT * FROM accounts WHERE code=$1", [
      code,
    ]);
    return r ? account(r) : null;
  }
  async lockAccounts(ids: string[]) {
    return (
      await this.m.query(
        "SELECT * FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [ids],
      )
    ).map(account);
  }
  async changeAccount(id: string, balance: bigint, reserve: bigint) {
    await this.m.query(
      "UPDATE accounts SET balance_minor=balance_minor+$2,reserved_minor=reserved_minor+$3 WHERE id=$1",
      [id, balance.toString(), reserve.toString()],
    );
  }
  async transfer(id: string, lock = false) {
    const [r] = await this.m.query(
      `SELECT * FROM transfers WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return r ? transfer(r) : null;
  }
  async insertTransfer(t: Transfer) {
    await this.m.query(
      "INSERT INTO transfers(id,actor_id,source_id,destination_kind,destination_code,amount_minor,status,bank_reference,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        t.id,
        t.actor,
        t.source,
        t.kind,
        t.destination,
        t.amount.toString(),
        t.status,
        t.bankRef,
        t.correlation,
      ],
    );
  }
  async updateTransfer(t: Transfer) {
    const [row] = updatedRows(
      await this.m.query(
        "UPDATE transfers SET status=$2,failure_code=$3,updated_at=now() WHERE id=$1 RETURNING updated_at",
        [t.id, t.status, t.failureCode],
      ),
    );
    t.updatedAt = new Date(row.updated_at).toISOString();
  }
  async latestReversal(id: string) {
    const [r] = await this.m.query(
      "SELECT * FROM reversals WHERE transfer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1",
      [id],
    );
    return r ? reversal(r) : null;
  }
  async insertReversal(r: Reversal) {
    await this.m.query(
      "INSERT INTO reversals(id,transfer_id,amount_minor,status,bank_reference) VALUES($1,$2,$3,$4,$5)",
      [r.id, r.transferId, r.amount.toString(), r.status, r.bankRef],
    );
  }
  async updateReversal(r: Reversal) {
    const [row] = updatedRows(
      await this.m.query(
        "UPDATE reversals SET status=$2,failure_code=$3,updated_at=now() WHERE id=$1 RETURNING updated_at",
        [r.id, r.status, r.failureCode],
      ),
    );
    r.updatedAt = new Date(row.updated_at).toISOString();
  }
  async ledger(
    op: string,
    acc: string,
    direction: "DEBIT" | "CREDIT",
    value: bigint,
    t: string,
    r?: string,
  ) {
    await this.m.query(
      "INSERT INTO ledger_entries(id,operation_key,account_id,direction,amount_minor,transfer_id,reversal_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), op, acc, direction, value.toString(), t, r ?? null],
    );
  }
  async event(t: Transfer, type: string, r?: Reversal) {
    const [row] = updatedRows(
      await this.m.query(
        "UPDATE transfers SET sequence=sequence+1 WHERE id=$1 RETURNING sequence",
        [t.id],
      ),
    );
    t.sequence = row.sequence;
    const event = {
      eventId: randomUUID(),
      version: 1,
      type,
      transferId: t.id,
      sequence: t.sequence,
      actorId: t.actor,
      occurredAt: new Date().toISOString(),
      correlationId: t.correlation,
      data: {
        transferStatus: t.status,
        amount: money(t.amount),
        currency: "COP",
        sourceAccountId: t.source,
        destinationKind: t.kind,
        destinationCode: t.destination,
        reversalId: r?.id ?? null,
        reversalStatus: r?.status ?? null,
      },
    };
    await this.m.query(
      "INSERT INTO outbox_events(event_id,transfer_id,sequence,payload) VALUES($1,$2,$3,$4)",
      [event.eventId, t.id, t.sequence, event],
    );
  }
}
export class PgUnitOfWork implements UnitOfWork {
  constructor(private db: DataSource) {}
  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.transaction("READ COMMITTED", (m) =>
          work(new PgTransaction(m)),
        );
      } catch (e: any) {
        if (["40P01", "40001"].includes(e.code) && attempt < 2) continue;
        throw e;
      }
    }
  }
}
export class PgQueries {
  constructor(private db: DataSource) {}
  async accounts(actor: string) {
    return (
      await this.db.query(
        "SELECT * FROM accounts WHERE owner_id=$1 ORDER BY code",
        [actor],
      )
    ).map(account);
  }
  async bootstrap(actor: string) {
    const code = `ACC-${actor}`;
    const result = await this.db.query(
      "INSERT INTO accounts(id,code,owner_id) VALUES($1,$2,$3) ON CONFLICT(owner_id,role) DO NOTHING RETURNING *",
      [randomUUID(), code, actor],
    );
    const [existing] = result.length
      ? result
      : await this.db.query(
          "SELECT * FROM accounts WHERE owner_id=$1 AND role='PRIMARY'",
          [actor],
        );
    return { created: result.length > 0, account: account(existing) };
  }
  async beneficiaries() {
    return [
      ...(await this.db.query(
        "SELECT code,code AS label,'INTERNAL' AS kind FROM accounts ORDER BY code",
      )),
      ...(await this.db.query(
        "SELECT code,label,'EXTERNAL' AS kind FROM external_beneficiaries ORDER BY code",
      )),
    ];
  }
  async detail(actor: string, id: string) {
    return this.db.transaction(async (m) => {
      const tx = new PgTransaction(m),
        t = await tx.transfer(id);
      if (!t) throw new ApiError(404, "RESOURCE_NOT_FOUND");
      const source = await tx.findAccount(t.source),
        dest = t.kind === "INTERNAL" ? await tx.byCode(t.destination) : null;
      if (source?.owner !== actor && dest?.owner !== actor)
        throw new ApiError(404, "RESOURCE_NOT_FOUND");
      return { t, r: await tx.latestReversal(id) };
    });
  }
  async history(
    actor: string,
    limit: number,
    status?: string,
    cursor?: string,
  ) {
    let c: any = null;
    if (cursor) {
      try {
        c = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (
          c.status !== (status ?? null) ||
          typeof c.date !== "string" ||
          !Number.isFinite(Date.parse(c.date)) ||
          !String(c.id).match(/^[a-f0-9-]{36}$/)
        )
          throw Error();
      } catch {
        throw new ApiError(422, "VALIDATION_ERROR");
      }
    }
    const rows = await this.db.query(
      `SELECT t.*,t.created_at::text AS cursor_date FROM transfers t JOIN accounts a ON a.id=t.source_id LEFT JOIN accounts d ON t.destination_kind='INTERNAL' AND d.code=t.destination_code WHERE (a.owner_id=$1 OR d.owner_id=$1) AND ($2::text IS NULL OR t.status=$2) AND ($3::timestamptz IS NULL OR (t.created_at,t.id)<($3::timestamptz,$4::uuid)) ORDER BY t.created_at DESC,t.id DESC LIMIT $5`,
      [actor, status ?? null, c?.date ?? null, c?.id ?? null, limit + 1],
    );
    const more = rows.length > limit;
    const selected = rows.slice(0, limit);
    const items = [];
    for (const row of selected) {
      const tx = new PgTransaction(this.db.manager);
      items.push({ t: transfer(row), r: await tx.latestReversal(row.id) });
    }
    const last = selected.at(-1);
    return {
      items,
      nextCursor: more
        ? Buffer.from(
            JSON.stringify({
              date: last.cursor_date,
              id: last.id,
              status: status ?? null,
            }),
          ).toString("base64url")
        : null,
    };
  }
}
