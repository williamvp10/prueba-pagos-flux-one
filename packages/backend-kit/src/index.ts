import "reflect-metadata";
import {
  Catch,
  Controller,
  Get,
  HttpException,
  ArgumentsHost,
  ExceptionFilter,
  Injectable,
  CanActivate,
  ExecutionContext,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, OpenAPIObject } from "@nestjs/swagger";
import { DataSource, MigrationInterface } from "typeorm";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import * as yaml from "js-yaml";
import * as jwt from "jsonwebtoken";
import Ajv from "ajv";
import formats from "ajv-formats";
import * as amqp from "amqplib";
import type { Request, Response, NextFunction } from "express";
export type UserRequest = Request & {
  user: { sub: string };
  requestId: string;
};
export function rootPath() {
  let p = process.cwd();
  while (!existsSync(resolve(p, "docs/openapi.yaml"))) {
    const next = dirname(p);
    if (next === p) throw new Error("Missing API contract");
    p = next;
  }
  return p;
}
export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing configuration ${name}`);
  return v;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = code,
    public details?: unknown[],
  ) {
    super(message);
  }
}
export function failure(status: number, code: string, message = code) {
  return { status, body: { code, message } };
}
@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<UserRequest>();
    const res = ctx.getResponse<Response>();
    let status = 503,
      code = "SERVICE_UNAVAILABLE",
      message = "No fue posible completar la solicitud";
    let details: unknown[] | undefined;
    if (
      error instanceof ApiError ||
      (error instanceof Error && "status" in error && "code" in error)
    ) {
      const e = error as ApiError;
      status = e.status;
      code = e.code;
      message = e.message;
      details = e.details;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code =
        status === 400
          ? "INVALID_REQUEST"
          : status === 404
            ? "RESOURCE_NOT_FOUND"
            : "REQUEST_ERROR";
      message = code;
    } else
      console.error(
        JSON.stringify({
          level: "error",
          requestId: req.requestId,
          error: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    if (status === 429 || status === 503) res.setHeader("Retry-After", "2");
    res
      .status(status)
      .json({
        code,
        message,
        requestId: req.requestId,
        ...(details ? { details } : {}),
      });
  }
}
export const apiContract = () =>
  yaml.load(
    readFileSync(resolve(rootPath(), "docs/openapi.yaml"), "utf8"),
  ) as OpenAPIObject;
export function serviceDocument(tag: string): OpenAPIObject {
  const doc = structuredClone(apiContract());
  doc.info.title = `Flux One ${tag}`;
  doc.servers = [{ url: "/api/v1" }];
  doc.paths = Object.fromEntries(
    Object.entries(doc.paths)
      .map(([path, item]) => [
        path,
        Object.fromEntries(
          Object.entries(item ?? {})
            .filter(
              ([verb, op]) =>
                typeof op === "object" &&
                op &&
                "tags" in op &&
                (op as any).tags?.includes(tag),
            )
            .map(([verb, op]) => {
              const operation = { ...(op as any) };
              delete operation.servers;
              return [verb, operation];
            }),
        ),
      ])
      .filter(([, item]) => Object.keys(item as object).length),
  );
  doc.tags = doc.tags?.filter((t) => t.name === tag);
  const original = doc.components ?? {},
    selected: Record<string, Record<string, unknown>> = {},
    seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (
        key === "$ref" &&
        typeof item === "string" &&
        item.startsWith("#/components/")
      ) {
        const [, , kind, name] = item.split("/");
        if (seen.has(item)) continue;
        seen.add(item);
        const component = (original as any)[kind]?.[name];
        if (component) {
          (selected[kind] ??= {})[name] = component;
          visit(component);
        }
      } else visit(item);
    }
  };
  visit(doc.paths);
  selected.securitySchemes = {
    bearerAuth: (original.securitySchemes as any).bearerAuth,
  };
  doc.components = selected;
  return doc;
}
const ajv = new Ajv({ allErrors: true, strict: false });
formats(ajv);
ajv.addSchema({ components: apiContract().components }, "api");
export function validate<T = any>(schema: string, value: unknown): T {
  const fn = ajv.getSchema(`api#/components/schemas/${schema}`);
  if (!fn) throw new Error(`Missing schema ${schema}`);
  if (!fn(value))
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Revisa los datos enviados",
      fn.errors?.map((e) => ({
        field: e.instancePath || "body",
        message: e.message,
      })),
    );
  return value as T;
}
export function assertUUID(v: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    throw new ApiError(422, "VALIDATION_ERROR", "UUID inválido");
  return v.toLowerCase();
}
export function keyOf(req: Request) {
  const value = req.header("Idempotency-Key");
  if (!value) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED");
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value))
    throw new ApiError(400, "IDEMPOTENCY_KEY_INVALID");
  return value;
}
export function publicKey() {
  return Buffer.from(env("JWT_PUBLIC_KEY_B64"), "base64").toString();
}
@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<UserRequest>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new ApiError(401, "UNAUTHORIZED");
    try {
      const claims = jwt.verify(token, publicKey(), {
        algorithms: ["RS256"],
        issuer: env("JWT_ISSUER", "fluxone-auth"),
        audience: env("JWT_AUDIENCE", "fluxone"),
      });
      if (typeof claims === "string" || !claims.sub)
        throw new Error("Invalid subject");
      assertUUID(claims.sub);
      req.user = { sub: claims.sub };
      return true;
    } catch {
      throw new ApiError(401, "UNAUTHORIZED");
    }
  }
}
export function database(
  service: "auth" | "payments" | "audit",
  migrations: (new () => MigrationInterface)[] = [],
  migrator = false,
) {
  const prefix = service.toUpperCase();
  return new DataSource({
    type: "postgres",
    host: env("DB_HOST", "localhost"),
    port: Number(env("DB_PORT", "5432")),
    database: env("POSTGRES_DB", "fluxone"),
    username: env(`${prefix}_${migrator ? "MIGRATION" : "DB"}_USER`),
    password: env(`${prefix}_${migrator ? "MIGRATION" : "DB"}_PASSWORD`),
    schema: service === "payments" ? "payment_schema" : `${service}_schema`,
    synchronize: false,
    migrations,
    extra: {
      max: 15,
      connectionTimeoutMillis: 3000,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 20000,
    },
  });
}
export async function connectBroker() {
  const conn = await amqp.connect(env("AMQP_URL"));
  const channel = await conn.createConfirmChannel();
  await channel.assertExchange("fluxone.audit.v1", "topic", { durable: true });
  await channel.assertQueue("fluxone.audit.v1.persist", { durable: true });
  await channel.bindQueue(
    "fluxone.audit.v1.persist",
    "fluxone.audit.v1",
    "transfer.#",
  );
  await channel.assertExchange("fluxone.audit.v1.dead", "fanout", {
    durable: true,
  });
  await channel.assertQueue("fluxone.audit.v1.dead", { durable: true });
  await channel.bindQueue("fluxone.audit.v1.dead", "fluxone.audit.v1.dead", "");
  return { conn, channel };
}
export async function launch(module: any, tag: string, port: number) {
  const app = await NestFactory.create(module, {
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  app.use((req: UserRequest, res: Response, next: NextFunction) => {
    const provided = req.header("X-Request-Id");
    req.requestId =
      provided && /^[\w.:-]{1,128}$/.test(provided) ? provided : randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.useGlobalFilters(new Errors());
  SwaggerModule.setup("docs", app, serviceDocument(tag), {
    jsonDocumentUrl: "docs-json",
    swaggerOptions: { persistAuthorization: false },
  });
  await app.listen(Number(process.env.PORT ?? port), "0.0.0.0");
  return app;
}
export function pageArgs(query: Record<string, any>) {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    Object.keys(query).some((k) => !["limit", "cursor", "status"].includes(k))
  )
    throw new ApiError(422, "VALIDATION_ERROR");
  return limit;
}
@Controller("health")
export class HealthController {
  constructor(private readonly db: DataSource) {}
  @Get("live") live() {
    return { status: "ok", service: process.env.SERVICE_NAME ?? "backend" };
  }
  @Get("ready") async ready() {
    await this.db.query("SELECT 1");
    return this.live();
  }
}
