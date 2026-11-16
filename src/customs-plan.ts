import { classify } from "./assistant.ts";
import { checkoutPreview, type CheckoutPreview } from "./checkout.ts";
import { todayJst } from "./dataset.ts";
import { assess, EU_COUNTRIES, requestDigest } from "./engine.ts";
import { confirmedCustomsValues, hasRequiredImportCodeLength, isPublishedTariff, lineDutyScenario, type LineDutyScenario } from "./duty-scenario.ts";
import { money } from "./money.ts";
import { tradeBlocChecks, type TradeBlocCheck } from "./trade-blocs.ts";
import { reviewTransitRoute, type TransitReview } from "./transit-route.ts";
import { reviewSpecialProcedures, specialProcedureReferences, type SpecialProcedureCheck } from "./special-procedures.ts";
import { reviewSpecialTerritories, type SpecialTerritoryReview } from "./special-territories.ts";
import { importControlReferences, reviewImportIntake, type ImportIntakeCheck } from "./import-controls.ts";
import { customsFeeReferences, type CustomsFeeReference } from "./customs-fees.ts";
import { regionalCustomsProfile, type RegionalCustomsProfile } from "./regional-customs.ts";
import { checkCustomsPlanLines, InputError, parseCustomsPlan } from "./schema.ts";
import type { DestinationCustomsProfile, TariffCatalog, TariffLookupResult, TariffSnapshot } from "./tariffs.ts";
import { customsDocumentCodes } from "./types.ts";
import type {
  Amount, CustomsDocumentCode, CustomsPlanRequest, Dataset, Item, Shipment, Source,
} from "./types.ts";
import { capAtGrantExpiry, withVerifiedOrder, type VeygritOrderRequest, type VeygritPorts } from "./veygrit.ts";

function snapshotReference(snapshot: TariffSnapshot) {
  const {
    id, role, jurisdiction, scope, edition, availableFrom, availableThrough, checkedOn, sourceUrl, sha256,
  } = snapshot;
  return {
    id, role: role ?? "tariff", jurisdiction, scope, edition, availableFrom, availableThrough, checkedOn,
    sourceUrl, sha256, charges: snapshot.statistics.charges ?? [],
  };
}

function lineReferences(lookup: TariffLookupResult) {
  const { status, totalMatches, nextOffset, matches, measures } = lookup;
  return {
    status, totalMatches, nextOffset, matches,
    snapshotId: status === "date_not_covered" ? null : lookup.snapshot?.id ?? null,
    measures: {
      status: measures.status,
      totalMatches: measures.totalMatches,
      nextOffset: measures.nextOffset,
      matches: measures.matches,
      activeSnapshotIds: measures.sources.filter(({ referenceDate }) => referenceDate !== null)
        .map(({ snapshot }) => snapshot.id),
    },
  };
}

export interface CustomsPlanLine {
  itemId: string;
  quantity: number;
  originCountry: string;
  tariffCode: string | null;
  classification: "confirmed" | "candidate" | "missing";
  restrictionHints: string[];
  confirmedCustomsValue: Amount | null;
  tariffReferences: ReturnType<typeof lineReferences> | null;
  dutyScenario: LineDutyScenario;
}

export interface CustomsDocumentCheck {
  code: CustomsDocumentCode;
  stage: "shipment" | "export" | "import";
  status: "provided" | "prepare_for_review" | "check_requirement";
}

export interface CustomsPlan {
  schemaVersion: "1.0";
  requestDigest: string;
  importDate: string;
  origin: DestinationCustomsProfile | null;
  destination: DestinationCustomsProfile | null;
  destinationProcedures: RegionalCustomsProfile | null;
  feeReferences: CustomsFeeReference[];
  importIntake: ImportIntakeCheck[];
  specialTerritories: SpecialTerritoryReview | null;
  specialProcedures: SpecialProcedureCheck[];
  tradeBlocs: TradeBlocCheck[];
  transitReview: TransitReview | null;
  originCustomsTerritory: string | null;
  customsTerritory: string | null;
  originZone: Shipment["originZone"];
  destinationZone: Shipment["destinationZone"];
  checkout: CheckoutPreview;
  tariffCoverage: {
    status: "published_for_date" | "reference_for_date" | "other_dates_only" | "official_sources_only" |
      "territory_review" | "outside_scope";
    datedReferences: ReturnType<typeof snapshotReference>[];
    otherDateReferences: ReturnType<typeof snapshotReference>[];
  };
  lines: CustomsPlanLine[];
  baseDutyScenario: {
    status: "not_requested" | "review_required" | "partial" | "calculated";
    knownSubtotal: Amount | null;
    unresolvedItemIds: string[];
  };
  handoff: {
    status: "outside_scope" | "domestic_review" | "route_review" | "missing_information" | "available_for_review";
    incoterm: NonNullable<Shipment["incoterm"]> | null;
    transaction: Shipment["transaction"];
    transport: Shipment["transport"];
    regime: Shipment["regime"];
    missingInputs: string[];
    documents: CustomsDocumentCheck[];
    requiresReview: true;
  };
  guidanceSources: Source[];
}

