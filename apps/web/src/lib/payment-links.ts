import { amountToCanonical } from "./money.ts";

export const paymentLinkIntentStorageKey = "fluxone:payment-link-intent:v1";
export const paymentLinkPayIntentStorageKey = "fluxone:payment-link-pay-intent:v1";

export function tokenFromFragment(hash: string) {
  const token = hash.startsWith("#") ? hash.slice(1) : hash;
  if (token.length > 512 || !/^pl1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{32,128}$/i.test(token)) return null;
  return token;
}

export function paymentLinkUrl(origin: string, token: string) {
  return `${origin}/pay#${token}`;
}

export function cleanPaymentFragment(pathname: string, search: string) {
  return `${pathname}${search}`;
}

export function canonicalPaymentLinkAmount(input: string) {
  return amountToCanonical(input);
}

export function paymentLinkErrorMessage(code?: string) {
  switch (code) {
    case "PAYMENT_LINK_EXPIRED": case "EXPIRED": return "Este link venció. Pide a quien lo compartió que genere uno nuevo.";
    case "PAYMENT_LINK_ALREADY_PAID": case "ALREADY_PAID": return "Este link ya fue pagado.";
    case "PAYMENT_LINK_NOT_ACTIVE": case "NOT_ACTIVE": return "Este link ya no está disponible.";
    case "INSUFFICIENT_FUNDS": return "No tienes saldo disponible suficiente. El link puede continuar activo; elige otra cuenta o agrega fondos.";
    case "BALANCE_LIMIT_EXCEEDED": return "La cuenta receptora no puede recibir este monto ahora. El link puede continuar activo; inténtalo más tarde.";
    case "SAME_ACCOUNT": return "Elige una cuenta distinta a la cuenta receptora. El link puede continuar activo.";
    default: return "No pudimos completar el pago. Revisa la conexión y vuelve a intentarlo con la misma clave.";
  }
}

export type LinkIntent<T> = { key: string; payload: T };
export function newLinkIntent<T>(payload: T): LinkIntent<T> {
  return { key: crypto.randomUUID(), payload };
}

export function parseStoredIntent<T>(raw: string | null, isPayload: (value: unknown) => value is T): LinkIntent<T> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { key?: unknown; payload?: unknown };
    if (typeof value.key !== "string" || !/^[0-9a-f-]{36}$/i.test(value.key) || !isPayload(value.payload)) return null;
    return { key: value.key, payload: value.payload };
  } catch { return null; }
}
