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
export type PaymentLinkStatus = "ACTIVE" | "PAID" | "CANCELLED" | "EXPIRED";
export type PaymentLink = {
  id: string;
  creator: string;
  destinationAccount: string;
  amount: bigint;
  status: PaymentLinkStatus;
  payer: string | null;
  paidTransferId: string | null;
  expiresAt: string;
  cancelledAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  correlation: string;
};
export type Transfer = {
  id: string;
  actor: string;
  source: string;
  kind: "INTERNAL" | "EXTERNAL";
  destination: string;
  paymentLinkId?: string | null;
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
  paymentLink(id: string, lock?: boolean): Promise<PaymentLink | null>;
  insertPaymentLink(link: PaymentLink): Promise<void>;
  updatePaymentLink(link: PaymentLink): Promise<void>;
}
export interface UnitOfWork {
  run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
}
export interface Identifiers {
  uuid(): string;
  hash(payload: unknown): string;
  now(): string;
}
export interface PaymentLinkSigner {
  issue(linkId: string): string;
  verify(token: string): string | null;
}
export type PaymentLinkSummary = {
  link: PaymentLink;
  destinationCode: string;
};
export type PaymentLinkCheckout = {
  linkId: string;
  destination: { code: string; label: string };
  amount: string;
  currency: "COP";
  expiresAt: string;
};
export interface PaymentLinkReader {
  get(actor: string, id: string): Promise<PaymentLinkSummary>;
  getForCreator(
    actor: string,
    id: string,
  ): Promise<PaymentLinkSummary | null>;
  resolve(id: string): Promise<PaymentLinkCheckout>;
  list(
    actor: string,
    limit: number,
    status?: string,
    cursor?: string,
  ): Promise<{ items: PaymentLinkSummary[]; nextCursor: string | null }>;
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