function tariffCoverage(
  shipment: Shipment,
  destination: DestinationCustomsProfile | null,
  customsTerritory: string | undefined,
  catalog: TariffCatalog,
): CustomsPlan["tariffCoverage"] {
  if (!destination) return { status: "outside_scope", datedReferences: [], otherDateReferences: [] };
  const references = catalog.destinationSnapshots(shipment.destinationCountry, shipment.destinationZone, customsTerritory);
  const dated = references.filter(({ availableFrom, availableThrough }) =>
    availableFrom <= shipment.importDate && shipment.importDate <= availableThrough);
  const datedTariffs = dated.filter(({ role }) => !role);
  let status: CustomsPlan["tariffCoverage"]["status"] = "official_sources_only";
  if (shipment.destinationZone === "unknown" ||
      (shipment.destinationZone === "special" && !references.length && !destination.generalDutyPolicy))
    status = "territory_review";
  else if (datedTariffs.some(isPublishedTariff)) status = "published_for_date";
  else if (datedTariffs.length) status = "reference_for_date";
  else if (references.some(({ role }) => !role)) status = "other_dates_only";
  const datedIds = new Set(dated.map(({ id }) => id));
  return {
    status,
    datedReferences: dated.map(snapshotReference),
    otherDateReferences: references.filter(({ id }) => !datedIds.has(id)).map(snapshotReference),
  };
}

function documentChecks(
  shipment: Shipment,
  checkout: CheckoutPreview,
  available: Set<CustomsDocumentCode>,
  restricted: boolean,
): CustomsDocumentCheck[] {
  if (checkout.status === "out_of_scope" || checkout.route === "domestic") return [];
  const checks: CustomsDocumentCheck[] = [];
  const add = (code: CustomsDocumentCode, stage: CustomsDocumentCheck["stage"], core = false) => {
    checks.push({ code, stage, status: available.has(code) ? "provided" :
      core ? "prepare_for_review" : "check_requirement" });
  };
  const sale = ["b2b_sale", "b2c_sale"].includes(shipment.transaction);
  add(sale ? "COMMERCIAL_INVOICE" : "VALUE_EVIDENCE", "shipment", true);
  add("PACKING_LIST", "shipment", sale);
  add("TRANSPORT_DOCUMENT", "shipment", true);
  if (checkout.route === "eu_intra_union") {
    if (restricted) add("PERMIT_OR_CERTIFICATE", "shipment");
    return checks;
  }
  add("EXPORT_DECLARATION", "export");
  add("IMPORT_DECLARATION", "import");
  add("ORIGIN_EVIDENCE", "import");
  if (sale) add("PREFERENCE_EVIDENCE", "import");
  if (shipment.transport === "post") add("POSTAL_CUSTOMS_DECLARATION", "shipment");
  if (restricted) add("PERMIT_OR_CERTIFICATE", "shipment");
  if (shipment.transaction === "return") add("RETURN_EVIDENCE", "import");
  for (const code of customsDocumentCodes)
    if ((sale || code !== "COMMERCIAL_INVOICE") &&
        checkout.documents.includes(code) && !checks.some((check) => check.code === code))
      add(code, "import");
  return checks;
}

