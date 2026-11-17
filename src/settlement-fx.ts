import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { todayJst } from "./dataset.ts";
import { currencyDigits, minor, money } from "./money.ts";
import { InputError } from "./schema.ts";
import type { Amount } from "./types.ts";

/** Target major currency units per source major unit. Reviewed settlement rates
 * are independent of the customs valuation and checkout rates. */
export interface SettlementFxRate {
  id: string;
  from: string;
  to: string;
  numerator: string;
  denominator: string;
  purpose: "import_settlement";
  sourceId: string;
  evidenceId: string;
  validFrom: string;
  /** Exclusive end date. */
  validTo: string;
  reviewedOn: string;
  /** Inclusive review deadline in Japan time. */
  reviewBy: string;
  rounding: "half_up" | "down" | "up";
}

export interface SettlementFxConversion {
  original: Amount;
  converted: Amount;
  conversionDate: string;
  rate: SettlementFxRate;
}

const opaque = { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.:-]+$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const date = { type: "string", format: "date" };
const positiveInteger = { type: "string", pattern: "^[1-9][0-9]{0,17}$" };
const fields = {
  id: opaque,
  from: currency,
  to: currency,
  numerator: positiveInteger,
  denominator: positiveInteger,
  purpose: { const: "import_settlement" },
  sourceId: opaque,
  evidenceId: opaque,
  validFrom: date,
  validTo: date,
  reviewedOn: date,
  reviewBy: date,
  rounding: { enum: ["half_up", "down", "up"] },
};

export const settlementFxRateSchema = {
  type: "object", additionalProperties: false, required: Object.keys(fields), properties: fields,
};
const amountSchema = {
  type: "object", additionalProperties: false, required: ["currency", "value"],
  properties: { currency, value: { type: "string", pattern: "^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,4})?$" } },
};
export const settlementFxConversionSchema = {
  type: "object", additionalProperties: false,
  required: ["original", "converted", "conversionDate", "rate"],
  properties: {
    original: amountSchema, converted: amountSchema, conversionDate: date, rate: settlementFxRateSchema,
  },
};

const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validateRate = ajv.compile<SettlementFxRate>(settlementFxRateSchema);
const validateDate = ajv.compile<string>(date);
const validateAmount = ajv.compile<Amount>(amountSchema);
const failure = (path: string, code: string): never => { throw new InputError([{ path, code }]); };

/** Convert one recorded amount with an explicit, operator-reviewed rate.
 * No inverse/triangulated rate or live-rate fallback is inferred. */
export function convertSettlementMoney(
  amount: Amount, targetCurrency: string, rate: unknown, conversionDate: string, now = new Date(),
): SettlementFxConversion {
  if (!validateRate(rate)) {
    throw new InputError((validateRate.errors ?? []).slice(0, 20).map(({ instancePath, keyword }) => ({
      path: "/rate" + instancePath, code: keyword,
    })));
  }
  if (!validateAmount(amount)) failure("/amount", "INVALID_MONEY");
  if (!validateDate(conversionDate)) failure("/conversionDate", "INVALID_FX_DATE");
  const today = todayJst(now);
  if (rate.reviewedOn > today) failure("/rate/reviewedOn", "FX_REVIEW_NOT_OBSERVED");
  if (rate.reviewedOn > rate.reviewBy) failure("/rate/reviewBy", "INVALID_FX_REVIEW_RANGE");
  if (rate.reviewBy < today) failure("/rate/reviewBy", "FX_REVIEW_EXPIRED");
  if (rate.validFrom >= rate.validTo) failure("/rate/validTo", "INVALID_FX_DATE_RANGE");
  if (conversionDate < rate.validFrom || conversionDate >= rate.validTo || conversionDate > today)
    failure("/conversionDate", "FX_DATE_OUT_OF_RANGE");
  if (amount.currency !== rate.from || targetCurrency !== rate.to || rate.from === rate.to)
    failure("/rate", "FX_SCOPE_MISMATCH");
  let source: bigint;
  let sourceDigits: number;
  let targetDigits: number;
  try {
    source = minor(amount.value, amount.currency);
    sourceDigits = currencyDigits(rate.from);
    targetDigits = currencyDigits(rate.to);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    failure("/amount", error.message);
  }
  const numerator = source! * BigInt(rate.numerator) * 10n ** BigInt(targetDigits!);
  const denominator = BigInt(rate.denominator) * 10n ** BigInt(sourceDigits!);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const increment = rate.rounding === "up" ? remainder !== 0n
    : rate.rounding === "half_up" && remainder * 2n >= denominator;
  const converted = money(quotient + (increment ? 1n : 0n), targetCurrency);
  // Keep converted amounts within the same domain accepted by settlement inputs.
  if (!validateAmount(converted)) failure("/converted", "FX_AMOUNT_OUT_OF_RANGE");
  return { original: { ...amount }, converted, conversionDate, rate: { ...rate } };
}
