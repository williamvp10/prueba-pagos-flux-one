export type State =
  | "PENDING"
  | "PROCESSING"
  | "UNKNOWN"
  | "COMPLETED"
  | "FAILED"
  | "REVERSED";
export type Account = {
  id: string;
  code: string;
  owner: string;
  balance: bigint;
  reserved: bigint;
};
export type Transfer = {
  id: string;
  actor: string;
  source: string;
  kind: "INTERNAL" | "EXTERNAL";
  destination: string;
  amount: bigint;
  status: State;
  sequence: number;
  bankRef: string;
  correlation: string;
  createdAt: string;
  updatedAt: string;
  failureCode: string | null;
};
export type Reversal = {
  id: string;
  transferId: string;
  amount: bigint;
  status: State;
  bankRef: string;
  createdAt: string;
  updatedAt: string;
  failureCode: string | null;
};
export type Result = { status: number; body: any; replayed?: boolean };
export interface Transaction {
  claim(
    actor: string,
    operation: string,
    key: string,
    hash: string,
  ): Promise<Result | null>;
  saveResult(
    actor: string,
    operation: string,
    key: string,
    result: Result,
  ): Promise<void>;
  findAccount(id: string): Promise<Account | null>;
  byCode(code: string): Promise<Account | null>;
  lockAccounts(ids: string[]): Promise<Account[]>;
  changeAccount(
    id: string,
    balanceDelta: bigint,
    reserveDelta: bigint,
  ): Promise<void>;
  transfer(id: string, lock?: boolean): Promise<Transfer | null>;
  insertTransfer(t: Transfer): Promise<void>;
  updateTransfer(t: Transfer): Promise<void>;
  latestReversal(id: string): Promise<Reversal | null>;
  insertReversal(r: Reversal): Promise<void>;
  updateReversal(r: Reversal): Promise<void>;
  ledger(
    operation: string,
    account: string,
    direction: "DEBIT" | "CREDIT",
    amount: bigint,
    transferId: string,
    reversalId?: string,
  ): Promise<void>;
  event(t: Transfer, type: string, r?: Reversal): Promise<void>;
}
export interface UnitOfWork {
  run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
}
export interface Identifiers {
  uuid(): string;
  hash(payload: unknown): string;
  now(): string;
}

export type BankResult =
  | "ACCEPTED"
  | "REJECTED"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "NOT_FOUND";
export interface BankRail {
  lookup(t: Transfer, r: Reversal | null): Promise<BankResult>;
  submit(
    t: Transfer,
    r: Reversal | null,
    sourceCode: string,
  ): Promise<BankResult>;
}
