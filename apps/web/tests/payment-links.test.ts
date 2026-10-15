import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalPaymentLinkAmount, cleanPaymentFragment, newLinkIntent, parseStoredIntent, paymentLinkErrorMessage, paymentLinkUrl, tokenFromFragment } from "../src/lib/payment-links.ts";

const validToken = "pl1.123e4567-e89b-12d3-a456-426614174000.QWERTYuiop0123456789-_QWERTYuiop0123456789";

test("[UI-07] valida el token del fragmento y rechaza forma/tamaño inválidos", () => {
  assert.equal(tokenFromFragment(`#${validToken}`), validToken);
  assert.equal(tokenFromFragment("#pl1.malformado"), null);
  assert.equal(tokenFromFragment(`#${"x".repeat(513)}`), null);
});

test("[UI-06] construye el link canónico usando solo origen y fragmento", () => {
  assert.equal(paymentLinkUrl("https://flux.example", validToken), `https://flux.example/pay#${validToken}`);
});

test("[UI-07] limpia el fragmento del URL sin conservar el token", () => {
  assert.equal(cleanPaymentFragment("/pay", "?source=qr"), "/pay?source=qr");
  assert.equal(cleanPaymentFragment("/pay", "").includes(validToken), false);
});

test("[UI-08] persiste intención y key sin permitir incluir el token del pago", () => {
  const intent = newLinkIntent({ linkId: "link-id", sourceAccountId: "account-id" });
  const serialized = JSON.stringify(intent);
  assert.match(intent.key, /^[0-9a-f-]{36}$/i);
  assert.equal(serialized.includes(validToken), false);
  assert.deepEqual(parseStoredIntent(serialized, (value): value is typeof intent.payload => !!value && typeof value === "object" && "linkId" in value && "sourceAccountId" in value), intent);
  assert.equal(parseStoredIntent(JSON.stringify({ ...intent, key: "invalid" }), () => true), null);
});

test("[LINK-06] normaliza montos COP con precisión entera", () => {
  assert.equal(canonicalPaymentLinkAmount("1.234,5"), "1234.50");
  assert.equal(canonicalPaymentLinkAmount("1000000000000"), null);
  assert.equal(canonicalPaymentLinkAmount("0,00"), null);
});

test("[LINK-06] explica errores financieros y mantiene genérico el resto", () => {
  assert.match(paymentLinkErrorMessage("INSUFFICIENT_FUNDS"), /puede continuar activo/);
  assert.match(paymentLinkErrorMessage("BALANCE_LIMIT_EXCEEDED"), /puede continuar activo/);
  assert.match(paymentLinkErrorMessage("SAME_ACCOUNT"), /distinta/);
  assert.match(paymentLinkErrorMessage("PAYMENT_LINK_EXPIRED"), /venció/);
  assert.match(paymentLinkErrorMessage("SOME_PRIVATE_CODE"), /No pudimos completar/);
});