function handoff(
  input: CustomsPlanRequest,
  checkout: CheckoutPreview,
  lines: CustomsPlanLine[],
  importIntake: readonly ImportIntakeCheck[],
  specialProcedures: readonly SpecialProcedureCheck[],
): CustomsPlan["handoff"] {
  const { shipment } = input;
  const restricted = shipment.items.some(({ goodsType }) => goodsType !== "ordinary") ||
    lines.some(({ restrictionHints }) => restrictionHints.length > 0);
  const documents = documentChecks(shipment, checkout, new Set(input.availableDocuments ?? []), restricted);
  const missingInputs: string[] = [];
  if (checkout.findings.some(({ code }) => code === "TRADE_BLOC_REVIEW"))
    missingInputs.push("REVIEW_TRADE_BLOC");
  if (checkout.findings.some(({ code }) => code === "TRANSIT_CUSTOMS_REVIEW" || code === "TRANSIT_TRADE_REVIEW"))
    missingInputs.push("CONFIRM_TRANSIT_ROUTE");
  if (checkout.status !== "out_of_scope" && checkout.route === "unresolved")
    missingInputs.push("CONFIRM_CUSTOMS_TERRITORIES");
  if (checkout.route === "cross_border") {
    if (!shipment.consignmentScopeConfirmed) missingInputs.push("CONFIRM_CONSIGNMENT");
    if (shipment.inventoryStatus !== "free_circulation" &&
        !(shipment.destinationCountry === "CN" && shipment.regime === "cn_1210" && shipment.inventoryStatus === "bonded"))
      missingInputs.push("CONFIRM_INVENTORY_STATUS");
    if (shipment.regime === "unknown") missingInputs.push("CONFIRM_IMPORT_PROCEDURE");
    if (lines.some(({ classification }) => classification !== "confirmed"))
      missingInputs.push("CONFIRM_ITEM_CLASSIFICATION");
    if (lines.some(({ confirmedCustomsValue }) => confirmedCustomsValue === null))
      missingInputs.push("CONFIRM_ALLOCATED_CUSTOMS_VALUE");
    if (!shipment.incoterm || shipment.incoterm === "other") missingInputs.push("CONFIRM_DELIVERY_TERMS");
  }
  if (documents.some(({ status }) => status === "prepare_for_review")) missingInputs.push("GATHER_CORE_DOCUMENTS");
  if (importIntake.some(({ status }) => status === "documents_needed")) missingInputs.push("GATHER_IMPORT_CONTROL_DOCUMENTS");
  if (checkout.status !== "out_of_scope" && (input.lines ?? []).some(({ preferenceAgreement }) => preferenceAgreement)) {
    const selected = new Set(specialProcedures.flatMap(({ selectedItemIds }) => selectedItemIds));
    if (input.lines?.some(({ itemId, preferenceAgreement }) => preferenceAgreement && !selected.has(itemId)))
      missingInputs.push("CONFIRM_PREFERENCE_AGREEMENT_SCOPE");
    if (selected.size) missingInputs.push("REVIEW_PREFERENCE_EVIDENCE");
  }
  const status = checkout.status === "out_of_scope" ? "outside_scope"
    : checkout.route === "domestic" ? "domestic_review"
    : checkout.route !== "cross_border" ? "route_review"
    : missingInputs.length ? "missing_information" : "available_for_review";
  return {
    status, transaction: shipment.transaction, transport: shipment.transport, regime: shipment.regime,
    incoterm: shipment.incoterm ?? null, missingInputs, documents, requiresReview: true,
  };
}

const guidanceIds = new Set([
  "primary-wco-hs", "primary-wco-valuation", "primary-wco-origin", "primary-wco-clearance",
  "primary-upu-postal", "primary-wto-advance-ruling",
]);

