import { NextResponse } from "next/server";
export function GET() {
  const configured = Boolean(process.env.AUTH_API_URL && process.env.PAYMENTS_API_URL && process.env.AUDIT_API_URL && process.env.APP_ORIGIN);
  return NextResponse.json({ status: configured ? "ready" : "not_configured" }, { status: configured ? 200 : 503 });
}
