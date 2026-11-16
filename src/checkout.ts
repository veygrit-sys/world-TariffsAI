import { todayJst } from "./dataset.ts";
import { hasRequiredImportCodeLength, isPublishedTariff } from "./duty-scenario.ts";
import { assess } from "./engine.ts";
import { minor, money } from "./money.ts";
import { checkCustomsPlanLines, parseCustomsPlan, parseShipment } from "./schema.ts";
import { loadTariffCatalog, type TariffCatalog, type TariffLookupResult } from "./tariffs.ts";
import type { Amount, Assessment, Charge, CustomsPlanLineInput, Dataset, Finding, Item, Shipment, Source } from "./types.ts";
import { capAtGrantExpiry, withVerifiedOrder, type VeygritOrderRequest, type VeygritPorts } from "./veygrit.ts";

export const checkoutAmountHoldReasons = [
  "DATED_TARIFF_REFERENCE_REQUIRED",
  "REQUOTE_REQUIRED",
  "CUSTOMS_ROUTE_REVIEW_REQUIRED",
  "IMPORT_CHARGES_UNRESOLVED",
] as const;
export type CheckoutAmountHoldReason = (typeof checkoutAmountHoldReasons)[number];

interface CheckoutEvidence {
  shipment: Shipment;
  tariffLookup: (item: Item) => TariffLookupResult | undefined;
  zeroDutyPolicyThrough?: string;
}

export interface CheckoutTaxGroup {
  status: "estimate_available" | "partial_estimate" | "review_required";
  knownSubtotal: Amount | null;
  charges: Charge[];
  unresolvedCharges: string[];
}

export interface CheckoutPreview {
  schemaVersion: "1.0";
  context: "shipment_preview" | "verified_order_preview";
  status: Assessment["status"];
  ruleSetVersion: string;
  requestDigest: string;
  assessedAt: string;
  expiresAt: string;
  importDate: string;
  route: Assessment["route"];
  goodsSubtotal: Amount;
  customsAmountHold: { required: boolean; reasons: CheckoutAmountHoldReason[] };
  checkoutTax: CheckoutTaxGroup;
  importTaxAndDuty: CheckoutTaxGroup;
  otherUnresolvedCharges: string[];
  taxHandoff: "evidence_present" | "evidence_required" | "not_evaluated";
  requiresRequote: boolean;
  checkoutReady: false;
  shippingAuthorized: false;
  landedCostTotal: null;
  findings: Finding[];
  sourceIds: string[];
  sources: Source[];
  documents: string[];
}

const checkoutKinds = new Set<string>(["sales_vat_gst"]);
const importKinds = new Set<string>([
  "customs_duty",
  "import_vat_gst",
  "excise",
  "trade_remedies",
  "additional_duty",
  "levy",
]);

function phase(charge: Charge): "checkout" | "import" {
  if (charge.collection !== "not_applicable") return charge.collection;
  return checkoutKinds.has(charge.kind) ? "checkout" : "import";
}

function taxGroup(charges: Charge[], unresolvedCharges: string[]): CheckoutTaxGroup {
  const currency = charges[0]?.amount.currency;
  const knownSubtotal = currency === undefined
    ? null
    : money(charges.reduce((total, charge) => total + minor(charge.amount.value, currency), 0n), currency);
  return {
    status: knownSubtotal === null
      ? "review_required"
      : unresolvedCharges.length ? "partial_estimate" : "estimate_available",
    knownSubtotal,
    charges,
    unresolvedCharges,
  };
}

function tariffBasisThrough(evidence: CheckoutEvidence, reviewedOn: string): string | null {
  const { shipment, tariffLookup } = evidence;
  const references: string[] = [];
  for (const item of shipment.items) {
    if (!item.classificationConfirmed) return null;
    const lookup = tariffLookup(item);
    const snapshot = lookup?.snapshot;
    if (!lookup || !snapshot || lookup.referenceDate !== shipment.importDate ||
        !isPublishedTariff(snapshot) || snapshot.checkedOn > reviewedOn ||
        shipment.importDate < snapshot.availableFrom || shipment.importDate > snapshot.availableThrough ||
        !hasRequiredImportCodeLength(shipment.destinationCountry, lookup.code) || lookup.nextOffset !== null ||
        lookup.matches.some((line) => line.code !== lookup.code || line.matchPrefix)) return null;
    const rateEnds = lookup.matches.flatMap(({ rates }) => rates
      .filter(({ charge, treatment, origin, originCountries }) =>
        charge === "customs_duty" && (treatment === "general" || treatment === "mfn") &&
        (!origin || originCountries?.includes(item.originCountry)))
      .map(({ through }) => through && through < snapshot.availableThrough ? through : snapshot.availableThrough));
    const lastRateEnd = rateEnds.sort().at(-1);
    if (!lastRateEnd) return null;
    references.push(lastRateEnd);
  }
  return references.sort()[0] ?? null;
}

