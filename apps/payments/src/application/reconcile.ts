import { Transaction, Transfer, Reversal, BankResult } from "../domain/ports";
import { ensureCredit } from "../domain/money";
export async function startBankAttempt(
  tx: Transaction,
  t: Transfer,
  r: Reversal | null,
) {
  if ((r ?? t).status === "PROCESSING") return;
  if (r) {
    r.status = "PROCESSING";
    await tx.updateReversal(r);
    await tx.event(t, "reversal.processing", r);
  } else {
    t.status = "PROCESSING";
    await tx.updateTransfer(t);
    await tx.event(t, "transfer.processing");
  }
}
export async function settleBankResult(
  tx: Transaction,
  t: Transfer,
  r: Reversal | null,
  result: BankResult,
) {
  const target = r ?? t;
  if (result === "ACCEPTED") {
    const [source] = await tx.lockAccounts([t.source]);
    if (r) {
      ensureCredit(source.balance, t.amount);
      await tx.changeAccount(t.source, t.amount, 0n);
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
    } else {
      await tx.changeAccount(t.source, -t.amount, -t.amount);
      await tx.ledger(`${t.id}:debit`, t.source, "DEBIT", t.amount, t.id);
      t.status = "COMPLETED";
      await tx.updateTransfer(t);
      await tx.event(t, "transfer.completed");
    }
  } else if (result === "REJECTED") {
    target.status = "FAILED";
    target.failureCode = r ? "BANK_REVERSAL_REJECTED" : "BANK_REJECTED";
    if (!r) {
      await tx.lockAccounts([t.source]);
      await tx.changeAccount(t.source, 0n, -t.amount);
    }
    if (r) await tx.updateReversal(r);
    else await tx.updateTransfer(t);
    await tx.event(
      t,
      r ? "reversal.failed" : "transfer.failed",
      r ?? undefined,
    );
  } else {
    target.status = result === "UNAVAILABLE" ? "PENDING" : "UNKNOWN";
    if (r) await tx.updateReversal(r);
    else await tx.updateTransfer(t);
    await tx.event(
      t,
      `${r ? "reversal" : "transfer"}.${target.status.toLowerCase()}`,
      r ?? undefined,
    );
  }
}
