import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { todayJst } from "./dataset.ts";
import { importSettlementCoverage, importSettlementCoverageInputSchema, importSettlementCoverageOutputSchema } from "./import-settlement-coverage.ts";
import type { ImportSettlementCoverage } from "./import-settlement-coverage.ts";
import { InputError } from "./schema.ts";
import type { TariffCatalog } from "./tariffs.ts";
import type { Dataset } from "./types.ts";

export type ImportSettlementDestinationsInput = { date?: string } & (
  | { originCountry: string; destinationCountry?: never }
  | { originCountry?: never; destinationCountry: string }
);

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
const { originCountry, destinationCountry, date } = importSettlementCoverageInputSchema.properties;
export const importSettlementDestinationsInputSchema = {
  oneOf: [
    object({ originCountry, date }, ["originCountry"]),
    object({ destinationCountry, date }, ["destinationCountry"]),
  ],
};

const pair = importSettlementCoverageOutputSchema.properties;
const count = { type: "integer", minimum: 0 };
const partnerSchema = object({
  partnerCountry: destinationCountry,
  direction: pair.direction,
  status: pair.status,
  standardTerritoryRoute: pair.standardTerritoryRoute,
  destinationTariffStatus: pair.destinationTariffStatus,
  publishedTariffSnapshotIdsOnDate: pair.publishedTariffSnapshotIdsOnDate,
  referenceOnlyTariffSnapshotIdsOnDate: pair.referenceOnlyTariffSnapshotIdsOnDate,
  futureReviewedTariffSnapshotIdsOnDate: pair.futureReviewedTariffSnapshotIdsOnDate,
  conditionalDutyRuleId: pair.conditionalDutyRuleId,
  zeroDutyPolicyOnDate: pair.zeroDutyPolicyOnDate,
  reasons: pair.reasons,
});

const emptyTotals = () => ({
  shipment_review_required: 0, tariff_evidence_required: 0, route_review_required: 0,
  date_review_required: 0, out_of_scope: 0, blocked: 0,
} satisfies Record<ImportSettlementCoverage["status"], number>);

export const importSettlementDestinationsOutputSchema = object({
  country: originCountry,
  direction: { enum: ["outbound", "inbound"] },
  referenceDate: date,
  reviewedOn: date,
  ruleSetVersion: pair.ruleSetVersion,
  totals: object({
    directions: count,
    byStatus: object(Object.fromEntries(Object.keys(emptyTotals()).map((status) => [status, count]))),
  }),
  routes: { type: "array", items: partnerSchema },
  checkoutReady: pair.checkoutReady,
  shippingAuthorized: pair.shippingAuthorized,
  productionAuthorized: pair.productionAuthorized,
});

const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ImportSettlementDestinationsInput>(importSettlementDestinationsInputSchema);

/** List the reviewed evidence state for every other scoped country in one direction. */
export function importSettlementDestinations(input: unknown, data: Dataset, catalog: TariffCatalog, now = new Date()) {
  if (!validate(input)) {
    throw new InputError((validate.errors ?? []).slice(0, 20)
      .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  }

  const country = input.originCountry ?? input.destinationCountry;
  const direction = input.originCountry === undefined ? "inbound" : "outbound";
  const path = direction === "outbound" ? "/originCountry" : "/destinationCountry";
  const registry = [...data.countries, ...data.supplementalRegions];
  const anchor = registry.find(({ code }) => code === country);
  if (!anchor) throw new InputError([{ path, code: "UNKNOWN_COUNTRY" }]);
  if (!anchor.inScope || country === "KP")
    throw new InputError([{ path, code: "IMPORT_SETTLEMENT_COUNTRY_OUT_OF_SCOPE" }]);

  const reviewedOn = todayJst(now);
  const referenceDate = input.date ?? reviewedOn;
  const byStatus = emptyTotals();
  const partners = registry.filter(({ inScope, code }) => inScope && code !== "KP" && code !== country)
    .map(({ code }) => code).sort();
  const routes = partners.map((partnerCountry) => {
    const pairInput = direction === "outbound"
      ? { originCountry: country, destinationCountry: partnerCountry, date: referenceDate }
      : { originCountry: partnerCountry, destinationCountry: country, date: referenceDate };
    const {
      direction: pairDirection, status, standardTerritoryRoute, destinationTariffStatus,
      publishedTariffSnapshotIdsOnDate, referenceOnlyTariffSnapshotIdsOnDate, futureReviewedTariffSnapshotIdsOnDate,
      conditionalDutyRuleId, zeroDutyPolicyOnDate, reasons,
    } = importSettlementCoverage(pairInput, data, catalog, now);
    byStatus[status]++;
    return {
      partnerCountry, direction: pairDirection, status, standardTerritoryRoute, destinationTariffStatus,
      publishedTariffSnapshotIdsOnDate, referenceOnlyTariffSnapshotIdsOnDate, futureReviewedTariffSnapshotIdsOnDate,
      conditionalDutyRuleId, zeroDutyPolicyOnDate, reasons,
    };
  });

  return {
    country, direction, referenceDate, reviewedOn, ruleSetVersion: data.version,
    totals: { directions: routes.length, byStatus }, routes,
    checkoutReady: false as const, shippingAuthorized: false as const, productionAuthorized: false as const,
  };
}

export type ImportSettlementDestinations = ReturnType<typeof importSettlementDestinations>;
