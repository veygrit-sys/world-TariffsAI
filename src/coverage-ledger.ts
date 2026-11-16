import { currentRule, todayJst } from "./dataset.ts";
import { calculationRuleId } from "./engine.ts";
import { isPublishedTariff } from "./duty-scenario.ts";
import type { TariffCatalog, TariffRate, TariffSnapshot } from "./tariffs.ts";
import type { GeneralDutyPolicy } from "./territories.ts";
import type { Charge, Dataset, Source } from "./types.ts";
import type { OfficialCustomsSource } from "./wco.ts";

type ChargeKind = TariffRate["charge"];

export interface LedgerTariffReference {
  snapshotId: string;
  customsTerritory: string;
  zone: TariffSnapshot["zone"];
  scope: TariffSnapshot["scope"];
  role: "tariff" | "measures";
  sourceUrl: string;
  availableFrom: string;
  availableThrough: string;
  charges: ChargeKind[];
}

export interface LedgerCalculationRule {
  ruleId: string;
  currency: string;
  threshold: string;
  validFrom: string;
  validTo: string | null;
  reviewBy: string;
  sources: Source[];
  chargeKinds: Charge["kind"][];
  conditions: string[];
}

export interface LedgerDestination {
  destinationCountry: string;
  name: string;
  nameJa: string;
  membershipStatus: "member" | "outside_wco_roster";
  officialSources: OfficialCustomsSource[];
  generalDutyPolicies: GeneralDutyPolicy[];
  standardTariffStatus:
    | "tariff_reference_on_date"
    | "tariff_reference_other_date"
    | "official_sources_only"
    | "registry_only";
  referencesOnDate: LedgerTariffReference[];
  pastReferences: LedgerTariffReference[];
  futureReferences: LedgerTariffReference[];
  chargeReferencesOnDate: {
    importVatOrGst: string[];
    excise: string[];
    additionalDutyOrTradeRemedy: string[];
  };
  conditionalCalculationRules: LedgerCalculationRule[];
  customsPlanAvailable: true;
  publishedStandardTariffSnapshotIdsOnDate: string[];
  commerciallyAuthorised: false;
}

export interface CoverageLedger {
  referenceDate: string;
  checkedOn: string;
  ruleSetVersion: string;
  commonCalculationConditions: string[];
  totals: {
    destinations: number;
    wcoMembers: number;
    outsideWcoRoster: number;
    withOfficialSources: number;
    withStandardTariffReferenceOnDate: number;
    withStandardTariffReferenceOtherDateOnly: number;
    withImportVatOrGstReferenceOnDate: number;
    withExciseReferenceOnDate: number;
    withAdditionalDutyOrTradeRemedyReferenceOnDate: number;
    withGeneralDutyPolicyOnDate: number;
    withConditionalCalculationRules: number;
    withCustomsPlan: number;
    withPublishedStandardTariffOnDate: number;
    commerciallyAuthorisedDestinations: number;
  };
  destinations: LedgerDestination[];
}

