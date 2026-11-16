import { minor, money, roundRatio } from "./money.ts";
import type { GeneralDutyPolicy } from "./territories.ts";
import type { TariffLookupResult, TariffSnapshot } from "./tariffs.ts";
import type { Amount, BaseDutyTreatment, CustomsPlanLineInput, Item, Shipment } from "./types.ts";

export type DutyReviewReason =
  | "IMPORT_PROCEDURE_REVIEW"
  | "SPECIALISED_ESTIMATE_AVAILABLE"
  | "GOODS_REVIEW"
  | "CLASSIFICATION_REQUIRED"
  | "CUSTOMS_VALUE_ALLOCATION_REQUIRED"
  | "EXACT_TARIFF_LINE_REQUIRED"
  | "DATED_PUBLISHED_TARIFF_REQUIRED"
  | "RATE_TREATMENT_REVIEW"
  | "RATE_CONDITION_REVIEW"
  | "RATE_EXPRESSION_REVIEW"
  | "CHF_AND_GROSS_WEIGHT_REQUIRED"
  | "ZERO_DUTY_ELIGIBILITY_REQUIRED";

export interface DutyCalculation {
  amount: Amount;
  treatment: BaseDutyTreatment;
  basis: "confirmed_line_customs_value" | "confirmed_gross_weight" | "published_zero_rate" | "confirmed_zero_duty_policy";
  expression: string;
  conditions: string[];
  sourceUrls: string[];
  snapshotId: string | null;
  rounding: "half_up_per_line" | "exact";
}

export type LineDutyScenario =
  | { status: "not_requested" }
  | { status: "review_required"; reason: DutyReviewReason }
  | ({ status: "calculated" } & DutyCalculation);
type ComputedLineDutyScenario = Exclude<LineDutyScenario, { status: "calculated" }>
  | ({ status: "calculated"; minorUnits: bigint } & DutyCalculation);

export function isPublishedTariff(snapshot: Pick<TariffSnapshot, "scope">): boolean {
  return snapshot.scope === "national_schedule" || snapshot.scope === "published_baseline";
}

// HMRC uses a 10-digit commodity code for UK import declarations.
export function hasRequiredImportCodeLength(destinationCountry: string, code: string): boolean {
  return destinationCountry !== "GB" || code.length === 10;
}

// These islands have their own published zero-duty policies and still require route review.
const australianZeroDutyIslands = new Set(["CC", "CX", "NF"]);

// The importers use the same field for source notes and rate eligibility conditions.
// Allow only known ordinary-rate notes that add no selection criteria for the line.
const ordinaryRateNotes = new Map<string, string>([
  ["BJ", "Published baseline. Check the applicable regime, origin preference, exemptions, and subsequent amendments."],
  ["CI", "Published ordinary tariff. Confirm the applicable origin preference, national relief, and subsequent amendments."],
  ["CO", "Base duty in the DIAN schedule. Follow the linked amendments and footnotes for temporary, conditional, or origin-specific treatment."],
  ["EAEU", "Published common external tariff. Check national departures, preferences and quota or measure conditions."],
  ["EC", "Check the cited schedule for observations, eligibility, special rates, and the calculation basis."],
  ["MERCOSUR", "Regional common external tariff reference. Verify the national applied rate, national tariff exceptions, quotas, and preferential eligibility."],
  ["MO", "Ordinary import duty under the free-port rule, subject to exceptions prescribed by law."],
  ["TJ", "Check the applicable origin preference, relief and other charges separately."],
  ["TR", "Other Countries column. Verify applicable origin, preferential status, section notes and published derogations."],
  ["UY", "MEF national MFN tariff in the February 2025 reference workbook. Confirm the applicable legal instrument and exceptions."],
  ["UZ", "Verify date-specific footnotes, special rates, origin preferences and other charges."],
]);

function isOrdinaryRateNote(jurisdiction: string, note: string): boolean {
  if (jurisdiction === "BR") return /^Anexo (?:I - TEC|II - Diferentes da TEC), row \d+(?:; \d+\/\d+)*$/.test(note);
  if (jurisdiction === "CH") return /^Tares rate sequence \d+, relief code 00, assessment code \d+\.$/.test(note);
  return ordinaryRateNotes.get(jurisdiction) === note;
}

const review = (reason: DutyReviewReason): ComputedLineDutyScenario => ({ status: "review_required", reason });

function decimalRatio(value: string): [bigint, bigint] {
  const [whole, fraction = ""] = value.split(".");
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
}

interface DutyContext {
  shipment: Shipment;
  reviewedOn: string;
  crossBorder: boolean;
  outOfScope: boolean;
  specialisedDutyAvailable: boolean;
  zeroPolicy: GeneralDutyPolicy | null;
}

