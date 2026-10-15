import { test } from "node:test";
import { strict as assert } from "node:assert";
import { amount, money, ensureFunds, ensureCredit, MAX_MONEY } from "./money";
test("[PAY-06] exact decimal arithmetic and canonical representation", () => {
  assert.equal(money(amount("0.10") + amount("0.20")), "0.30");
  assert.equal(money(amount("100")), "100.00");
});
test("[PAY-02] reject malformed, negative, zero and over-precision money", () => {
  for (const input of [
    "0",
    "-1",
    "1.001",
    "1e3",
    " 2",
    "1,00",
    "1000000000000.00",
  ])
    assert.throws(() => amount(input));
});
test("[PAY-03][PAY-09] reserved money cannot be spent and credit cannot overflow", () => {
  assert.throws(() => ensureFunds(10000n, 8000n, 3000n));
});
test("[PAY-03] exact available balance can be spent, but one cent more cannot", () => {
  ensureFunds(10000n, 2500n, 7500n);
  assert.throws(() => ensureFunds(10000n, 2500n, 7501n));
});
test("[PAY-09] credit can reach the maximum balance exactly, but not exceed it", () => {
  ensureCredit(MAX_MONEY - 500n, 500n);
  assert.throws(() => ensureCredit(MAX_MONEY - 500n, 501n));
});
