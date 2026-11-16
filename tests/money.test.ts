import test from "node:test";
import assert from "node:assert/strict";
import { minor, money, tax, convertMoney } from "../src/money.ts";
test("decimal calculations use integers, not binary floating point", () => {
  assert.equal(minor("0.10", "GBP") + minor("0.20", "GBP"), 30n);
  assert.equal(tax(3n, 2000), 1n);
  assert.equal(tax(1n, 5000), 1n);
});
test("currency exponents are honoured", () => {
  assert.equal(money(minor("123", "JPY"), "JPY").value, "123");
  assert.equal(minor("1.234", "KWD"), 1234n);
  assert.throws(() => minor("1.1", "JPY"));
  assert.throws(() => minor("-1.00", "GBP"));
  assert.throws(() => minor("1e2", "GBP"));
});
test("customs FX is separated from checkout FX and respects precision", () => {
  const rate = {
    from: "JPY",
    to: "GBP",
    numerator: "5",
    denominator: "1000",
    purpose: "customs" as const,
    validFrom: "2026-11-01",
    validTo: "2026-12-01",
    sourceId: "synthetic-authority-reference",
  };
  assert.equal(
    convertMoney(
      { currency: "JPY", value: "1000" },
      rate,
      "2026-11-11",
      "customs",
    ).value,
    "5.00",
  );
  assert.throws(() =>
    convertMoney(
      { currency: "JPY", value: "1000" },
      rate,
      "2026-11-11",
      "checkout",
    ),
  );
  assert.throws(() =>
    convertMoney(
      { currency: "JPY", value: "1000" },
      rate,
      "2026-12-01",
      "customs",
    ),
  );
  assert.throws(() =>
    convertMoney(
      { currency: "JPY", value: "1000" },
      { ...rate, denominator: "0" },
      "2026-11-11",
      "customs",
    ),
  );
});
