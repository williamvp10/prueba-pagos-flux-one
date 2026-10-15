import {
  Controller,
  Get,
  Param,
  Req,
  Query,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  ApiError,
  JwtGuard,
  UserRequest,
  assertUUID,
  pageArgs,
} from "@fluxone/backend-kit";
import { ReadAudit } from "../application/audit";
import { AuditConsumer } from "./consumer";
@Controller("api/v1/transfers")
@UseGuards(JwtGuard)
export class AuditController {
  constructor(@Inject(ReadAudit) private read: ReadAudit) {}
  @Get(":id/audit") async events(
    @Param("id") id: string,
    @Req() req: UserRequest,
    @Query() query: Record<string, any>,
  ) {
    id = assertUUID(id);
    const limit = pageArgs(query);
    if (query.status) throw new ApiError(422, "VALIDATION_ERROR");
    let after = 0;
    if (query.cursor) {
      try {
        const c = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
        if (c.id !== id || !Number.isInteger(c.after) || c.after < 0)
          throw Error();
        after = c.after;
      } catch {
        throw new ApiError(422, "VALIDATION_ERROR");
      }
    }
    return this.read.execute(req.headers.authorization!, id, limit, after);
  }
}
@Controller("health")
export class AuditHealth {
  constructor(
    @Inject(DataSource) private db: DataSource,
    @Inject(AuditConsumer) private consumer: AuditConsumer,
  ) {}
  @Get("live") live() {
    return { status: "ok", service: "audit" };
  }
  @Get("ready") async ready() {
    await this.db.query("SELECT 1");
    if (!this.consumer.ready) throw new ApiError(503, "BROKER_UNAVAILABLE");
    return this.live();
  }
}
