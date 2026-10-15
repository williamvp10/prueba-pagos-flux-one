import {
  Account,
  Transfer,
  Reversal,
  Transaction,
  UnitOfWork,
  Identifiers,
  Result,
} from "../domain/ports";
import {
  amount,
  money,
  PaymentFault,
  ensureFunds,
  ensureCredit,
} from "../domain/money";
export function reversalView(r: Reversal) {
  return {
    id: r.id,
    transferId: r.transferId,
    amount: money(r.amount),
    status: r.status,
    failureCode: r.failureCode,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
export function transferView(t: Transfer, r: Reversal | null) {
  return {
    id: t.id,
    sourceAccountId: t.source,
    origin: t.paymentLinkId ? "PAYMENT_LINK" : "DIRECT",
    paymentLinkId: t.paymentLinkId ?? null,
    destination: { kind: t.kind, code: t.destination, label: t.destination },
    amount: money(t.amount),
    currency: "COP",
    status: t.status,
    failureCode: t.failureCode,
    reversal: r ? reversalView(r) : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
export function accountView(a: Account) {
  return {
    id: a.id,
    code: a.code,
    currency: "COP",
    balance: money(a.balance),
    reserved: money(a.reserved),
    available: money(a.balance - a.reserved),
  };
}
export class Payments {
  constructor(
    private uow: UnitOfWork,
    private ids: Identifiers,
  ) {}
  private async command(
    actor: string,
    operation: string,
    key: string,
    payload: unknown,
    requestId: string,
    work: (tx: Transaction) => Promise<Result>,
  ) {
    return this.uow.run(async (tx) => {
      const existing = await tx.claim(
        actor,
        operation,
        key,
        this.ids.hash(payload),
      );
      if (existing) {
        if (existing.body.code && !existing.body.requestId)
          existing.body.requestId = requestId;
        return existing;
      }
      let result: Result;
      try {
        result = await work(tx);
      } catch (error) {
        if (!(error instanceof PaymentFault)) throw error;
        result = {
          status: error.status,
          body: { code: error.code, message: error.message, requestId },
        };
      }
      await tx.saveResult(actor, operation, key, result);
      return result;
    });
  }
  async create(
    actor: string,
    key: string,
    input: {
      sourceAccountId: string;
      destination: { kind: "INTERNAL" | "EXTERNAL"; code: string };
      amount: string;
      currency: "COP";
    },
    requestId: string,
  ) {
    const minor = amount(input.amount),
      sourceId = input.sourceAccountId.toLowerCase();
    const canonical = {
      sourceAccountId: sourceId,
      destination: {
        kind: input.destination.kind,
        code: input.destination.code,
      },
      amount: money(minor),
      currency: "COP",
    };
    return this.command(
      actor,
      "CREATE_TRANSFER",
      key,
      canonical,
      requestId,
      async (tx) => {
        const original = await tx.findAccount(sourceId);
        if (!original || original.owner !== actor)
          throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        const target =
          input.destination.kind === "INTERNAL"
            ? await tx.byCode(input.destination.code)
            : null;
        if (input.destination.kind === "INTERNAL" && !target)
          throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        if (
          input.destination.kind === "EXTERNAL" &&
          !["EXT-001", "EXT-002"].includes(input.destination.code)
        )
          throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        if (target?.id === sourceId)
          throw new PaymentFault(422, "SAME_ACCOUNT");
        const accounts = await tx.lockAccounts([
          sourceId,
          ...(target ? [target.id] : []),
        ]);
        const source = accounts.find((a) => a.id === sourceId)!;
        const destination = target
          ? accounts.find((a) => a.id === target.id)!
          : null;
        ensureFunds(source.balance, source.reserved, minor);
        if (destination) ensureCredit(destination.balance, minor);
        const now = this.ids.now(),
          t: Transfer = {
            id: this.ids.uuid(),
            actor,
            source: sourceId,
            kind: input.destination.kind,
            destination: input.destination.code,
            amount: minor,
            status: "PENDING",
            sequence: 0,
            bankRef: this.ids.uuid(),
            correlation: requestId,
            createdAt: now,
            updatedAt: now,
            failureCode: null,
          };
        await tx.insertTransfer(t);
        await tx.event(t, "transfer.created");
        if (destination) {
          await tx.changeAccount(sourceId, -minor, 0n);
          await tx.changeAccount(destination.id, minor, 0n);
          await tx.ledger(`${t.id}:debit`, sourceId, "DEBIT", minor, t.id);
          await tx.ledger(
            `${t.id}:credit`,
            destination.id,
            "CREDIT",
            minor,
            t.id,
          );
          t.status = "COMPLETED";
          await tx.updateTransfer(t);
          await tx.event(t, "transfer.completed");
        } else await tx.changeAccount(sourceId, 0n, minor);
        return { status: destination ? 201 : 202, body: transferView(t, null) };
      },
    );
  }

  async reverse(actor: string, key: string, id: string, requestId: string) {
    return this.command(
      actor,
      "CREATE_REVERSAL",
      key,
      { transferId: id.toLowerCase() },
      requestId,
      async (tx) => {
        const t = await tx.transfer(id, true);
        if (!t || t.actor !== actor)
          throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        if (t.status === "REVERSED")
          throw new PaymentFault(409, "ALREADY_REVERSED");
        if (t.status !== "COMPLETED")
          throw new PaymentFault(409, "INVALID_TRANSFER_STATE");
        const old = await tx.latestReversal(t.id);
        if (old && old.status !== "FAILED")
          throw new PaymentFault(
            409,
            old.status === "COMPLETED"
              ? "ALREADY_REVERSED"
              : "REVERSAL_IN_PROGRESS",
          );
        const destination =
          t.kind === "INTERNAL" ? await tx.byCode(t.destination) : null;
        if (destination) {
          const accounts = await tx.lockAccounts([t.source, destination.id]);
          const source = accounts.find((a) => a.id === t.source)!;
          const target = accounts.find((a) => a.id === destination.id)!;
          ensureFunds(target.balance, target.reserved, t.amount);
          ensureCredit(source.balance, t.amount);
        }
        const now = this.ids.now(),
          r: Reversal = {
            id: this.ids.uuid(),
            transferId: t.id,
            amount: t.amount,
            status: "PENDING",
            bankRef: this.ids.uuid(),
            createdAt: now,
            updatedAt: now,
            failureCode: null,
          };
        await tx.insertReversal(r);
        await tx.event(t, "reversal.requested", r);
        if (destination) {
          await tx.changeAccount(destination.id, -t.amount, 0n);
          await tx.changeAccount(t.source, t.amount, 0n);
          await tx.ledger(
            `${r.id}:debit`,
            destination.id,
            "DEBIT",
            t.amount,
            t.id,
            r.id,
          );
          await tx.ledger(
            `${r.id}:credit`,
            t.source,
            "CREDIT",
            t.amount,
            t.id,
            r.id,
          );
          r.status = "COMPLETED";
          await tx.updateReversal(r);
          await tx.event(t, "reversal.completed", r);
          t.status = "REVERSED";
          await tx.updateTransfer(t);
          await tx.event(t, "transfer.reversed", r);
        }
        return { status: destination ? 201 : 202, body: reversalView(r) };
      },
    );
  }
}
