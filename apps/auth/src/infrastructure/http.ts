import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  Inject,
} from "@nestjs/common";
import {
  ApiError,
  JwtGuard,
  UserRequest,
  validate,
} from "@fluxone/backend-kit";
import { AuthUseCases } from "../application/auth";
const hits = new Map<string, { n: number; until: number }>();
function limit(req: UserRequest) {
  const key = req.ip ?? "unknown",
    now = Date.now();
  let item = hits.get(key);
  if (!item || item.until < now) {
    item = { n: 0, until: now + 60000 };
    hits.set(key, item);
  }
  if (++item.n > 30) throw new ApiError(429, "TOO_MANY_ATTEMPTS");
  if (hits.size > 10000)
    for (const [k, v] of hits) if (v.until < now) hits.delete(k);
}
@Controller("api/v1/auth")
export class AuthController {
  constructor(@Inject(AuthUseCases) private auth: AuthUseCases) {}
  @Post("register") async register(
    @Body() body: unknown,
    @Req() req: UserRequest,
  ) {
    limit(req);
    const b = validate("Credentials", body);
    return this.auth.register(b.email, b.password);
  }
  @Post("login") @HttpCode(200) async login(
    @Body() body: unknown,
    @Req() req: UserRequest,
  ) {
    limit(req);
    const b = validate("Credentials", body);
    return this.auth.login(b.email, b.password);
  }
  @Post("refresh") @HttpCode(200) async refresh(
    @Body() body: unknown,
    @Req() req: UserRequest,
  ) {
    limit(req);
    return this.auth.refresh(validate("RefreshRequest", body).refreshToken);
  }
  @Post("logout") @HttpCode(204) async logout(@Body() body: unknown) {
    await this.auth.logout(validate("RefreshRequest", body).refreshToken);
  }
  @Get("me") @UseGuards(JwtGuard) me(@Req() req: UserRequest) {
    return this.auth.me(req.user.sub);
  }
}
