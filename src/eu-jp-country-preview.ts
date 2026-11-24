import { currentRule, sourcesCurrent, todayJst } from "./dataset.ts";
import type { CountryPreview } from "./country-preview-types.ts";
import type { Assessment, Dataset, Shipment } from "./types.ts";
import { minor, money } from "./money.ts";

type Evidence = Record<string, unknown>;

function hasKeys(input: unknown, allowed: string[]): input is Evidence {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    && Object.keys(input).every(key => allowed.includes(key));
}

// Each checkout line must occur in precisely one broker-confirmed declaration item.
// Grouping by HS alone cannot establish the accepted customs declaration.
function completeDeclaration(s: Shipment, rows: unknown) {
  if (!s.euDeclaration?.countConfirmed || !Array.isArray(rows) || rows.length !== s.euDeclaration.itemCount) return false;
  const items = new Map(s.items.map(item => [item.id, item]));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!Array.isArray(row) || !row.length) return false;
    let firstKey: string | undefined;
    for (const id of row) {
      const item = typeof id === "string" ? items.get(id) : undefined;
      if (!item?.classificationConfirmed || !item.hs6 || !item.productIdentifier || seen.has(id)) return false;
      const key = JSON.stringify([item.hs6, item.originCountry, item.description, item.productIdentifier]);
      if (firstKey && firstKey !== key) return false;
      firstKey = key;
      seen.add(id);
    }
  }
  return seen.size === items.size;
}

export function previewEuJp(s: Shipment, evidence: unknown, data: Dataset, now: Date, assessment: Assessment): CountryPreview {
  const jp = s.destinationCountry === "JP";
  const result: CountryPreview = { procedure: jp ? "JP_LOW_VALUE_RELIEF" : "EU_DISTANCE_SALE_DECLARATION", charges: [], reasons: [], sources: [] };
  const hold = (reason: string) => { result.reasons.push(reason); return result; };
  const ruleId = jp ? "JP_LOW_VALUE" : "EU_TEMP_LOW_VALUE";
  const rule = currentRule(data, ruleId, s.importDate, now);
  const feeIds = ["primary-eu-union-handling-fee", "primary-eu-duty-handling-guidance"];
  const ids = [...new Set([...(rule?.sourceIds ?? []), ...(jp ? [] : feeIds)])];
  result.sources = data.sources.filter(source => ids.includes(source.id)).map(({id,url,reviewBy}) => ({id,url,reviewBy}));
  if (!rule || todayJst(now) < "2026-11-25" || s.importDate < "2026-11-25" ||
      !sourcesCurrent(data, ids, s.importDate, now)) return hold("RULE_NOT_CURRENT");
  if (jp) {
    if (!hasKeys(evidence, ["reliefExclusionsReviewed", "aggregationConfirmed", "declaredCifBasisConfirmed"]) ||
      evidence.reliefExclusionsReviewed !== true || evidence.aggregationConfirmed !== true || evidence.declaredCifBasisConfirmed !== true) return hold("JP_RELIEF_EVIDENCE_REQUIRED");
    if (s.currency !== "JPY" || !s.customsValueConfirmed || !s.customsValue ||
        !s.items.every(i => i.classificationConfirmed && i.hs6 && ["960810", "960910", "482020"].includes(i.hs6)))
      return hold("JP_RELIEF_EVIDENCE_REQUIRED");
    const cif = s.items.reduce((sum, i) => sum + minor(i.unitValue, s.currency) * BigInt(i.quantity),
      minor(s.freight, s.currency) + minor(s.insurance, s.currency));
    if (cif <= 0n || minor(s.customsValue, s.currency) !== cif) return hold("CUSTOMS_VALUE_REQUIRED");
  } else {
    const keys = ["distanceSaleConfirmed", "declarationItems", "freeCirculationReleaseConfirmed", "f00DeclarantConfirmed", "intrinsicValueConfirmed", "declarationDataset", "declarationIdentifiersReviewed", "h7EligibilityConfirmed", "declarationReviewed", "y126Confirmed"];
    if (!hasKeys(evidence, keys) || evidence.declarationDataset !== "H7" || evidence.declarationIdentifiersReviewed !== true ||
        evidence.declarationReviewed !== true || evidence.h7EligibilityConfirmed !== true || evidence.distanceSaleConfirmed !== true ||
        evidence.freeCirculationReleaseConfirmed !== true || evidence.intrinsicValueConfirmed !== true ||
        (evidence.y126Confirmed !== undefined && typeof evidence.y126Confirmed !== "boolean") ||
        (evidence.f00DeclarantConfirmed !== undefined && typeof evidence.f00DeclarantConfirmed !== "boolean") ||
        s.euDeclaration?.flatDutyTreatmentConfirmed !== true) return hold("EU_DISTANCE_SALE_EVIDENCE_REQUIRED");
    if (!completeDeclaration(s, evidence.declarationItems)) return hold("EU_DECLARATION_ITEM_COUNT_REQUIRED");
  }
  const charges = assessment.charges.filter(charge => charge.ruleId === ruleId);
  if (!charges.length) {
    const details = assessment.findings.filter(f => f.severity === "review" &&
      !["ROUTE_RELEASE_REQUIRED","RESTRICTIONS_REVIEW","EXPORT_REVIEW","FTA_REVIEW","EU_HANDLING_FEE_REVIEW","GRANT_RECHECK_REQUIRED"].includes(f.code));
    result.reasons.push(...details.map(f => f.code));
    return hold("COUNTRY_PROCEDURE_REVIEW");
  }
  for (const charge of charges) {
    if (charge.kind === "sales_vat_gst") continue;
    result.charges.push({ category: charge.kind, ...charge.amount, collection: charge.collection, sourceIds: charge.sourceIds });
  }
  if (!jp) {
    if ((evidence as Evidence).f00DeclarantConfirmed === true && (evidence as Evidence).y126Confirmed === true) {
      result.charges.push({category:"customs_fee", ...money(BigInt(s.euDeclaration!.itemCount) * 200n, "EUR"),
        collection:"import", sourceIds:feeIds});
    } else result.reasons.push("EU_HANDLING_FEE_REVIEW");
    result.reasons.push("EU_VAT_UNRESOLVED", "BUYER_FEE_LIABILITY_UNCONFIRMED");
  }
  return hold("CARRIER_FEES_UNRESOLVED");
}
