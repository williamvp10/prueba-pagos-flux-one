import test from "node:test";
import assert from "node:assert/strict";
import { HmacPaymentLinkSigner } from "../infrastructure/payment-link-token";

const id = "c0a80101-0000-4000-8000-000000000001";

test("[LINK-02] signs canonical payment-link ids and rejects tampered tokens", () => {
  const signer = new HmacPaymentLinkSigner("0123456789abcdef0123456789abcdef");
  const token = signer.issue(id);
  assert.match(token, /^pl1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(token.length, 84);
  assert.equal(signer.verify(token), id);
  assert.equal(signer.verify(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")), null);
  assert.equal(signer.verify(token.replace("pl1.", "pl2.")), null);
  assert.equal(signer.verify(`pl1.${id}.not-a-signature`), null);
});

test("[LINK-02] requires a sufficiently strong signing secret", () => {
  assert.throws(() => new HmacPaymentLinkSigner("short"), /at least 32 bytes/);
});
