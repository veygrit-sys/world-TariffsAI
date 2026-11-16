import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { minor } from "./money.ts";
import type { TariffLookupResult } from "./tariffs.ts";
import { customsDocumentCodes, type CustomsDocumentCode, type CustomsPlanLineInput, type Dataset, type Shipment } from "./types.ts";

const categories = ["low_value", "cross_border_ecommerce", "gift", "return", "business_import", "preference"] as const;
const amountBases = ["declared_consignment_goods", "confirmed_customs_value"] as const;
type ProcedureCategory = (typeof categories)[number];
type ProcedureLimit = {
  basis: (typeof amountBases)[number];
  currency: string;
  operator: "lte" | "lt";
  amount: string;
};
type EvidenceRequirement = { code: string; labelJa: string; document?: CustomsDocumentCode };
type RateMapping = { destinationCountry: string; productOrigin: string; labels: string[] };

export interface SpecialProcedureReference {
  id: string;
  category: ProcedureCategory;
  agreement?: string;
  titleJa: string;
  conditionJa: string;
  appliesWhen: {
    countries: string[];
    origins?: string[];
    productOrigins?: string[];
    transactions?: Shipment["transaction"][];
    regimes?: Shipment["regime"][];
    transports?: Shipment["transport"][];
  };
  requiredEvidence: EvidenceRequirement[];
  rateReferences?: RateMapping[];
  limit?: ProcedureLimit;
  sources: { authority: string; title: string; url: string }[];
  referenceFrom: string;
  referenceThrough: string;
}

export interface PreferenceRateReference {
  itemId: string;
  code: string;
  label: string;
  expression: string;
  adValoremPercent: string | null;
  condition: string | null;
  snapshotId: string;
  sourceUrl: string;
}

