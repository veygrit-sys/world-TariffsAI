import assert from "node:assert/strict";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import {
  convertSettlementMoney, settlementFxConversionSchema, type SettlementFxRate,
} from "../src/settlement-fx.ts";
import { InputError } from "../src/schema.ts";

const now = new Date("2026-11-18T10:00:00+09:00");
const conversionDate = "2026-11-17";
function rate(overrides: Partial<SettlementFxRate> = {}): SettlementFxRate {
  return {
    id: "settlement-fx-1", from: "USD", to: "JPY", numerator: "150", denominator: "1",
    purpose: "import_settlement", sourceId: "reviewed-bank-statement", evidenceId: "fx-evidence-1",
    validFrom: "2026-11-01", validTo: "2026-12-01", reviewedOn: "2026-11-18", reviewBy: "2026-11-25",
    rounding: "half_up", ...overrides,
  };
}
function hasCode(code: string) {
  return (error: unknown) => error instanceof InputError && error.issues.some((issue) => issue.code === code);
}

test("settlement FX converts zero, two and three decimal currencies with exact rational rates", () => {
  const cases = [
    { original: { currency: "USD", value: "123.45" }, target: "JPY", fx: rate(), value: "18518" },
    { original: { currency: "JPY", value: "101" }, target: "USD",
      fx: rate({ from: "JPY", to: "USD", numerator: "1", denominator: "150" }), value: "0.67" },
    { original: { currency: "USD", value: "1.01" }, target: "KWD",
      fx: rate({ to: "KWD", numerator: "3", denominator: "10" }), value: "0.303" },
    { original: { currency: "KWD", value: "1.001" }, target: "USD",
      fx: rate({ from: "KWD", to: "USD", numerator: "10", denominator: "3" }), value: "3.34" },
    { original: { currency: "USD", value: "0.00" }, target: "JPY", fx: rate(), value: "0" },
  ];
  const ajv = new Ajv({ strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile(settlementFxConversionSchema);
  for (const { original, target, fx, value } of cases) {
    const result = convertSettlementMoney(original, target, fx, conversionDate, now);
    assert.deepEqual(result.converted, { currency: target, value });
    assert.deepEqual(result.original, original);
    assert.deepEqual(result.rate, fx);
    assert.equal(result.conversionDate, conversionDate);
    assert.equal(validate(result), true, JSON.stringify(validate.errors));
  }
});

test("settlement FX applies the reviewed rounding once in target minor units", () => {
  for (const [rounding, value] of [["half_up", "1"], ["down", "0"], ["up", "1"]] as const) {
    const result = convertSettlementMoney({ currency: "USD", value: "0.01" }, "JPY",
      rate({ numerator: "50", rounding }), conversionDate, now);
    assert.equal(result.converted.value, value);
  }
  const exact = convertSettlementMoney({ currency: "USD", value: "1.00" }, "JPY",
    rate({ rounding: "up" }), conversionDate, now);
  assert.equal(exact.converted.value, "150");
});

test("settlement FX preserves immutable copies of the original amount and review evidence", () => {
  const original = { currency: "USD", value: "1.00" };
  const fx = rate();
  const result = convertSettlementMoney(original, "JPY", fx, conversionDate, now);
  original.value = "9.00";
  fx.evidenceId = "changed";
  assert.equal(result.original.value, "1.00");
  assert.equal(result.rate.evidenceId, "fx-evidence-1");
});

test("settlement FX rejects missing provenance, wrong purpose, zero and unbounded ratios", () => {
  for (const field of ["id", "sourceId", "evidenceId", "rounding"]) {
    const fx: Record<string, unknown> = { ...rate() };
    delete fx[field];
    assert.throws(() => convertSettlementMoney({ currency: "USD", value: "1" }, "JPY", fx, conversionDate, now), InputError);
  }
  for (const patch of [
    { purpose: "checkout" }, { sourceId: "" }, { evidenceId: "" }, { numerator: "0" }, { denominator: "0" },
    { numerator: "1.5" }, { numerator: "9999999999999999999" }, { denominator: "01" }, { unexpected: "field" },
  ]) {
    assert.throws(() => convertSettlementMoney({ currency: "USD", value: "1" }, "JPY",
      { ...rate(), ...patch }, conversionDate, now), InputError);
  }
});

test("settlement FX rejects currency directions, precision and unsupported currencies", () => {
  assert.throws(() => convertSettlementMoney({ currency: "JPY", value: "1" }, "USD", rate(), conversionDate, now), hasCode("FX_SCOPE_MISMATCH"));
  assert.throws(() => convertSettlementMoney({ currency: "USD", value: "1" }, "EUR", rate(), conversionDate, now), hasCode("FX_SCOPE_MISMATCH"));
  assert.throws(() => convertSettlementMoney({ currency: "USD", value: "1" }, "USD", rate({ to: "USD" }), conversionDate, now), hasCode("FX_SCOPE_MISMATCH"));
  assert.throws(() => convertSettlementMoney({ currency: "USD", value: "1.001" }, "JPY", rate(), conversionDate, now), hasCode("CURRENCY_PRECISION"));
  assert.throws(() => convertSettlementMoney({ currency: "USD", value: "1" }, "ZZZ", rate({ to: "ZZZ" }), conversionDate, now), hasCode("UNSUPPORTED_CURRENCY"));
  assert.throws(() => convertSettlementMoney({ currency: "ZZZ", value: "1" }, "JPY", rate({ from: "ZZZ" }), conversionDate, now), hasCode("UNSUPPORTED_CURRENCY"));
});

test("settlement FX enforces actual conversion dates, validity windows and current reviews", () => {
  const convert = (fx: SettlementFxRate, date = conversionDate, instant = now) =>
    convertSettlementMoney({ currency: "USD", value: "1" }, "JPY", fx, date, instant);
  assert.throws(() => convert(rate(), "2026-02-30"), hasCode("INVALID_FX_DATE"));
  assert.throws(() => convert(rate(), "2026-10-31"), hasCode("FX_DATE_OUT_OF_RANGE"));
  assert.throws(() => convert(rate(), "2026-12-01"), hasCode("FX_DATE_OUT_OF_RANGE"));
  assert.throws(() => convert(rate(), "2026-11-19"), hasCode("FX_DATE_OUT_OF_RANGE"));
  assert.throws(() => convert(rate({ validFrom: "2026-12-01" })), hasCode("INVALID_FX_DATE_RANGE"));
  assert.throws(() => convert(rate({ reviewedOn: "2026-11-19" })), hasCode("FX_REVIEW_NOT_OBSERVED"));
  assert.throws(() => convert(rate({ reviewedOn: "2026-11-17", reviewBy: "2026-11-16" })), hasCode("INVALID_FX_REVIEW_RANGE"));
  assert.throws(() => convert(rate({ reviewedOn: "2026-11-16", reviewBy: "2026-11-17" })), hasCode("FX_REVIEW_EXPIRED"));
  assert.equal(convert(rate({ reviewBy: "2026-11-18" })).converted.value, "150");
  assert.throws(() => convert(rate({ reviewBy: "2026-11-18" }), conversionDate,
    new Date("2026-11-18T15:00:00Z")), hasCode("FX_REVIEW_EXPIRED"));
});

test("settlement FX rejects converted totals outside accepted money range", () => {
  assert.throws(() => convertSettlementMoney({ currency: "USD", value: "999999999999.99" }, "JPY",
    rate({ numerator: "1000" }), conversionDate, now), hasCode("FX_AMOUNT_OUT_OF_RANGE"));
});
