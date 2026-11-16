import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { currentRule, todayJst } from "./dataset.ts";
import { isPublishedTariff } from "./duty-scenario.ts";
import { calculationRuleId } from "./engine.ts";
import { InputError } from "./schema.ts";
import type { TariffCatalog } from "./tariffs.ts";
import type { Dataset } from "./types.ts";
import { worldDirection, worldDirectionInputSchema, worldDirectionOutputSchema } from "./world-directions.ts";

export interface ImportSettlementCoverageInput {
  originCountry: string;
  destinationCountry: string;
  date?: string;
}

const statuses = [
  "shipment_review_required", "tariff_evidence_required", "route_review_required",
  "date_review_required", "out_of_scope", "blocked",
] as const;
type CoverageStatus = (typeof statuses)[number];

const evidence = [
  "CONFIRMED_DIRECT_SHIPMENT",
  "PRODUCT_CLASSIFICATION_ORIGIN_AND_CUSTOMS_VALUE",
  "APPLICABLE_DUTY_BASIS_ON_IMPORT_DATE",
  "DIRECTION_SPECIFIC_TRADE_REVIEW",
  "REVIEWED_IMPORT_CHARGES_IN_ONE_CURRENCY",
  "IMPORTER_AND_BROKER_REVIEW",
  "CARRIER_ACCEPTED_BILL_TO",
] as const;

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
const { originCountry, destinationCountry, date } = worldDirectionInputSchema.properties;
const string = { type: "string" };
const stringArray = { type: "array", items: string };

export const importSettlementCoverageInputSchema = object(
  { originCountry, destinationCountry, date }, ["originCountry", "destinationCountry"],
);
export const importSettlementCoverageOutputSchema = object({
  direction: worldDirectionOutputSchema.properties.direction,
  originCountry, destinationCountry,
  referenceDate: date,
  reviewedOn: date,
  ruleSetVersion: string,
  status: { enum: statuses },
  standardTerritoryRoute: worldDirectionOutputSchema.properties.standardTerritoryRoute,
  destinationTariffStatus: worldDirectionOutputSchema.properties.destinationTariffStatus,
  publishedTariffSnapshotIdsOnDate: stringArray,
  referenceOnlyTariffSnapshotIdsOnDate: stringArray,
  futureReviewedTariffSnapshotIdsOnDate: stringArray,
  conditionalDutyRuleId: { type: ["string", "null"] },
  zeroDutyPolicyOnDate: { enum: ["general_zero", "most_goods_zero", null] },
  reasons: stringArray,
  requiredEvidence: { type: "array", items: { enum: evidence } },
  checkoutReady: { const: false },
  shippingAuthorized: { const: false },
  productionAuthorized: { const: false },
});

const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ImportSettlementCoverageInput>(importSettlementCoverageInputSchema);

/** Static screening of a standard direct courier direction before a shipment is known. */
export function importSettlementCoverage(input: unknown, data: Dataset, catalog: TariffCatalog, now = new Date()) {
  if (!validate(input)) {
    throw new InputError((validate.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  }

  // Loading from the origin is part of the supported direct courier shape.
  // Actual loading, product origin and shipment evidence are checked by the plan.
  const route = worldDirection({ ...input, loadingCountry: input.originCountry }, data, catalog, now);
  const { referenceDate, standardTerritoryRoute, destinationTariffStatus, tradePolicy } = route;
  const reviewedOn = todayJst(now);
  const dated = catalog.destinationSnapshots(input.destinationCountry)
    .filter(({ role, availableFrom, availableThrough }) => !role && availableFrom <= referenceDate && referenceDate <= availableThrough);
  const available = dated.filter(({ checkedOn }) => checkedOn <= reviewedOn);
  const publishedTariffSnapshotIdsOnDate = available.filter(isPublishedTariff).map(({ id }) => id);
  const referenceOnlyTariffSnapshotIdsOnDate = available.filter((snapshot) => !isPublishedTariff(snapshot)).map(({ id }) => id);
  const futureReviewedTariffSnapshotIdsOnDate = dated.filter(({ checkedOn }) => checkedOn > reviewedOn).map(({ id }) => id);
  const zeroDutyPolicyOnDate = catalog.destinationCustomsProfile(input.destinationCountry, referenceDate)
    ?.generalDutyPolicy?.treatment ?? null;

  const ruleId = calculationRuleId(input.destinationCountry);
  const conditionalDutyRule = ruleId && ruleId !== "AU_LOW_VALUE_POST" &&
    (ruleId !== "EU_TEMP_LOW_VALUE" || referenceDate >= "2026-11-01")
    ? currentRule(data, ruleId, referenceDate, now) : null;
  const conditionalDutyRuleId = conditionalDutyRule && conditionalDutyRule.checkedOn <= reviewedOn
    ? conditionalDutyRule.id : null;

  let status: CoverageStatus;
  let reasons: string[];
  if (tradePolicy?.status === "blocked") {
    status = "blocked";
    reasons = [tradePolicy.reasonCode];
  } else if (standardTerritoryRoute !== "cross_border") {
    status = "out_of_scope";
    reasons = [standardTerritoryRoute === "domestic" ? "DOMESTIC_ROUTE" :
      standardTerritoryRoute === "eu_intra_union" ? "EU_INTRA_UNION_ROUTE" : "SETTLEMENT_ROUTE_OUT_OF_SCOPE"];
  } else if (route.territoryReviewRequired || tradePolicy?.status === "review_required") {
    status = "route_review_required";
    reasons = [
      ...(route.territoryReviewRequired ? ["CUSTOMS_TERRITORY_OR_TRADE_BLOC_REVIEW_REQUIRED"] : []),
      ...(tradePolicy?.status === "review_required" ? [tradePolicy.reasonCode] : []),
    ];
  } else if (referenceDate < reviewedOn) {
    status = "date_review_required";
    reasons = ["IMPORT_DATE_ALREADY_PASSED"];
  } else if (!publishedTariffSnapshotIdsOnDate.length && conditionalDutyRuleId === null && zeroDutyPolicyOnDate === null) {
    status = "tariff_evidence_required";
    reasons = ["DATED_TARIFF_REFERENCE_REQUIRED"];
  } else {
    status = "shipment_review_required";
    reasons = ["SHIPMENT_SPECIFIC_EVIDENCE_REQUIRED"];
  }

  return {
    direction: route.direction,
    originCountry: route.origin.country,
    destinationCountry: route.destination.country,
    referenceDate, reviewedOn, ruleSetVersion: data.version,
    status, standardTerritoryRoute, destinationTariffStatus,
    publishedTariffSnapshotIdsOnDate, referenceOnlyTariffSnapshotIdsOnDate, futureReviewedTariffSnapshotIdsOnDate,
    conditionalDutyRuleId, zeroDutyPolicyOnDate, reasons,
    requiredEvidence: status === "blocked" || status === "out_of_scope" ? [] : [...evidence],
    checkoutReady: false as const, shippingAuthorized: false as const, productionAuthorized: false as const,
  };
}

export type ImportSettlementCoverage = ReturnType<typeof importSettlementCoverage>;
