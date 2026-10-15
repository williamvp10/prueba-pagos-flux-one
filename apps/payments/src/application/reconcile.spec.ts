import { test } from "node:test";
import { strict as assert } from "node:assert";
import { settleBankResult } from "./reconcile";
import { Account, Reversal, Transaction, Transfer } from "../domain/ports";

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: "transfer-1",
    actor: "user-1",
    source: "account-1",
    kind: "EXTERNAL",
    destination: "EXT-001",
    amount: 1250n,
    status: "PROCESSING",
    sequence: 0,
    bankRef: "bank-ref-1",
    correlation: "request-1",
    createdAt: "2026-10-15T12:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
    failureCode: null,
    ...overrides,
  };
}

function makeReversal(overrides: Partial<Reversal> = {}): Reversal {
  return {
    id: "reversal-1",
    transferId: "transfer-1",
    amount: 1250n,
    status: "PROCESSING",
    bankRef: "bank-reversal-1",
    createdAt: "2026-10-15T12:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
    failureCode: null,
    ...overrides,
  };
}

function makeSourceAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "account-1",
    code: "ACC-001",
    owner: "user-1",
    balance: 10000n,
    reserved: 1250n,
    ...overrides,
  };
}

function makeTransaction(accounts: Account[] = [makeSourceAccount()]) {
  const calls = {
    locks: [] as string[][],
    balanceChanges: [] as Array<[string, bigint, bigint]>,
    ledgers: [] as Array<[string, string, "DEBIT" | "CREDIT", bigint, string, string?]>,
    transferUpdates: [] as Transfer[],
    reversalUpdates: [] as Reversal[],
    events: [] as string[],
  };
  const tx = {
    lockAccounts: async (ids: string[]) => {
      calls.locks.push(ids);
      return accounts;
    },
    changeAccount: async (id: string, balanceDelta: bigint, reserveDelta: bigint) => {
      calls.balanceChanges.push([id, balanceDelta, reserveDelta]);
    },
    ledger: async (...args: [string, string, "DEBIT" | "CREDIT", bigint, string, string?]) => {
      calls.ledgers.push(args);
    },
    updateTransfer: async (transfer: Transfer) => {
      calls.transferUpdates.push({ ...transfer });
    },
    updateReversal: async (reversal: Reversal) => {
      calls.reversalUpdates.push({ ...reversal });
    },
    event: async (_transfer: Transfer, type: string) => {
      calls.events.push(type);
    },
  } as unknown as Transaction;
  return { tx, calls };
}

test("[RAIL-01] accepted external transfer debits once and releases its reservation", async () => {
  const transfer = makeTransfer();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, null, "ACCEPTED");

  assert.equal(transfer.status, "COMPLETED");
  assert.deepEqual(calls.balanceChanges, [["account-1", -1250n, -1250n]]);
  assert.deepEqual(calls.ledgers, [["transfer-1:debit", "account-1", "DEBIT", 1250n, "transfer-1"]]);
  assert.deepEqual(calls.events, ["transfer.completed"]);
});

test("[RAIL-02] rejected external transfer releases the reservation without debiting", async () => {
  const transfer = makeTransfer();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, null, "REJECTED");

  assert.equal(transfer.status, "FAILED");
  assert.equal(transfer.failureCode, "BANK_REJECTED");
  assert.deepEqual(calls.balanceChanges, [["account-1", 0n, -1250n]]);
  assert.deepEqual(calls.ledgers, []);
  assert.deepEqual(calls.events, ["transfer.failed"]);
});

test("[RAIL-03] unavailable bank leaves external transfer pending and funds reserved", async () => {
  const transfer = makeTransfer();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, null, "UNAVAILABLE");

  assert.equal(transfer.status, "PENDING");
  assert.deepEqual(calls.balanceChanges, []);
  assert.deepEqual(calls.ledgers, []);
  assert.deepEqual(calls.events, ["transfer.pending"]);
});

test("[RAIL-04][RAIL-05] ambiguous bank result keeps transfer unknown and funds reserved", async () => {
  const transfer = makeTransfer();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, null, "UNKNOWN");

  assert.equal(transfer.status, "UNKNOWN");
  assert.deepEqual(calls.balanceChanges, []);
  assert.deepEqual(calls.ledgers, []);
  assert.deepEqual(calls.events, ["transfer.unknown"]);
});

test("[REV-05] accepted external reversal credits the source and marks transfer reversed", async () => {
  const transfer = makeTransfer({ status: "COMPLETED" });
  const reversal = makeReversal();
  const { tx, calls } = makeTransaction([makeSourceAccount({ balance: 5000n, reserved: 0n })]);

  await settleBankResult(tx, transfer, reversal, "ACCEPTED");

  assert.equal(reversal.status, "COMPLETED");
  assert.equal(transfer.status, "REVERSED");
  assert.deepEqual(calls.balanceChanges, [["account-1", 1250n, 0n]]);
  assert.deepEqual(calls.ledgers, [["reversal-1:credit", "account-1", "CREDIT", 1250n, "transfer-1", "reversal-1"]]);
  assert.deepEqual(calls.events, ["reversal.completed", "transfer.reversed"]);
});

test("[REV-06] rejected external reversal fails without crediting the source", async () => {
  const transfer = makeTransfer({ status: "COMPLETED" });
  const reversal = makeReversal();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, reversal, "REJECTED");

  assert.equal(reversal.status, "FAILED");
  assert.equal(reversal.failureCode, "BANK_REVERSAL_REJECTED");
  assert.equal(transfer.status, "COMPLETED");
  assert.deepEqual(calls.balanceChanges, []);
  assert.deepEqual(calls.ledgers, []);
  assert.deepEqual(calls.events, ["reversal.failed"]);
});

test("[REV-07] unavailable bank leaves external reversal pending", async () => {
  const transfer = makeTransfer({ status: "COMPLETED" });
  const reversal = makeReversal();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, reversal, "UNAVAILABLE");

  assert.equal(reversal.status, "PENDING");
  assert.equal(transfer.status, "COMPLETED");
  assert.deepEqual(calls.balanceChanges, []);
  assert.deepEqual(calls.ledgers, []);
  assert.deepEqual(calls.events, ["reversal.pending"]);
});

test("[REV-08] ambiguous external reversal keeps the original transfer and reversal unresolved", async () => {
  const transfer = makeTransfer({ status: "COMPLETED" });
  const reversal = makeReversal();
  const { tx, calls } = makeTransaction();

  await settleBankResult(tx, transfer, reversal, "UNKNOWN");

  assert.equal(reversal.status, "UNKNOWN");
  assert.equal(transfer.status, "COMPLETED");
  assert.deepEqual(calls.balanceChanges, []);
  assert.deepEqual(calls.ledgers, []);
  assert.deepEqual(calls.events, ["reversal.unknown"]);
});