export function checkoutPreview(
  assessment: Assessment,
  context: CheckoutPreview["context"],
  now: Date,
  evidence: CheckoutEvidence,
): CheckoutPreview {
  const { shipment, zeroDutyPolicyThrough } = evidence;
  const reviewedOn = todayJst(now);
  const crossBorder = assessment.route === "cross_border";
  const expired = !(Date.parse(assessment.expiresAt) > now.getTime()) ||
    (crossBorder && assessment.importDate < reviewedOn);
  const hasDutyRule = assessment.charges.some(({ kind }) => kind === "customs_duty");
  const tariffThrough = crossBorder && !hasDutyRule && !expired
    ? zeroDutyPolicyThrough ?? tariffBasisThrough(evidence, reviewedOn) : null;
  const missingTariff = crossBorder && !hasDutyRule && tariffThrough === null && !expired;
  const requiresRequote = expired || missingTariff;
  const charges = requiresRequote ? [] : assessment.charges;
  const holdReasons: CheckoutAmountHoldReason[] = [];
  if (missingTariff) holdReasons.push("DATED_TARIFF_REFERENCE_REQUIRED");
  if (expired) holdReasons.push("REQUOTE_REQUIRED");
  if (assessment.route === "unresolved" || assessment.status === "out_of_scope")
    holdReasons.push("CUSTOMS_ROUTE_REVIEW_REQUIRED");
  const unresolved = [...new Set([
    ...assessment.unknownCharges,
    "additional_duty",
    "levy",
    ...(requiresRequote ? assessment.charges.map(({ kind }) => kind) : []),
  ])];
  if (crossBorder && unresolved.length) holdReasons.push("IMPORT_CHARGES_UNRESOLVED");
  const checkoutTax = taxGroup(
    charges.filter((charge) => phase(charge) === "checkout"),
    unresolved.filter((kind) => checkoutKinds.has(kind)),
  );
  const importTaxAndDuty = taxGroup(
    charges.filter((charge) => phase(charge) === "import"),
    unresolved.filter((kind) => importKinds.has(kind)),
  );
  let taxHandoff: CheckoutPreview["taxHandoff"] = "not_evaluated";
  if (checkoutTax.charges.some(({ kind }) => kind === "sales_vat_gst")) {
    if (assessment.findings.some(({ code }) => code === "TAX_EVIDENCE_REQUIRED"))
      taxHandoff = "evidence_required";
    else if (importTaxAndDuty.charges.some(
      (charge) => charge.kind === "import_vat_gst" && charge.collection === "not_applicable",
    ))
      taxHandoff = "evidence_present";
  }
  return {
    schemaVersion: "1.0",
    context,
    status: requiresRequote && assessment.status === "partial_estimate" ? "needs_review" : assessment.status,
    ruleSetVersion: assessment.ruleSetVersion,
    requestDigest: assessment.requestDigest,
    assessedAt: assessment.assessedAt,
    expiresAt: tariffThrough ? new Date(Math.min(
      Date.parse(assessment.expiresAt), Date.parse(tariffThrough + "T23:59:59.999+09:00") + 1,
    )).toISOString() : assessment.expiresAt,
    importDate: assessment.importDate,
    route: assessment.route,
    goodsSubtotal: money(shipment.items.reduce((subtotal, item) =>
      subtotal + minor(item.unitValue, shipment.currency) * BigInt(item.quantity), 0n,
    ), shipment.currency),
    customsAmountHold: { required: holdReasons.length > 0, reasons: holdReasons },
    checkoutTax,
    importTaxAndDuty,
    otherUnresolvedCharges: unresolved.filter(
      (kind) => !checkoutKinds.has(kind) && !importKinds.has(kind),
    ),
    taxHandoff,
    requiresRequote,
    checkoutReady: assessment.checkoutReady,
    shippingAuthorized: assessment.shippingAuthorized,
    landedCostTotal: assessment.landedCostTotal,
    findings: assessment.findings,
    sourceIds: assessment.sourceIds,
    sources: assessment.sources,
    documents: assessment.documents,
  };
}

function previewAssessedShipment(
  shipment: Shipment, assessment: Assessment, context: CheckoutPreview["context"],
  now: Date, catalog: TariffCatalog, customsTerritory?: string, lines?: ReadonlyMap<string, CustomsPlanLineInput>,
): CheckoutPreview {
  return checkoutPreview(assessment, context, now, {
    shipment,
    tariffLookup: (item) => {
      const code = lines?.get(item.id)?.tariffCode ?? item.hs6;
      return code ? catalog.lookup({
        destinationCountry: shipment.destinationCountry, originCountry: item.originCountry,
        code, date: shipment.importDate, zone: shipment.destinationZone,
        ...(customsTerritory === undefined ? {} : { customsTerritory }),
      }) : undefined;
    },
  });
}

/** Preview a service-supplied shipment without binding it to an order. */
export function previewCheckout(
  input: unknown, data: Dataset, now = new Date(), catalog = loadTariffCatalog(data),
): CheckoutPreview {
  const shipment = parseShipment(input);
  return previewAssessedShipment(shipment, assess(shipment, data, now), "shipment_preview", now, catalog);
}

/** Preview a merchant order using its verified grant and current cart/address versions. */
export async function previewVeygritCheckout(
  input: VeygritOrderRequest,
  ports: VeygritPorts,
  data: Dataset,
  now = new Date(),
  catalog = loadTariffCatalog(data),
): Promise<CheckoutPreview> {
  return withVerifiedOrder(input, ports, now, (shipment, order, scope, grantExpiry) => {
    const assessment = assess(shipment, data, now);
    assessment.expiresAt = capAtGrantExpiry(assessment.expiresAt, grantExpiry);
    const lines = order.customs?.lines
      ? checkCustomsPlanLines(parseCustomsPlan({ shipment, lines: order.customs.lines })) : undefined;
    return previewAssessedShipment(shipment, assessment, "verified_order_preview", now, catalog,
      scope.zone === "special" ? scope.customsTerritory : undefined, lines);
  });
}