// These entries describe the branches implemented in assess(). The ledger
// exposes their possible scope; assess() checks the actual shipment and source dates.
const ruleCoverage: Record<string, {
  chargeKinds: Charge["kind"][];
  conditions: string[];
}> = {
  GB_LOW_VALUE: {
    chargeKinds: ["customs_duty", "sales_vat_gst", "import_vat_gst"],
    conditions: [
      "Direct sale in the standard regime. Dispatch from Jersey and Guernsey falls outside this rule.",
      "Threshold based on aggregate intrinsic goods value.",
      "Checkout VAT requires confirmed standard tax and seller registration. Zero import VAT requires confirmed tax handoff evidence.",
    ],
  },
  EU_TEMP_LOW_VALUE: {
    chargeKinds: ["customs_duty"],
    conditions: [
      "Registered IOSS sale. For standard imports from November 2026, confirm distance-sale flat-duty treatment with the declarant.",
      "The threshold uses aggregate intrinsic goods value. Duty uses the confirmed number of items in the customs declaration.",
    ],
  },
  SG_LOW_VALUE: {
    chargeKinds: ["customs_duty", "sales_vat_gst", "import_vat_gst"],
    conditions: [
      "Standard-regime air or postal shipment of confirmed non-dutiable goods.",
      "Registered seller branch uses per-unit goods value and confirmed standard tax for checkout GST. Zero import GST requires tax handoff evidence.",
      "The non-registered seller branch uses aggregated goods, freight and insurance for import GST. Above the threshold the standard tax rate requires confirmation.",
    ],
  },
  JP_LOW_VALUE: {
    chargeKinds: ["customs_duty", "import_vat_gst"],
    conditions: [
      "Standard regime with confirmed total customs value within the threshold.",
      "Low-value relief eligibility confirmed for every item.",
    ],
  },
  AU_LOW_VALUE_POST: {
    chargeKinds: ["customs_duty"],
    conditions: [
      "Standard-regime postal shipment with confirmed customs value within the threshold.",
    ],
  },
  NZ_LOW_VALUE: {
    chargeKinds: ["customs_duty", "sales_vat_gst", "import_vat_gst"],
    conditions: [
      "Standard regime with aggregate goods value within the threshold.",
      "Checkout GST requires confirmed standard tax and seller registration. Zero import GST requires confirmed tax handoff evidence.",
    ],
  },
};

