import {
  Identifiers,
  PaymentLink,
  PaymentLinkReader,
  PaymentLinkSigner,
  PaymentLinkSummary,
  Result,
  Transaction,
  UnitOfWork,
  Transfer,
} from "../domain/ports";
import {
  amount,
  ensureCredit,
  ensureFunds,
  money,
  PaymentFault,
} from "../domain/money";

const DAY_MS = 24 * 60 * 60 * 1000;
const activeFault = (link: PaymentLink): PaymentFault =>
  link.status === "EXPIRED"
    ? new PaymentFault(409, "PAYMENT_LINK_EXPIRED")
    : link.status === "PAID"
      ? new PaymentFault(409, "PAYMENT_LINK_ALREADY_PAID")
      : new PaymentFault(409, "PAYMENT_LINK_NOT_ACTIVE");

export function paymentLinkView({ link, destinationCode }: PaymentLinkSummary) {
  return {
    id: link.id,
    destination: {
      accountId: link.destinationAccount,
      code: destinationCode,
      label: destinationCode,
    },
    amount: money(link.amount),
    currency: "COP",
    status: link.status,
    expiresAt: link.expiresAt,
    paidTransferId: link.paidTransferId,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

export class PaymentLinks {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly ids: Identifiers,
    private readonly signer: PaymentLinkSigner,
    private readonly queries: PaymentLinkReader,
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
      const existing = await tx.claim(actor, operation, key, this.ids.hash(payload));
      if (existing) {
        if (existing.body?.code && !existing.body.requestId)
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

  private async liveLink(tx: Transaction, link: PaymentLink) {
    if (link.status === "ACTIVE" && Date.parse(link.expiresAt) <= Date.parse(this.ids.now())) {
      link.status = "EXPIRED";
      await tx.updatePaymentLink(link);
      throw new PaymentFault(409, "PAYMENT_LINK_EXPIRED");
    }
    if (link.status !== "ACTIVE") throw activeFault(link);
  }

  async create(
    actor: string,
    key: string,
    input: { destinationAccountId: string; amount: string; currency: "COP" },
    requestId: string,
  ) {
    const minor = amount(input.amount);
    const destinationId = input.destinationAccountId.toLowerCase();
    const canonical = {
      destinationAccountId: destinationId,
      amount: money(minor),
      currency: "COP",
    };
    return this.command(actor, "CREATE_PAYMENT_LINK", key, canonical, requestId, async (tx) => {
      const destination = await tx.findAccount(destinationId);
      if (!destination || destination.owner !== actor)
        throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
      const now = this.ids.now();
      const link: PaymentLink = {
        id: this.ids.uuid(),
        creator: actor,
        destinationAccount: destination.id,
        amount: minor,
        status: "ACTIVE",
        payer: null,
        paidTransferId: null,
        expiresAt: new Date(Date.parse(now) + DAY_MS).toISOString(),
        cancelledAt: null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
        correlation: requestId,
      };
      await tx.insertPaymentLink(link);
      return {
        status: 201,
        body: paymentLinkView({ link, destinationCode: destination.code }),
      };
    });
  }

  async list(actor: string, limit: number, status?: string, cursor?: string) {
    const page = await this.queries.list(actor, limit, status, cursor);
    return { items: page.items.map(paymentLinkView), nextCursor: page.nextCursor };
  }

  async get(actor: string, id: string) {
    return paymentLinkView(await this.queries.get(actor, id));
  }

  async shareToken(actor: string, id: string) {
    const result = await this.queries.getForCreator(actor, id);
    if (!result) throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
    const link = result.link;
    if (
      link.status === "ACTIVE" &&
      Date.parse(link.expiresAt) <= Date.parse(this.ids.now())
    )
      throw new PaymentFault(409, "PAYMENT_LINK_EXPIRED");
    if (link.status !== "ACTIVE") throw activeFault(link);
    return { token: this.signer.issue(link.id) };
  }

  async resolve(token: string) {
    const linkId = this.signer.verify(token);
    if (!linkId) throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
    return this.queries.resolve(linkId);
  }

  async pay(
    actor: string,
    key: string,
    input: { token: string; sourceAccountId: string },
    requestId: string,
  ) {
    const linkId = this.signer.verify(input.token);
    if (!linkId) throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
    const sourceId = input.sourceAccountId.toLowerCase();
    return this.command(
      actor,
      "PAY_PAYMENT_LINK",
      key,
      { linkId, sourceAccountId: sourceId },
      requestId,
      async (tx) => {
        const link = await tx.paymentLink(linkId, true);
        if (!link) throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        await this.liveLink(tx, link);
        const sourceOriginal = await tx.findAccount(sourceId);
        if (!sourceOriginal || sourceOriginal.owner !== actor)
          throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        if (sourceId === link.destinationAccount)
          throw new PaymentFault(422, "SAME_ACCOUNT");
        const accounts = await tx.lockAccounts([sourceId, link.destinationAccount]);
        const source = accounts.find((account) => account.id === sourceId)!;
        const destination = accounts.find((account) => account.id === link.destinationAccount)!;
        if (!source || !destination) throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        ensureFunds(source.balance, source.reserved, link.amount);
        ensureCredit(destination.balance, link.amount);

        const now = this.ids.now();
        const transfer: Transfer = {
          id: this.ids.uuid(),
          actor,
          source: source.id,
          kind: "INTERNAL",
          destination: destination.code,
          paymentLinkId: link.id,
          amount: link.amount,
          status: "PENDING",
          sequence: 0,
          bankRef: this.ids.uuid(),
          correlation: requestId,
          createdAt: now,
          updatedAt: now,
          failureCode: null,
        };
        await tx.insertTransfer(transfer);
        await tx.event(transfer, "transfer.created");
        await tx.changeAccount(source.id, -link.amount, 0n);
        await tx.changeAccount(destination.id, link.amount, 0n);
        await tx.ledger(`${transfer.id}:debit`, source.id, "DEBIT", link.amount, transfer.id);
        await tx.ledger(`${transfer.id}:credit`, destination.id, "CREDIT", link.amount, transfer.id);
        transfer.status = "COMPLETED";
        await tx.updateTransfer(transfer);
        await tx.event(transfer, "transfer.completed");

        link.status = "PAID";
        link.payer = actor;
        link.paidAt = now;
        link.paidTransferId = transfer.id;
        await tx.updatePaymentLink(link);
        const view = paymentLinkView({ link, destinationCode: destination.code });
        return {
          status: 201,
          body: {
            paymentLink: view,
            transfer: {
              id: transfer.id,
              sourceAccountId: transfer.source,
              origin: "PAYMENT_LINK",
              paymentLinkId: link.id,
              destination: { kind: "INTERNAL", code: destination.code, label: destination.code },
              amount: money(transfer.amount),
              currency: "COP",
              status: transfer.status,
              failureCode: null,
              reversal: null,
              createdAt: transfer.createdAt,
              updatedAt: transfer.updatedAt,
            },
          },
        };
      },
    );
  }

  async cancel(actor: string, key: string, id: string, requestId: string) {
    return this.command(
      actor,
      "CANCEL_PAYMENT_LINK",
      key,
      { paymentLinkId: id.toLowerCase() },
      requestId,
      async (tx) => {
        const link = await tx.paymentLink(id, true);
        if (!link || link.creator !== actor)
          throw new PaymentFault(404, "RESOURCE_NOT_FOUND");
        if (link.status === "CANCELLED") {
          const destination = await tx.findAccount(link.destinationAccount);
          return { status: 200, body: paymentLinkView({ link, destinationCode: destination!.code }) };
        }
        await this.liveLink(tx, link);
        link.status = "CANCELLED";
        link.cancelledAt = this.ids.now();
        await tx.updatePaymentLink(link);
        const destination = await tx.findAccount(link.destinationAccount);
        return { status: 200, body: paymentLinkView({ link, destinationCode: destination!.code }) };
      },
    );
  }
}
