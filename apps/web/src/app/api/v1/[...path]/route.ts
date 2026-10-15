import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ServiceComponents, BrowserComponents } from "@fluxone/api-client";

type Tokens = ServiceComponents["schemas"]["Tokens"];
type BrowserSession = BrowserComponents["schemas"]["BrowserSession"];
const ACCESS_COOKIE = "fluxone_access";
const REFRESH_COOKIE = "fluxone_refresh";
const accessTtl = 15 * 60;
const refreshTtl = 7 * 24 * 60 * 60;
const refreshInFlight = new Map<string, Promise<Tokens | null>>();

function upstreamFor(path: string): string | null {
  if (path.startsWith("/auth/")) return process.env.AUTH_API_URL ?? null;
  if (/^\/transfers\/[0-9a-f-]{36}\/audit$/i.test(path)) return process.env.AUDIT_API_URL ?? null;
  if (path.startsWith("/accounts") || path.startsWith("/beneficiaries") || path.startsWith("/transfers")) {
    return process.env.PAYMENTS_API_URL ?? null;
  }
  return null;
}

function allowed(path: string, method: string) {
  const route = `${method} ${path}`;
  if (["POST /auth/register", "POST /auth/login", "POST /auth/refresh", "POST /auth/logout", "GET /auth/me"].includes(route)) return true;
  if (["GET /accounts", "POST /accounts/bootstrap", "GET /beneficiaries", "GET /transfers", "POST /transfers"].includes(route)) return true;
  return /^GET \/transfers\/[0-9a-f-]{36}$/i.test(route)
    || /^GET \/transfers\/[0-9a-f-]{36}\/audit$/i.test(route)
    || /^POST \/transfers\/[0-9a-f-]{36}\/reversals$/i.test(route);
}

function originAllowed(request: NextRequest) {
  const configured = process.env.APP_ORIGIN;
  const origin = request.headers.get("origin");
  if (!configured || !origin) return process.env.NODE_ENV === "test";
  try { return new URL(origin).origin === new URL(configured).origin; }
  catch { return false; }
}

function secureCookie() {
  return process.env.APP_ORIGIN?.startsWith("https://") ?? false;
}

function setSessionCookies(response: NextResponse, tokens: Tokens) {
  const shared = { httpOnly: true, secure: secureCookie(), sameSite: "lax" as const, path: "/" };
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...shared, maxAge: accessTtl });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...shared, maxAge: refreshTtl });
}

function clearSessionCookies(response: NextResponse) {
  const shared = { httpOnly: true, secure: secureCookie(), sameSite: "lax" as const, path: "/", maxAge: 0 };
  response.cookies.set(ACCESS_COOKIE, "", shared);
  response.cookies.set(REFRESH_COOKIE, "", shared);
}

function sessionBody(tokens: Tokens): BrowserSession {
  return { user: tokens.user, expiresIn: tokens.expiresIn };
}

async function readBody(request: NextRequest) {
  return request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
}

async function forward(base: string, path: string, method: string, body: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body || undefined,
    cache: "no-store",
  });
}

async function refreshSession(refreshToken: string, base: string): Promise<Tokens | null> {
  const refreshKey = createHash("sha256").update(refreshToken).digest("hex");
  const existing = refreshInFlight.get(refreshKey);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const response = await forward(base, "/auth/refresh", "POST", JSON.stringify({ refreshToken }));
      if (!response.ok) return null;
      return await response.json() as Tokens;
    } catch { return null; }
    finally { refreshInFlight.delete(refreshKey); }
  })();
  refreshInFlight.set(refreshKey, pending);
  return pending;
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = `/${parts.join("/")}`;
  const method = request.method.toUpperCase();
  if (!allowed(path, method)) return NextResponse.json({ code: "NOT_FOUND", message: "Ruta no disponible.", requestId: "web" }, { status: 404, headers: { "cache-control": "private, no-store" } });
  const upstream = upstreamFor(path);
  if (!upstream) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Servicio no configurado.", requestId: "web" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  const mutating = !["GET", "HEAD"].includes(method);
  if (mutating && !originAllowed(request)) return NextResponse.json({ code: "ORIGIN_NOT_ALLOWED", message: "Origen no permitido.", requestId: "web" }, { status: 403, headers: { "cache-control": "private, no-store" } });
  const body = await readBody(request);
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (path === "/auth/login" || path === "/auth/refresh") {
    let payload = body;
    if (path === "/auth/refresh") payload = JSON.stringify({ refreshToken: refreshToken ?? "" });
    const response = await forward(upstream, path, method, payload, { accept: "application/json" });
    if (!response.ok) return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store", ...(response.headers.get("retry-after") ? { "retry-after": response.headers.get("retry-after")! } : {}) } });
    const tokens = await response.json() as Tokens;
    const result = NextResponse.json(sessionBody(tokens), { status: response.status, headers: { "cache-control": "private, no-store" } });
    setSessionCookies(result, tokens);
    return result;
  }

  if (path === "/auth/register") {
    const response = await forward(upstream, path, method, body);
    return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store", ...(response.headers.get("retry-after") ? { "retry-after": response.headers.get("retry-after")! } : {}) } });
  }

  if (path === "/auth/logout") {
    let response: Response | null = null;
    if (refreshToken) response = await forward(upstream, path, method, JSON.stringify({ refreshToken }));
    const result = response && !response.ok
      ? new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "private, no-store", ...(response.headers.get("retry-after") ? { "retry-after": response.headers.get("retry-after")! } : {}) } })
      : new NextResponse(null, { status: 204, headers: { "cache-control": "private, no-store" } });
    clearSessionCookies(result);
    return result;
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const originalHeaders: Record<string, string> = { accept: "application/json" };
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) originalHeaders["idempotency-key"] = idempotencyKey;
  if (mutating) originalHeaders.origin = request.headers.get("origin") ?? "";
  const send = (token: string | undefined) => forward(upstream, path + request.nextUrl.search, method, body, {
    ...originalHeaders,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  let response = await send(accessToken);
  let rotated: Tokens | null = null;
  if (response.status === 401 && refreshToken) {
    rotated = await refreshSession(refreshToken, upstreamFor("/auth/refresh") ?? upstream);
    if (rotated) response = await send(rotated.accessToken);
  }
  const result = new NextResponse(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "private, no-store",
      ...(response.headers.get("retry-after") ? { "retry-after": response.headers.get("retry-after")! } : {}),
      ...(response.headers.get("idempotency-replayed") ? { "idempotency-replayed": response.headers.get("idempotency-replayed")! } : {}),
    },
  });
  if (rotated) setSessionCookies(result, rotated);
  return result;
}

export const GET = handle;
export const POST = handle;
