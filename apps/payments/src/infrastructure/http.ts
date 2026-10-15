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
import { PgQueries } from "./store";
@Controller("api/v1")
@UseGuards(JwtGuard)
export class PaymentsController {
  constructor(
    @Inject(Payments) private payments: Payments,
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
