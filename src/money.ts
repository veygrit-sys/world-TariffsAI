import type { Amount } from "./types.ts";

const supported = new Set(Intl.supportedValuesOf("currency"));
const digitsByCurrency = new Map<string, number>();
export function currencyDigits(currency: string): number {
  if (!supported.has(currency)) throw new RangeError("UNSUPPORTED_CURRENCY");
  const cached = digitsByCurrency.get(currency);
  if (cached !== undefined) return cached;
  const digits = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  if (digits === undefined) throw new RangeError("UNSUPPORTED_CURRENCY");
  digitsByCurrency.set(currency, digits);
  return digits;
}
export function minor(value: string, currency: string): bigint {
  if (!/^(0|[1-9]\d{0,11})(\.\d{1,4})?$/.test(value))
    throw new RangeError("INVALID_MONEY");
  const digits = currencyDigits(currency);
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > digits) throw new RangeError("CURRENCY_PRECISION");
  return (
    BigInt(whole!) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0")
  );
}
export function money(value: bigint, currency: string): Amount {
  const digits = currencyDigits(currency),
    scale = 10n ** BigInt(digits);
  if (value < 0n) throw new RangeError("NEGATIVE_MONEY");
  return {
    currency,
    value: digits
      ? `${value / scale}.${String(value % scale).padStart(digits, "0")}`
      : String(value),
  };
}
export function roundRatio(
  value: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (value < 0n || numerator < 0n || denominator <= 0n)
    throw new RangeError("INVALID_RATIO");
  return (value * numerator * 2n + denominator) / (denominator * 2n);
}
export function tax(value: bigint, basisPoints: number): bigint {
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  )
    throw new RangeError("INVALID_RATE");
  return roundRatio(value, BigInt(basisPoints), 10000n);
}
export interface FxRate {
  from: string;
  to: string;
  numerator: string;
  denominator: string;
  purpose: "customs" | "checkout";
  validFrom: string;
  validTo: string;
  sourceId: string;
}
/** Rate = target major units per source major unit. Customs and checkout quotes are independent. */
export function convertMoney(
  amount: Amount,
  rate: FxRate,
  date: string,
  purpose: FxRate["purpose"],
): Amount {
  const validDate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (
    ![date, rate.validFrom, rate.validTo].every(validDate) ||
    rate.validFrom >= rate.validTo
  )
    throw new RangeError("INVALID_FX_DATE");
  if (
    amount.currency !== rate.from ||
    purpose !== rate.purpose ||
    date < rate.validFrom ||
    date >= rate.validTo ||
    !rate.sourceId
  )
    throw new RangeError("FX_SCOPE_MISMATCH");
  if (
    !/^\d{1,18}$/.test(rate.numerator) ||
    !/^[1-9]\d{0,17}$/.test(rate.denominator) ||
    BigInt(rate.numerator) === 0n
  )
    throw new RangeError("INVALID_FX_RATE");
  const source = minor(amount.value, amount.currency);
  const n = BigInt(rate.numerator) * 10n ** BigInt(currencyDigits(rate.to));
  const d = BigInt(rate.denominator) * 10n ** BigInt(currencyDigits(rate.from));
  return money(roundRatio(source, n, d), rate.to);
}