export interface SpecialProcedureCheck {
  reference: SpecialProcedureReference;
  itemIds: string[];
  selectedItemIds: string[];
  status: "outside_value_limit" | "value_check_required" | "documents_needed" | "check_requirements";
  evidence: (EvidenceRequirement & { status: "reported_present" | "prepare_for_review" | "confirm_requirement" })[];
  valueCheck: "not_specified" | "unconfirmed" | "within_limit" | "outside_limit";
  rateReferences: PreferenceRateReference[];
  eligibilityConfirmed: false;
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const array = (items: object, minItems = 1) => ({ type: "array", minItems, uniqueItems: true, items });
const text = { type: "string", minLength: 1 };
const nullableText = { anyOf: [text, { type: "null" }] };
const slug = { type: "string", pattern: "^[a-z][a-z0-9_]{2,79}$" };
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const date = { type: "string", format: "date" };
const url = { type: "string", format: "uri", pattern: "^https://" };
const evidence = { code: slug, labelJa: text, document: { enum: [...customsDocumentCodes] } };
const limitSchema = object({
  basis: { enum: [...amountBases] },
  currency: { type: "string", pattern: "^[A-Z]{3}$" },
  operator: { enum: ["lte", "lt"] },
  amount: { type: "string", pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$" },
});
export const specialProcedureReferenceSchema = object({
  id: slug, category: { enum: [...categories] }, agreement: slug, titleJa: text, conditionJa: text,
  appliesWhen: object({
    countries: array(country), origins: array(country), productOrigins: array(country),
    transactions: array({ enum: ["b2c_sale", "b2b_sale", "private_gift", "return", "sample"] }),
    regimes: array({ enum: ["standard", "ioss", "cn_9610", "cn_1210", "unknown"] }),
    transports: array({ enum: ["air", "post", "sea", "land", "courier_unspecified"] }),
  }, ["countries"]),
  requiredEvidence: array(object(evidence, ["code", "labelJa"])),
  rateReferences: array(object({ destinationCountry: country, productOrigin: country, labels: array(text) })),
  limit: limitSchema, sources: array(object({ authority: text, title: text, url })),
  referenceFrom: date, referenceThrough: date,
}, ["id", "category", "titleJa", "conditionJa", "appliesWhen", "requiredEvidence", "sources", "referenceFrom", "referenceThrough"]);

export const specialProcedureCheckSchema = object({
  reference: specialProcedureReferenceSchema, itemIds: array(text), selectedItemIds: array(text, 0),
  status: { enum: ["outside_value_limit", "value_check_required", "documents_needed", "check_requirements"] },
  evidence: array(object({ ...evidence, status: { enum: ["reported_present", "prepare_for_review", "confirm_requirement"] } },
    ["code", "labelJa", "status"])),
  valueCheck: { enum: ["not_specified", "unconfirmed", "within_limit", "outside_limit"] },
  rateReferences: array(object({
    itemId: text, code: text, label: text, expression: text, adValoremPercent: nullableText, condition: nullableText,
    snapshotId: text, sourceUrl: url,
  }), 0),
  eligibilityConfirmed: { const: false },
});

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<SpecialProcedureReference[]>(array(specialProcedureReferenceSchema, 0));

export function loadSpecialProcedureReferences(data: Dataset, input: unknown): SpecialProcedureReference[] {
  if (!validate(input)) throw new Error("INVALID_SPECIAL_PROCEDURES: " + ajv.errorsText(validate.errors));
  const countries = new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ inScope }) => inScope).map(({ code }) => code));
  const ids = new Set<string>();
  for (const rule of input) {
    const scope = rule.appliesWhen;
    const preference = rule.category === "preference";
    const mappings = rule.rateReferences ?? [];
    if (ids.has(rule.id) || rule.referenceFrom > rule.referenceThrough ||
        [...scope.countries, ...scope.origins ?? [], ...scope.productOrigins ?? []].some((code) => !countries.has(code)) ||
        new Set(rule.requiredEvidence.map(({ code }) => code)).size !== rule.requiredEvidence.length ||
        preference !== !!rule.agreement || (preference && !scope.productOrigins?.length) ||
        (!preference && mappings.length > 0) ||
        new Set(mappings.map(({ destinationCountry, productOrigin }) => destinationCountry + productOrigin)).size !== mappings.length ||
        mappings.some(({ destinationCountry, productOrigin }) => destinationCountry === productOrigin ||
          !scope.countries.includes(destinationCountry) || !scope.productOrigins?.includes(productOrigin)) ||
        rule.sources.some(({ url: link }) => {
          const address = new URL(link);
          return address.username || address.password;
        })) throw new Error("INVALID_SPECIAL_PROCEDURE: " + rule.id);
    if (rule.limit && minor(rule.limit.amount, rule.limit.currency) <= 0n)
      throw new Error("INVALID_SPECIAL_PROCEDURE_LIMIT: " + rule.id);
    ids.add(rule.id);
  }
  return input;
}

export function specialProcedureReferences(data: Dataset, destination: string, date: string): SpecialProcedureReference[] {
  return (data.specialProcedureReferences ?? [])
    .filter((rule) => rule.appliesWhen.countries.includes(destination) && rule.referenceFrom <= date && date <= rule.referenceThrough)
    .map((rule) => structuredClone(rule));
}

function checkValue(limit: ProcedureLimit | undefined, shipment: Shipment): SpecialProcedureCheck["valueCheck"] {
  if (!limit) return "not_specified";
  if (limit.currency !== shipment.currency || !shipment.consignmentScopeConfirmed) return "unconfirmed";
  let assessed: bigint;
  if (limit.basis === "confirmed_customs_value") {
    if (!shipment.customsValueConfirmed || shipment.customsValue === undefined) return "unconfirmed";
    assessed = minor(shipment.customsValue, shipment.currency);
  } else {
    assessed = shipment.items.reduce((sum, item) => sum + minor(item.unitValue, shipment.currency) * BigInt(item.quantity), 0n);
  }
  const maximum = minor(limit.amount, limit.currency);
  return (limit.operator === "lte" ? assessed <= maximum : assessed < maximum) ? "within_limit" : "outside_limit";
}

