import type { BrowserComponents } from "@fluxone/api-client";

export type User = BrowserComponents["schemas"]["User"];
export type Account = BrowserComponents["schemas"]["Account"];
export type Beneficiary = BrowserComponents["schemas"]["Beneficiary"];
export type Transfer = BrowserComponents["schemas"]["Transfer"];
export type AuditPage = BrowserComponents["schemas"]["AuditPage"];
export type TransferPage = BrowserComponents["schemas"]["TransferPage"];
export type PaymentLink = BrowserComponents["schemas"]["PaymentLink"];
export type PaymentLinkPage = BrowserComponents["schemas"]["PaymentLinkPage"];
export type PaymentLinkCheckout = BrowserComponents["schemas"]["PaymentLinkCheckout"];
export type PaymentLinkPayment = BrowserComponents["schemas"]["PaymentLinkPayment"];

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public retryAfter?: string) {
    super(message);
  }
}

let refreshInFlight: Promise<boolean> | null = null;
async function rawBrowserFetch(path: string, init?: RequestInit) {
  return fetch(`/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
}
async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const check = await rawBrowserFetch("/auth/me");
      if (check.ok) return true;
      const refreshed = await rawBrowserFetch("/auth/refresh", { method: "POST" });
      return refreshed.ok;
    } catch { return false; }
    finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
}
async function coordinatedRefresh() {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("fluxone-auth-refresh", async () => refreshSession());
  }
  return false;
}

export async function api<T>(path: string, init?: RequestInit, options: { redirectOnUnauthorized?: boolean } = {}): Promise<T> {
  let response = await rawBrowserFetch(path, init);
  if (response.status === 401 && !path.startsWith("/auth/") && options.redirectOnUnauthorized !== false) {
    const refreshed = await coordinatedRefresh();
    if (refreshed) response = await rawBrowserFetch(path, init);
    else {
      await rawBrowserFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
      if (typeof window !== "undefined") window.location.assign("/login");
    }
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string; code?: string } | null;
    throw new ApiError(response.status, error?.message ?? "No fue posible completar la solicitud.", error?.code, response.headers.get("retry-after") ?? undefined);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