export function planCustoms(input: unknown, data: Dataset, catalog: TariffCatalog, now = new Date()): CustomsPlan {
  const request = parseCustomsPlan(input);
  const { shipment, originCustomsTerritory, customsTerritory } = request;
  if (originCustomsTerritory !== undefined && shipment.originZone !== "special")
    throw new InputError([{ path: "/originCustomsTerritory", code: "SPECIAL_ORIGIN_REQUIRED" }]);
  if (customsTerritory !== undefined && shipment.destinationZone !== "special")
    throw new InputError([{ path: "/customsTerritory", code: "SPECIAL_DESTINATION_REQUIRED" }]);
  const assessment = assess(shipment, data, now);
  const specialTerritories = assessment.status === "out_of_scope" ? null : reviewSpecialTerritories(data, {
    ...shipment, ...(originCustomsTerritory === undefined ? {} : { originCustomsTerritory }),
    ...(customsTerritory === undefined ? {} : { customsTerritory }),
  }, shipment.importDate);
  const tradeBlocs = assessment.status === "out_of_scope" ? [] :
    tradeBlocChecks(data, shipment.originCountry, shipment.destinationCountry, shipment.importDate, assessment.route !== "eu_intra_union");
  const itinerary = reviewTransitRoute(shipment.transitRoute, shipment.originCountry, shipment.loadingCountry);
  const transitNeedsReview = assessment.findings.some(({ code }) =>
    code === "TRANSIT_CUSTOMS_REVIEW" || code === "TRANSIT_TRADE_REVIEW");
  const transitReview: TransitReview | null = assessment.status === "out_of_scope" ? null
    : transitNeedsReview && !itinerary.requiresReview ? { ...itinerary, status: "route_review", requiresReview: true } : itinerary;
  const routeHold = transitNeedsReview || assessment.findings.some(({ code }) => code === "TRADE_BLOC_REVIEW");
  const options = checkCustomsPlanLines(request);
  let values: Map<string, bigint>;
  try {
    values = confirmedCustomsValues(shipment, options);
  } catch (error) {
    const code = error instanceof RangeError && error.message === "CUSTOMS_VALUE_TOTAL_MISMATCH"
      ? "CUSTOMS_VALUE_TOTAL_MISMATCH" : "INVALID_CUSTOMS_VALUE";
    throw new InputError([{ path: "/lines", code }]);
  }

  const origin = catalog.destinationCustomsProfile(shipment.originCountry, shipment.importDate, shipment.originZone, originCustomsTerritory);
  const destination = catalog.destinationCustomsProfile(
    shipment.destinationCountry, shipment.importDate, shipment.destinationZone, customsTerritory,
  );
  const flatDutyNeedsReview = assessment.findings.some(({ code }) =>
    code === "EU_DECLARATION_ITEM_COUNT_REQUIRED" || code === "EU_PROCEDURE_REVIEW");
  const context = {
    shipment, reviewedOn: todayJst(now),
    crossBorder: assessment.route === "cross_border" && !flatDutyNeedsReview,
    outOfScope: assessment.status === "out_of_scope" || routeHold,
    specialisedDutyAvailable: Date.parse(assessment.expiresAt) > now.getTime() &&
      assessment.charges.some(({ kind }) => kind === "customs_duty"),
    zeroPolicy: destination?.generalDutyPolicy ?? null,
  };
  const lookups = new Map<string, TariffLookupResult>();
  const itemLookups = new Map<string, TariffLookupResult>();
  const lookupLine = (item: Item, code: string): TariffLookupResult => {
    const key = item.originCountry + ":" + code;
    const existing = lookups.get(key);
    if (existing) return existing;
    const result = catalog.lookup({
      code, destinationCountry: shipment.destinationCountry, originCountry: item.originCountry,
      date: shipment.importDate, zone: shipment.destinationZone, limit: 5, measureLimit: 8,
      ...(customsTerritory === undefined ? {} : { customsTerritory }),
    });
    lookups.set(key, result);
    return result;
  };
  let subtotal = 0n;
  let calculatedCount = 0;
  const lines = shipment.items.map((item): CustomsPlanLine => {
    const line = options.get(item.id);
    const code = line?.tariffCode ?? item.hs6;
    const lookup = code && assessment.status !== "out_of_scope" ? lookupLine(item, code) : undefined;
    const hasMoreSpecificCodes = lookup?.status === "national_line_candidates" &&
      (lookup.nextOffset !== null || lookup.matches.some((match) => match.code !== code));
    if (lookup) itemLookups.set(item.id, lookup);
    const absentFromDatedSchedule = lookup?.status === "code_not_found" && lookup.referenceDate === shipment.importDate &&
      (lookup.snapshot?.scope === "national_schedule" || lookup.snapshot?.id.startsWith("eu-cn-"));
    const confirmed = item.classificationConfirmed && line?.tariffCode && !hasMoreSpecificCodes && !absentFromDatedSchedule &&
      hasRequiredImportCodeLength(shipment.destinationCountry, line.tariffCode);
    const value = values.get(item.id);
    const scenario = lineDutyScenario(context, item, line, line?.tariffCode, value, lookup);
    let dutyScenario: LineDutyScenario = scenario;
    if (scenario.status === "calculated") {
      const { minorUnits, ...calculation } = scenario;
      subtotal += minorUnits;
      calculatedCount++;
      dutyScenario = calculation;
    }
    return {
      itemId: item.id, quantity: item.quantity, originCountry: item.originCountry, tariffCode: code ?? null,
      classification: !code ? "missing" : confirmed ? "confirmed" : "candidate",
      restrictionHints: classify({ description: item.description }).categoryHints,
      confirmedCustomsValue: value === undefined ? null : money(value, shipment.currency),
      tariffReferences: lookup ? lineReferences(lookup) : null,
      dutyScenario,
    };
  });
  const zeroDutyPolicyThrough = lines.every(({ dutyScenario }) =>
    dutyScenario.status === "calculated" && dutyScenario.basis === "confirmed_zero_duty_policy")
    ? context.zeroPolicy?.availableThrough : undefined;
  const checkout = checkoutPreview(assessment, "shipment_preview", now, {
    shipment,
    tariffLookup: (item) => itemLookups.get(item.id),
    ...(zeroDutyPolicyThrough === undefined ? {} : { zeroDutyPolicyThrough }),
  });
  const importIntake = assessment.status !== "out_of_scope" && assessment.route !== "domestic"
    ? reviewImportIntake(importControlReferences(data, shipment.destinationCountry, shipment.importDate),
      shipment, options, request.availableDocuments ?? []) : [];
  const documentaryCrossBorder = routeHold && specialTerritories?.requiresRouteReview === false &&
    shipment.originCountry !== shipment.destinationCountry &&
    !(EU_COUNTRIES.has(shipment.originCountry) && EU_COUNTRIES.has(shipment.destinationCountry));
  const specialProcedures = assessment.status !== "out_of_scope" &&
      (assessment.route === "cross_border" || documentaryCrossBorder)
    ? reviewSpecialProcedures(specialProcedureReferences(data, shipment.destinationCountry, shipment.importDate),
      shipment, options, request.availableDocuments ?? [], (itemId) => itemLookups.get(itemId),
      assessment.route === "cross_border" && specialTerritories?.requiresRouteReview === false) : [];
  const unresolved = lines.filter(({ dutyScenario }) => dutyScenario.status !== "calculated");
  const anyRequested = lines.some(({ dutyScenario }) => dutyScenario.status !== "not_requested");
  return {
    schemaVersion: "1.0",
    requestDigest: requestDigest(request),
    importDate: shipment.importDate,
    origin, destination, customsTerritory: customsTerritory ?? null,
    destinationProcedures: shipment.destinationZone === "standard" && destination
      ? regionalCustomsProfile(data, shipment.destinationCountry) : null,
    feeReferences: assessment.route === "cross_border" && assessment.status !== "out_of_scope"
      ? customsFeeReferences(data, shipment.destinationCountry, shipment.importDate, shipment.transport) : [],
    importIntake, specialTerritories, specialProcedures, tradeBlocs, transitReview, originCustomsTerritory: originCustomsTerritory ?? null,
    originZone: shipment.originZone, destinationZone: shipment.destinationZone, checkout,
    tariffCoverage: tariffCoverage(shipment, destination, customsTerritory, catalog),
    lines,
    baseDutyScenario: {
      status: !anyRequested ? "not_requested" : !calculatedCount ? "review_required"
        : unresolved.length ? "partial" : "calculated",
      knownSubtotal: calculatedCount ? money(subtotal, shipment.currency) : null,
      unresolvedItemIds: anyRequested ? unresolved.map(({ itemId }) => itemId) : [],
    },
    handoff: handoff(request, checkout, lines, importIntake, specialProcedures),
    guidanceSources: data.sources.filter(({ id }) => guidanceIds.has(id)),
  };
}

export function planVeygritOrder(
  input: VeygritOrderRequest,
  ports: VeygritPorts,
  data: Dataset,
  catalog: TariffCatalog,
  now = new Date(),
): Promise<CustomsPlan> {
  return withVerifiedOrder(input, ports, now, (shipment, order, scope, grantExpiry) => {
    const { lines, availableDocuments, originCustomsTerritory } = order.customs ?? {};
    const result = planCustoms({
      shipment,
      ...(lines === undefined ? {} : { lines }),
      ...(availableDocuments === undefined ? {} : { availableDocuments }),
      ...(originCustomsTerritory === undefined ? {} : { originCustomsTerritory }),
      ...(scope.zone === "special" && scope.customsTerritory ? { customsTerritory: scope.customsTerritory } : {}),
    }, data, catalog, now);
    result.checkout.context = "verified_order_preview";
    result.checkout.expiresAt = capAtGrantExpiry(result.checkout.expiresAt, grantExpiry);
    return result;
  });
}
