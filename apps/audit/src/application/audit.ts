import { AuditStore, TransferAccess } from "../domain/ports";
export class ReadAudit {
  constructor(
    private store: AuditStore,
    private access: TransferAccess,
  ) {}
  async execute(token: string, id: string, limit: number, after: number) {
    await this.access.check(token, id);
    return this.store.page(id, limit, after);
  }
}
