import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as yaml from "js-yaml";
import Ajv from "ajv";
import formats from "ajv-formats";
import { rootPath, env } from "@fluxone/backend-kit";
import { Transfer, Reversal, BankResult, BankRail } from "../domain/ports";
import { money } from "../domain/money";
export class HttpBank implements BankRail {
  private ajv = new Ajv({ strict: false });
  private base = env("RAIL_API_URL", "http://localhost:3004");
  constructor() {
    formats(this.ajv);
    const doc = yaml.load(
      readFileSync(resolve(rootPath(), "docs/rail.openapi.yaml"), "utf8"),
    ) as any;
    this.ajv.addSchema({ components: doc.components }, "rail");
  }
  private valid(name: string, body: unknown) {
    return (
      this.ajv.getSchema(`rail#/components/schemas/${name}`)?.(body) ?? false
    );
  }
  async lookup(t: Transfer, r: Reversal | null): Promise<BankResult> {
    try {
      const res = await fetch(`${this.base}/rail/transfers/${t.bankRef}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404) return "NOT_FOUND";
      if (res.status !== 200) return "UNKNOWN";
      const b = (await res.json()) as any;
      if (
        !this.valid("RailTransfer", b) ||
        b.reference !== t.bankRef ||
        b.amount !== money(t.amount)
      )
        return "UNKNOWN";
      if (!r) return b.status;
      if (!b.reversal || b.reversal.reference !== r.bankRef) return "NOT_FOUND";
      return b.reversal.status;
    } catch {
      return "UNKNOWN";
    }
  }
  async submit(
    t: Transfer,
    r: Reversal | null,
    sourceCode: string,
  ): Promise<BankResult> {
    try {
      const payload = r
        ? {
            reference: r.bankRef,
            originalReference: t.bankRef,
            amount: money(t.amount),
          }
        : {
            reference: t.bankRef,
            from: sourceCode,
            to: t.destination,
            amount: money(t.amount),
          };
      const res = await fetch(
        `${this.base}/rail/${r ? "reversals" : "transfers"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (res.status === 503) return "UNAVAILABLE";
      if (![200, 422].includes(res.status)) return "UNKNOWN";
      const b = (await res.json()) as any;
      if (
        !this.valid(r ? "RailReversal" : "RailTransfer", b) ||
        b.reference !== (r?.bankRef ?? t.bankRef) ||
        b.amount !== money(t.amount) ||
        b.status !== (res.status === 200 ? "ACCEPTED" : "REJECTED")
      )
        return "UNKNOWN";
      return b.status;
    } catch {
      return "UNKNOWN";
    }
  }
}
