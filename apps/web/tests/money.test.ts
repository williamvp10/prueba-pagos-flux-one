import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { amountToCanonical, formatCop } from "../src/lib/money.ts";

describe("COP input handling", () => {
  it("canonicalizes Colombian decimal input without floating point", () => {
    assert.equal(amountToCanonical("1.234,5"), "1234.50");
    assert.equal(amountToCanonical("1234.50"), "1234.50");
    assert.equal(amountToCanonical("00012,5"), "12.50");
  });
  it("rejects zero, malformed precision, and amounts above the contract limit", () => {
    assert.equal(amountToCanonical("0"), null);
    assert.equal(amountToCanonical("12,345"), null);
    assert.equal(amountToCanonical("1000000000000,00"), null);
  });
  it("formats decimal strings in COP without number conversion", () => {
    assert.equal(formatCop("1234567.05"), "$ 1.234.567,05");
  });
});