export function lineDutyScenario(
  context: DutyContext,
  item: Item,
  line: CustomsPlanLineInput | undefined,
  declaredCode: string | undefined,
  value: bigint | undefined,
  lookup: TariffLookupResult | undefined,
): ComputedLineDutyScenario {
  const treatment = line?.rateTreatment;
  if (!treatment) return { status: "not_requested" };
  const { shipment, crossBorder, outOfScope, specialisedDutyAvailable, zeroPolicy } = context;
  if (specialisedDutyAvailable) return review("SPECIALISED_ESTIMATE_AVAILABLE");
  const identifiedZeroDutyTerritory = treatment === "zero_duty_policy" && !!zeroPolicy &&
    shipment.originZone === "standard" && shipment.originCountry !== shipment.destinationCountry &&
    ((shipment.destinationZone === "special" && !!zeroPolicy.customsTerritory) ||
      (shipment.destinationZone === "standard" && australianZeroDutyIslands.has(shipment.destinationCountry)));
  if (
    outOfScope || (!crossBorder && !identifiedZeroDutyTerritory) ||
    shipment.regime !== "standard" ||
    shipment.inventoryStatus !== "free_circulation" ||
    !shipment.consignmentScopeConfirmed ||
    !["b2c_sale", "b2b_sale"].includes(shipment.transaction)
  ) return review("IMPORT_PROCEDURE_REVIEW");
  if (item.goodsType !== "ordinary") return review("GOODS_REVIEW");
  if (treatment === "zero_duty_policy") {
    if (!zeroPolicy || !item.nonDutiableConfirmed) return review("ZERO_DUTY_ELIGIBILITY_REQUIRED");
    return {
      status: "calculated",
      minorUnits: 0n,
      amount: money(0n, shipment.currency),
      treatment,
      basis: "confirmed_zero_duty_policy",
      expression: "0%",
      conditions: [zeroPolicy.scope, zeroPolicy.otherChargesAndControls],
      sourceUrls: zeroPolicy.sources.map(({ url }) => url),
      snapshotId: null,
      rounding: "exact",
    };
  }

  if (!item.classificationConfirmed || !declaredCode) return review("CLASSIFICATION_REQUIRED");
  if (!hasRequiredImportCodeLength(shipment.destinationCountry, declaredCode))
    return review("EXACT_TARIFF_LINE_REQUIRED");
  const snapshot = lookup?.snapshot;
  if (
    !lookup || !snapshot || !isPublishedTariff(snapshot) || lookup.referenceDate !== shipment.importDate ||
    snapshot.checkedOn > context.reviewedOn ||
    ["date_not_covered", "source_not_loaded", "territory_unresolved"].includes(lookup.status)
  ) return review("DATED_PUBLISHED_TARIFF_REQUIRED");
  if (
    !lookup.matches.length || lookup.nextOffset !== null ||
    lookup.matches.some(({ code, matchPrefix }) => code !== declaredCode || matchPrefix)
  ) return review("EXACT_TARIFF_LINE_REQUIRED");

  const rates = lookup.matches.flatMap(({ rates }) =>
    rates.filter((rate) => rate.charge === "customs_duty" && rate.treatment === treatment),
  );
  const signatures = new Set(rates.map((rate) => JSON.stringify([
    rate.label, rate.expression, rate.condition, rate.origin,
    rate.originCountries, rate.excludedOriginCountries,
  ])));
  const rate = rates[0];
  if (
    !rate || signatures.size !== 1 ||
    (rate.origin !== undefined && !rate.originCountries?.includes(item.originCountry))
  ) return review("RATE_TREATMENT_REVIEW");
  if (rate.condition && !isOrdinaryRateNote(snapshot.jurisdiction, rate.condition))
    return review("RATE_CONDITION_REVIEW");

  let amount: bigint;
  let basis: DutyCalculation["basis"];
  let rounding: DutyCalculation["rounding"] = "half_up_per_line";
  if (rate.adValoremPercent !== null && /^\d{1,5}(\.\d{1,8})?$/.test(rate.adValoremPercent)) {
    if (value === undefined) return review("CUSTOMS_VALUE_ALLOCATION_REQUIRED");
    const [numerator, denominator] = decimalRatio(rate.adValoremPercent);
    amount = roundRatio(value, numerator, denominator * 100n);
    basis = "confirmed_line_customs_value";
    if (numerator === 0n) rounding = "exact";
  } else {
    const grossRate = /^CHF (\d{1,8}(?:\.\d{1,8})?) per 100 kg gross$/.exec(rate.expression);
    if (!grossRate) return review("RATE_EXPRESSION_REVIEW");
    const [numerator, denominator] = decimalRatio(grossRate[1]!);
    if (numerator === 0n) {
      amount = 0n;
      basis = "published_zero_rate";
      rounding = "exact";
    } else {
      const weight = line?.grossWeightKg;
      if (shipment.currency !== "CHF" || !weight || Number(weight) === 0)
        return review("CHF_AND_GROSS_WEIGHT_REQUIRED");
      const [weightNumerator, weightDenominator] = decimalRatio(weight);
      // CHF has 100 minor units and the published duty is per 100 kg.
      amount = roundRatio(weightNumerator, numerator, weightDenominator * denominator);
      basis = "confirmed_gross_weight";
    }
  }
  return {
    status: "calculated",
    minorUnits: amount,
    amount: money(amount, shipment.currency),
    treatment,
    basis,
    expression: rate.expression,
    conditions: [...new Set([
      ...(rate.condition ? [rate.condition] : []),
      ...lookup.matches.flatMap(({ notes }) => notes ?? []),
      ...snapshot.limitations,
    ])],
    sourceUrls: [...new Set([snapshot.sourceUrl, ...lookup.matches.flatMap(({ url }) => url ? [url] : [])])],
    snapshotId: snapshot.id,
    rounding,
  };
}

export function confirmedCustomsValues(
  shipment: Shipment,
  lines: ReadonlyMap<string, CustomsPlanLineInput>,
): Map<string, bigint> {
  const values = new Map<string, bigint>();
  for (const [id, line] of lines)
    if (line.customsValue !== undefined) values.set(id, minor(line.customsValue, shipment.currency));
  if (!shipment.customsValueConfirmed || shipment.customsValue === undefined) return new Map();
  const total = minor(shipment.customsValue, shipment.currency);
  if (!values.size && shipment.items.length === 1)
    values.set(shipment.items[0]!.id, total);
  if (values.size !== shipment.items.length) return new Map();
  if ([...values.values()].reduce((sum, value) => sum + value, 0n) !== total)
    throw new RangeError("CUSTOMS_VALUE_TOTAL_MISMATCH");
  return values;
}
