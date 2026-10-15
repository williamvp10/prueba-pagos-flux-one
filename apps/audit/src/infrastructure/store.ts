import { DataSource, MigrationInterface, QueryRunner } from "typeorm";
import { isDeepStrictEqual } from "node:util";
import { env } from "@fluxone/backend-kit";
import { AuditStore, TransferAccess, AuditFault } from "../domain/ports";
export class AuditMigration1792073600002 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "CREATE TABLE audit_events(event_id uuid PRIMARY KEY,transfer_id uuid NOT NULL,sequence integer NOT NULL,payload jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),UNIQUE(transfer_id,sequence))",
    );
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE audit_events");
  }
}
export class PgAuditStore implements AuditStore {
  constructor(private db: DataSource) {}
  async persist(event: any) {
    return this.db.transaction(async (m) => {
      const inserted = await m.query(
        "INSERT INTO audit_events(event_id,transfer_id,sequence,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
        [event.eventId, event.transferId, event.sequence, event],
      );
      if (inserted.length) return;
      const [old] = await m.query(
        "SELECT payload FROM audit_events WHERE event_id=$1 OR (transfer_id=$2 AND sequence=$3)",
        [event.eventId, event.transferId, event.sequence],
      );
      if (!old || !isDeepStrictEqual(old.payload, event))
        throw new AuditFault(422, "EVENT_IDENTITY_CONFLICT");
    });
  }
  async page(id: string, limit: number, after: number) {
    const rows = await this.db.query(
      "SELECT * FROM audit_events WHERE transfer_id=$1 AND sequence>$2 ORDER BY sequence ASC LIMIT $3",
      [id, after, limit + 1],
    );
    const selected = rows.slice(0, limit);
    return {
      items: selected.map((r: any) => ({
        eventId: r.event_id,
        transferId: r.transfer_id,
        sequence: r.sequence,
        type: r.payload.type,
        actorId: r.payload.actorId,
        occurredAt: r.payload.occurredAt,
        receivedAt: new Date(r.received_at).toISOString(),
        correlationId: r.payload.correlationId,
        transferStatus: r.payload.data.transferStatus,
        reversalId: r.payload.data.reversalId,
        reversalStatus: r.payload.data.reversalStatus,
      })),
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({ after: selected.at(-1).sequence, id }),
            ).toString("base64url")
          : null,
    };
  }
}
export class PaymentsAccess implements TransferAccess {
  async check(token: string, id: string) {
    let response: Response;
    try {
      response = await fetch(
        `${env("PAYMENTS_API_URL", "http://localhost:3002/api/v1")}/transfers/${id}`,
        {
          headers: { Authorization: token },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new AuditFault(503, "AUTHORIZATION_UNAVAILABLE");
    }
    if (response.status === 404)
      throw new AuditFault(404, "RESOURCE_NOT_FOUND");
    if (response.status === 401) throw new AuditFault(401, "UNAUTHORIZED");
    if (response.status !== 200)
      throw new AuditFault(503, "AUTHORIZATION_UNAVAILABLE");
  }
}
