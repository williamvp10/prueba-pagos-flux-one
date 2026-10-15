import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Res,
  Query,
  Inject,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import type { Response } from "express";
import {
  ApiError,
  JwtGuard,
  UserRequest,
  validate,
  keyOf,
  assertUUID,
  pageArgs,
} from "@fluxone/backend-kit";
import { Payments, accountView, transferView } from "../application/payments";
import { PaymentLinks } from "../application/payment-links";
import { PgQueries } from "./store";
@Controller("api/v1")
@UseGuards(JwtGuard)
export class PaymentsController {
  constructor(
    @Inject(Payments) private payments: Payments,
    @Inject(PaymentLinks) private paymentLinks: PaymentLinks,
    @Inject(PgQueries) private queries: PgQueries,
  ) {}
  @Get("accounts") async accounts(@Req() req: UserRequest) {
    return (await this.queries.accounts(req.user.sub)).map(accountView);
  }
  @Post("accounts/bootstrap") async bootstrap(
    @Req() req: UserRequest,
    @Res() res: Response,
  ) {
    const result = await this.queries.bootstrap(req.user.sub);
    return res
      .status(result.created ? 201 : 200)
      .json(accountView(result.account));
  }
  @Get("beneficiaries") beneficiaries() {
    return this.queries.beneficiaries();
  }
  @Post("transfers") async create(
    @Body() body: unknown,
    @Req() req: UserRequest,
    @Res() res: Response,
  ) {
    const key = keyOf(req);
    const value = validate("CreateTransfer", body);
    const result = await this.payments.create(
      req.user.sub,
      key,
      value,
      req.requestId,
    );
    return res
      .status(result.status)
      .setHeader("Idempotency-Replayed", String(!!result.replayed))
      .json(result.body);
  }
  @Post("payment-links") async createPaymentLink(
    @Body() body: unknown,
    @Req() req: UserRequest,
    @Res() res: Response,
  ) {
    const result = await this.paymentLinks.create(
      req.user.sub,
      keyOf(req),
      validate("CreatePaymentLink", body),
      req.requestId,
    );
    return res
      .status(result.status)
      .setHeader("Idempotency-Replayed", String(!!result.replayed))
      .json(result.body);
  }
  @Get("payment-links") async paymentLinkList(
    @Query() query: Record<string, any>,
    @Req() req: UserRequest,
  ) {
    const limit = pageArgs(query);
    if (query.status && !["ACTIVE", "PAID", "CANCELLED", "EXPIRED"].includes(query.status))
      throw new ApiError(422, "VALIDATION_ERROR");
    return this.paymentLinks.list(req.user.sub, limit, query.status, query.cursor);
  }
  @Post("payment-links/resolve")
  @HttpCode(200)
  async resolvePaymentLink(@Body() body: unknown) {
    const value = validate<{ token: string }>("ResolvePaymentLink", body);
    return this.paymentLinks.resolve(value.token);
  }
  @Post("payment-links/pay") async payPaymentLink(
    @Body() body: unknown,
    @Req() req: UserRequest,
    @Res() res: Response,
  ) {
    const result = await this.paymentLinks.pay(
      req.user.sub,
      keyOf(req),
      validate("PayPaymentLink", body),
      req.requestId,
    );
    return res
      .status(result.status)
      .setHeader("Idempotency-Replayed", String(!!result.replayed))
      .json(result.body);
  }
  @Get("payment-links/:id") async paymentLinkDetail(
    @Param("id") id: string,
    @Req() req: UserRequest,
  ) {
    return this.paymentLinks.get(req.user.sub, assertUUID(id));
  }
  @Get("payment-links/:id/share-token") async paymentLinkShareToken(
    @Param("id") id: string,
    @Req() req: UserRequest,
  ) {
    return this.paymentLinks.shareToken(req.user.sub, assertUUID(id));
  }
  @Post("payment-links/:id/cancel") async cancelPaymentLink(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: UserRequest,
    @Res() res: Response,
  ) {
    if (body && Object.keys(body).length)
      throw new ApiError(422, "VALIDATION_ERROR", "La cancelación no acepta body");
    const result = await this.paymentLinks.cancel(
      req.user.sub,
      keyOf(req),
      assertUUID(id),
      req.requestId,
    );
    return res
      .status(result.status)
      .setHeader("Idempotency-Replayed", String(!!result.replayed))
      .json(result.body);
  }
  @Get("transfers") async history(
    @Query() query: Record<string, any>,
    @Req() req: UserRequest,
  ) {
    const limit = pageArgs(query);
    if (
      query.status &&
      ![
        "PENDING",
        "PROCESSING",
        "UNKNOWN",
        "COMPLETED",
        "FAILED",
        "REVERSED",
      ].includes(query.status)
    )
      throw new ApiError(422, "VALIDATION_ERROR");
    const page = await this.queries.history(
      req.user.sub,
      limit,
      query.status,
      query.cursor,
    );
    return {
      items: page.items.map((item) => transferView(item.t, item.r)),
      nextCursor: page.nextCursor,
    };
  }
  @Get("transfers/:id") async detail(
    @Param("id") id: string,
    @Req() req: UserRequest,
  ) {
    const { t, r } = await this.queries.detail(req.user.sub, assertUUID(id));
    return transferView(t, r);
  }
  @Post("transfers/:id/reversals") async reverse(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: UserRequest,
    @Res() res: Response,
  ) {
    if (body && Object.keys(body).length)
      throw new ApiError(422, "VALIDATION_ERROR", "El reverso no acepta body");
    const result = await this.payments.reverse(
      req.user.sub,
      keyOf(req),
      assertUUID(id),
      req.requestId,
    );
    return res
      .status(result.status)
      .setHeader("Idempotency-Replayed", String(!!result.replayed))
      .json(result.body);
  }
}