export function coverageLedger(
  dataset: Dataset,
  catalog: TariffCatalog,
  referenceDate: string,
  now = new Date(),
): CoverageLedger {
  const wco = catalog.wcoCoverage(referenceDate);
  const territories = catalog.territoryCoverage(referenceDate);
  const officialSources = new Map<string, readonly OfficialCustomsSource[]>([
    ...wco.members.map(({ memberId, officialSources }) =>
      [memberId, officialSources] as const),
    ...territories.nonMemberDestinations.map(({ destinationCountry, officialSources }) =>
      [destinationCountry, officialSources] as const),
  ]);
  const memberIds = new Set(wco.members.map(({ memberId }) => memberId));
  const { snapshots, measureSnapshots } = catalog.coverage();
  const referencesByDestination = new Map<string, LedgerTariffReference[]>();
  for (const snapshot of [...snapshots, ...measureSnapshots]) {
    const reference: LedgerTariffReference = {
      snapshotId: snapshot.id,
      customsTerritory: snapshot.jurisdiction,
      zone: snapshot.zone,
      scope: snapshot.scope,
      role: snapshot.role ?? "tariff",
      sourceUrl: snapshot.sourceUrl,
      availableFrom: snapshot.availableFrom,
      availableThrough: snapshot.availableThrough,
      charges: [...(snapshot.statistics.charges ?? [])],
    };
    for (const code of snapshot.countries) {
      const references = referencesByDestination.get(code) ?? [];
      references.push(reference);
      referencesByDestination.set(code, references);
    }
  }
  const activeRules = new Map<string, LedgerCalculationRule>();
  for (const [id, scope] of Object.entries(ruleCoverage)) {
    const rule = currentRule(dataset, id, referenceDate, now);
    if (!rule) continue;
    const sources = dataset.sources
      .filter(({ id }) => rule.sourceIds.includes(id))
      .map((source) => ({ ...source }));
    activeRules.set(id, {
      ruleId: id,
      currency: rule.currency,
      threshold: rule.threshold,
      validFrom: rule.validFrom,
      validTo: rule.validTo,
      reviewBy: [rule.reviewBy, ...sources.map((source) => source.reviewBy)].sort()[0]!,
      sources,
      ...scope,
    });
  }
  const destinations: LedgerDestination[] = [...dataset.countries, ...dataset.supplementalRegions]
    .filter(({ inScope }) => inScope)
    .sort((first, second) => first.code.localeCompare(second.code))
    .map(({ code, name, nameJa }) => {
      const references = referencesByDestination.get(code) ?? [];
      const pastReferences = references.filter((reference) => reference.availableThrough < referenceDate);
      const futureReferences = references.filter((reference) => referenceDate < reference.availableFrom);
      const referencesOnDate = references.filter((reference) =>
        reference.availableFrom <= referenceDate && referenceDate <= reference.availableThrough);
      const isStandardTariff = (reference: LedgerTariffReference) =>
        reference.role === "tariff" && reference.zone === "standard";
      const sources = (officialSources.get(code) ?? []).map((source) => ({ ...source }));
      const tariffStatus = referencesOnDate.some(isStandardTariff)
        ? "tariff_reference_on_date"
        : references.some(isStandardTariff)
          ? "tariff_reference_other_date"
          : sources.length
            ? "official_sources_only"
            : "registry_only";
      const chargeReferences = (...charges: ChargeKind[]) => referencesOnDate
        .filter((reference) => reference.charges.some((charge) => charges.includes(charge)))
        .map((reference) => reference.snapshotId);
      const ruleId = calculationRuleId(code);
      const rule = ruleId ? activeRules.get(ruleId) : undefined;
      return {
        destinationCountry: code,
        name,
        nameJa,
        membershipStatus: memberIds.has(code) ? "member" : "outside_wco_roster",
        officialSources: sources,
        generalDutyPolicies: territories.generalDutyPolicies
          .filter((policy) => policy.destinationCountry === code)
          .map((policy) => ({
            ...policy,
            sources: policy.sources.map((source) => ({ ...source })),
          })),
        standardTariffStatus: tariffStatus,
        referencesOnDate,
        pastReferences,
        futureReferences,
        chargeReferencesOnDate: {
          importVatOrGst: chargeReferences("import_vat", "import_gst"),
          excise: chargeReferences("excise"),
          additionalDutyOrTradeRemedy: chargeReferences("additional_duty", "trade_remedy"),
        },
        conditionalCalculationRules: rule ? [rule] : [],
        customsPlanAvailable: true,
        publishedStandardTariffSnapshotIdsOnDate: referencesOnDate
          .filter((reference) => isStandardTariff(reference) && isPublishedTariff(reference))
          .map(({ snapshotId }) => snapshotId),
        commerciallyAuthorised: false,
      };
    });
  const count = (predicate: (destination: LedgerDestination) => boolean) => destinations.filter(predicate).length;
  return {
    referenceDate,
    checkedOn: todayJst(now),
    ruleSetVersion: dataset.version,
    commonCalculationConditions: [
      "Cross-border B2C sale between standard territories, excluding intra-EU shipments.",
      "Free-circulation inventory, ordinary goods and confirmed consignment scope.",
      "Rule currency, valid import date and current primary sources.",
    ],
    totals: {
      destinations: destinations.length,
      wcoMembers: count((destination) => destination.membershipStatus === "member"),
      outsideWcoRoster: count((destination) => destination.membershipStatus === "outside_wco_roster"),
      withOfficialSources: count((destination) => destination.officialSources.length > 0),
      withStandardTariffReferenceOnDate: count((destination) => destination.standardTariffStatus === "tariff_reference_on_date"),
      withStandardTariffReferenceOtherDateOnly: count((destination) => destination.standardTariffStatus === "tariff_reference_other_date"),
      withImportVatOrGstReferenceOnDate: count((destination) => destination.chargeReferencesOnDate.importVatOrGst.length > 0),
      withExciseReferenceOnDate: count((destination) => destination.chargeReferencesOnDate.excise.length > 0),
      withAdditionalDutyOrTradeRemedyReferenceOnDate: count((destination) => destination.chargeReferencesOnDate.additionalDutyOrTradeRemedy.length > 0),
      withGeneralDutyPolicyOnDate: count((destination) => destination.generalDutyPolicies.length > 0),
      withConditionalCalculationRules: count((destination) => destination.conditionalCalculationRules.length > 0),
      withCustomsPlan: count((destination) => destination.customsPlanAvailable),
      withPublishedStandardTariffOnDate: count((destination) => destination.publishedStandardTariffSnapshotIdsOnDate.length > 0),
      commerciallyAuthorisedDestinations: 0,
    },
    destinations,
  };
}
