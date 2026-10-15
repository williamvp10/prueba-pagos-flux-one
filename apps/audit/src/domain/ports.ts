export interface AuditStore {
  page(
    transferId: string,
    limit: number,
    after: number,
  ): Promise<{ items: any[]; nextCursor: string | null }>;
}
export interface TransferAccess {
  check(token: string, transferId: string): Promise<void>;
}
export class AuditFault extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