function preferenceRates(
  rule: SpecialProcedureReference, shipment: Shipment, itemId: string, productOrigin: string,
  declaredCode: string | undefined, lookup: TariffLookupResult | undefined,
): PreferenceRateReference[] {
  const mapping = rule.rateReferences?.find((entry) =>
    entry.destinationCountry === shipment.destinationCountry && entry.productOrigin === productOrigin);
  const snapshot = lookup?.snapshot;
  if (!mapping || !declaredCode || declaredCode.length < 7 || !lookup || !snapshot ||
      lookup.referenceDate !== shipment.importDate || lookup.status !== "schedule_reference" ||
      snapshot.zone !== "standard" || (snapshot.scope !== "national_schedule" && snapshot.scope !== "published_baseline") ||
      lookup.totalMatches !== 1 || lookup.nextOffset !== null) return [];
  const row = lookup.matches[0];
  if (!row || row.code !== declaredCode || row.matchPrefix || (row.rateCode && row.rateCode !== declaredCode)) return [];
  return row.rates.filter((rate) =>
    rate.charge === "customs_duty" && rate.treatment === "preferential" && mapping.labels.includes(rate.label) &&
    (!rate.originCountries || rate.originCountries.includes(productOrigin)) &&
    !rate.excludedOriginCountries?.includes(productOrigin),
  ).map((rate) => ({
    itemId, code: declaredCode, label: rate.label, expression: rate.expression, adValoremPercent: rate.adValoremPercent,
    condition: rate.condition ?? null, snapshotId: snapshot.id, sourceUrl: row.url ?? snapshot.sourceUrl,
  }));
}

export function reviewSpecialProcedures(
  references: readonly SpecialProcedureReference[],
  shipment: Shipment,
  lines: ReadonlyMap<string, CustomsPlanLineInput>,
  availableDocuments: readonly CustomsDocumentCode[],
  referenceLookup: (itemId: string) => TariffLookupResult | undefined,
  canShowPreferentialRates: boolean,
): SpecialProcedureCheck[] {
  const documents = new Set(availableDocuments);
  const checks: SpecialProcedureCheck[] = [];
  for (const rule of references) {
    const { origins, productOrigins, transactions, regimes, transports } = rule.appliesWhen;
    if ((origins && !origins.includes(shipment.originCountry)) ||
        (transactions && !transactions.includes(shipment.transaction)) ||
        (regimes && !regimes.includes(shipment.regime)) ||
        (transports && !transports.includes(shipment.transport))) continue;
    const items = shipment.items.filter(({ originCountry }) =>
      (!productOrigins || productOrigins.includes(originCountry)) &&
      (rule.category !== "preference" || originCountry !== shipment.destinationCountry),
    );
    if (!items.length) continue;
    const selected = rule.agreement ? items.filter(({ id }) => lines.get(id)?.preferenceAgreement === rule.agreement) : [];
    const rateReferences = canShowPreferentialRates && rule.rateReferences ? items.flatMap((item) =>
      item.classificationConfirmed ? preferenceRates(
        rule, shipment, item.id, item.originCountry, lines.get(item.id)?.tariffCode, referenceLookup(item.id),
      ) : [],
    ) : [];
    const evidence = rule.requiredEvidence.map((requirement): SpecialProcedureCheck["evidence"][number] => ({
      ...requirement,
      status: requirement.document ? documents.has(requirement.document) ? "reported_present" : "prepare_for_review" : "confirm_requirement",
    }));
    const valueCheck = checkValue(rule.limit, shipment);
    const status = valueCheck === "outside_limit" ? "outside_value_limit" : valueCheck === "unconfirmed" ? "value_check_required"
      : evidence.some((entry) => entry.status === "prepare_for_review") ? "documents_needed" : "check_requirements";
    checks.push({ reference: rule, itemIds: items.map(({ id }) => id), selectedItemIds: selected.map(({ id }) => id),
      status, evidence, valueCheck, rateReferences, eligibilityConfirmed: false });
  }
  return checks;
}
