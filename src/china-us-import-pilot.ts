import { countryPreviewReviews } from "./country-preview-review.ts";
import { Ajv } from "ajv";
import { sourcesCurrent, todayJst } from "./dataset.ts";
import type { CountryPreview } from "./country-preview-types.ts";
import { minor, money } from "./money.ts";
import { InputError } from "./schema.ts";
import type { Dataset, Shipment } from "./types.ts";

interface ChinaFacts {
  recordRef?: string;
  personalUseConfirmed?: boolean;
  channelFilingConfirmed?: boolean;
  quotaBeforeOrderConfirmed?: boolean;
  transactionAndBuyerAuthenticityReviewed?: boolean;
  buyerIdentityBasis?: "authority_certified" | "purchaser_is_payer";
  cnCommodityCode?: string;
  nonExciseStandardVatConfirmed?: boolean;
  importTaxCollection?: "checkout" | "import";
}
interface UsFacts {
  recordRef?: string;
  network?: "international_post" | "nonpostal";
  permanentFormalEntryTrigger?: "present" | "absent";
  pgaChapterOrPreferenceTrigger?: "present" | "absent";
}

const validator = new Ajv({ allErrors: true, strict: true });
const opaqueRef = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_.:-]{0,79}$" };
const boolean = { type: "boolean" };
const chinaFacts = validator.compile<ChinaFacts>({
  type: "object", additionalProperties: false, properties: {
    recordRef: opaqueRef, personalUseConfirmed: boolean, channelFilingConfirmed: boolean,
    quotaBeforeOrderConfirmed: boolean, transactionAndBuyerAuthenticityReviewed: boolean,
    buyerIdentityBasis: { enum: ["authority_certified", "purchaser_is_payer"] },
    cnCommodityCode: { type: "string", pattern: "^[0-9]{8}$" },
    nonExciseStandardVatConfirmed: boolean, importTaxCollection: { enum: ["checkout", "import"] },
  },
});
const usFacts = validator.compile<UsFacts>({
  type: "object", additionalProperties: false, properties: {
    recordRef: opaqueRef, network: { enum: ["international_post", "nonpostal"] },
    permanentFormalEntryTrigger: { enum: ["present", "absent"] },
    pgaChapterOrPreferenceTrigger: { enum: ["present", "absent"] },
  },
});

// The pilot uses the same JST observation cutoff as the source registry.
function withinPilotReview(country: "CN" | "US", importDate: string, now: Date): boolean {
  const { checkedOn: observed, reviewBy } = countryPreviewReviews[country];
  const today = todayJst(now);
  return today >= observed && today <= reviewBy && importDate >= observed && importDate <= reviewBy;
}

const { reviewBy } = countryPreviewReviews.CN;
const officialChina = [
  { id: "cn-pilot-cbec-tax", url: "https://fgk.chinatax.gov.cn/zcfgk/c102416/c5203746/content.html", reviewBy },
  { id: "cn-pilot-channel", url: "https://www.mofcom.gov.cn/zfxxgk/gkml/art/2018/art_1e2248ade45e4652a12c25d6a45e4f28.html", reviewBy },
  { id: "cn-pilot-consumer", url: "https://www.mofcom.gov.cn/zfxxgk/gkml/art/2021/art_1e97a9dbe17b45398e962927596b16f9.html", reviewBy },
  { id: "cn-pilot-positive-list", url: "https://gss.mof.gov.cn/gzdt/zhengcefabu/201912/P020191227607915178053.pdf", reviewBy },
  { id: "cn-pilot-positive-list-amendment", url: "https://gss.mof.gov.cn/gzdt/zhengcefabu/202202/P020220221322524635155.pdf", reviewBy },
  { id: "cn-pilot-excise", url: "https://guangdong.chinatax.gov.cn/gdsw/zssw_nsrwkt_tjss/2024-03/28/content_db6f319719374480baf7124b56270b83.shtml", reviewBy },
  { id: "cn-pilot-vat-law", url: "https://m.mof.gov.cn/zcfb/202412/t20241225_3950494.htm", reviewBy },
];

function chinaSources(result: CountryPreview, s: Shipment, now: Date, data: Dataset): boolean {
  const limit = data.sources.find(source => source.id === "primary-cn-limit");
  result.sources.push(...officialChina.map(source => ({ ...source })));
  if (limit) result.sources.push({ id: limit.id, url: limit.url, reviewBy: limit.reviewBy });
  return !!limit && limit.checkedOn <= s.importDate && sourcesCurrent(data, [limit.id], s.importDate, now) &&
    withinPilotReview("CN", s.importDate, now);
}

function china(s: Shipment, facts: ChinaFacts, data: Dataset, now: Date): CountryPreview {
  const out: CountryPreview = { procedure: "CN_CBEC_REVIEW", charges: [], reasons: [], sources: [] };
  if (!chinaSources(out, s, now, data)) return hold(out, "CN_PILOT_SOURCE_REVIEW");
  if (s.regime !== "cn_9610" && s.regime !== "cn_1210") return hold(out, "CN_GENERAL_IMPORT_TARIFF_REVIEW");
  if ((s.regime === "cn_1210" && s.inventoryStatus !== "bonded") ||
    (s.regime === "cn_9610" && s.inventoryStatus !== "free_circulation"))
    return hold(out, "CN_CBEC_INVENTORY_REGIME_REVIEW");
  if (s.currency !== "CNY") return hold(out, "CN_DECLARATION_CNY_REQUIRED");
  if (!facts.recordRef || !facts.personalUseConfirmed || !facts.channelFilingConfirmed ||
    !s.china?.positiveListConfirmed || !s.china.electronicRecordsConfirmed)
    return hold(out, "CN_CHANNEL_PRODUCT_AND_ORDER_EVIDENCE_REQUIRED");
  if (!s.china.identityEvidenceConfirmed || !facts.transactionAndBuyerAuthenticityReviewed || !facts.buyerIdentityBasis)
    return hold(out, "CN_PURCHASER_VERIFICATION_OR_PAYER_MATCH_REQUIRED");
  if (!facts.quotaBeforeOrderConfirmed) return hold(out, "CN_QUOTA_BEFORE_ORDER_REQUIRED");

  const goods = s.items.reduce((total, item) => total + minor(item.unitValue, "CNY") * BigInt(item.quantity), 0n);
  const value = goods + minor(s.freight, "CNY") + minor(s.insurance, "CNY");
  if (!s.customsValueConfirmed || s.customsValue === undefined || value <= 0n ||
    value !== minor(s.customsValue, "CNY"))
    return hold(out, "CN_ACTUAL_PRICE_FREIGHT_INSURANCE_REVIEW");
  const remaining = minor(s.china.annualRemaining, "CNY");
  if (remaining > 2_600_000n) return hold(out, "CN_QUOTA_BEFORE_ORDER_INVALID");
  if (remaining < value) {
    out.procedure = "CN_GENERAL_IMPORT_REVIEW";
    return hold(out, "CN_ANNUAL_ALLOWANCE_EXCEEDED");
  }
  if (value > 500_000n) {
    if (value < 2_600_000n && s.items.length === 1 && s.items[0]!.quantity === 1) {
      out.procedure = "CN_SINGLE_ITEM_FULL_GOODS_TAX_REVIEW";
      return hold(out, "CN_FULL_DUTY_VAT_AND_EXCISE_REVIEW");
    }
    out.procedure = "CN_GENERAL_IMPORT_REVIEW";
    return hold(out, "CN_OVER_LIMIT_SINGLE_UNIT_EXCEPTION_UNAVAILABLE");
  }
  out.procedure = s.regime === "cn_9610" ? "CN_DIRECT_RETAIL_WITHIN_LIMIT" : "CN_BONDED_RETAIL_WITHIN_LIMIT";
  const item = s.items[0];
  if (s.items.length !== 1 || !item?.classificationConfirmed || item.hs6 !== "691200" || facts.cnCommodityCode !== "69120010")
    return hold(out, "CN_POSITIVE_LIST_COMMODITY_REVIEW");
  const sourceIds = ["cn-pilot-cbec-tax", "primary-cn-limit", "cn-pilot-channel", "cn-pilot-consumer",
    "cn-pilot-positive-list", "cn-pilot-positive-list-amendment"];
  out.charges.push({ category: "customs_duty", currency: "CNY", value: "0.00", collection: "not_applicable", sourceIds });
  if (!item.standardTaxConfirmed || !s.taxEvidenceConfirmed || !facts.nonExciseStandardVatConfirmed || !facts.importTaxCollection)
    return hold(out, "CN_ITEM_VAT_EXCISE_AND_COLLECTION_REVIEW");
  // 70% of the statutory 13% import VAT, with zero duty and reviewed absence of excise.
  // An estimate with a fractional fen needs an independently verified rounding rule.
  out.charges.push({ category: "excise", currency: "CNY", value: "0.00", collection: "not_applicable", sourceIds: [...sourceIds, "cn-pilot-excise"] });
  const numerator = value * 91n;
  if (numerator % 1000n !== 0n) return hold(out, "CN_VAT_FEN_ROUNDING_REVIEW");
  out.charges.push({
    category: "import_vat_gst", ...money(numerator / 1000n, "CNY"),
    collection: facts.importTaxCollection, sourceIds: [...sourceIds, "cn-pilot-excise", "cn-pilot-vat-law"]
  });
  return hold(out, "CN_FEES_AND_FINAL_ASSESSMENT_REVIEW");
}

function hold(result: CountryPreview, reason: string): CountryPreview {
  result.reasons.push(reason);
  return result;
}

function unitedStates(s: Shipment, facts: UsFacts, data: Dataset, now: Date): CountryPreview {
  const out: CountryPreview = { procedure: "US_IMPORT_ENTRY_REVIEW", charges: [], reasons: [], sources: [] };
  if (s.regime !== "standard" || s.inventoryStatus !== "free_circulation") return hold(out, "US_STANDARD_ENTRY_REVIEW");
  if (!facts.recordRef || !facts.network || (s.transport === "post") !== (facts.network === "international_post"))
    return hold(out, "US_IMPORT_NETWORK_CONFIRMATION_REQUIRED");
  const ids = facts.network === "international_post"
    ? ["primary-us-de-minimis", "primary-us-postal-suspension", "primary-us-postal-delayed-compliance", "primary-us-postal-entry13-modification"]
    : ["primary-us-de-minimis", "primary-us-nonpostal-suspension"];
  const selected = data.sources.filter(source => ids.includes(source.id));
  out.sources = selected.map(({ id, url, reviewBy }) => ({ id, url, reviewBy }));
  if (!withinPilotReview("US", s.importDate, now) || !sourcesCurrent(data, ids, s.importDate, now) ||
    selected.some(source => source.checkedOn > s.importDate))
    return hold(out, "US_PILOT_SOURCE_REVIEW");
  if (s.currency !== "USD" || s.customsValue === undefined || !s.customsValueConfirmed)
    return hold(out, "US_CONFIRMED_USD_CUSTOMS_VALUE_REQUIRED");
  const value = minor(s.customsValue, "USD");
  if (value <= 0n) return hold(out, "US_CONFIRMED_USD_CUSTOMS_VALUE_REQUIRED");
  if (value <= 80_000n) out.reasons.push("US_LOW_VALUE_NO_AUTOMATIC_EXEMPTION");
  if (facts.network === "nonpostal") {
    out.procedure = "US_NONPOSTAL_FILER_REVIEW";
    return hold(out, "US_NONPOSTAL_ENTRY_HTS_AND_ADDITIONAL_MEASURES_REVIEW");
  }
  if (value > 250_000n || facts.permanentFormalEntryTrigger === "present") {
    out.procedure = "US_POSTAL_FORMAL_ENTRY_REVIEW";
    return hold(out, "US_POSTAL_FORMAL_ENTRY_OR_SPECIFIC_EXCEPTION_REVIEW");
  }
  if (facts.permanentFormalEntryTrigger !== "absent" || !facts.pgaChapterOrPreferenceTrigger)
    return hold(out, "US_POSTAL_QUOTA_AD_CVD_PGA_AND_CLAIM_SCREEN_REQUIRED");
  if (facts.pgaChapterOrPreferenceTrigger === "present") {
    out.procedure = "US_POSTAL_DELAYED_COMPLIANCE_REVIEW";
    return hold(out, "US_POSTAL_FILER_PGA_CHAPTER_AND_ENTRY13_REVIEW");
  }
  out.procedure = "US_POSTAL_INFORMAL_CANDIDATE";
  return hold(out, "US_POSTAL_HTS_FILER_AND_CHARGES_REVIEW");
}

/** A scoped procedure preview. The parent service validates shipment structure and trade-policy eligibility. */
export function previewChinaUS(shipment: Shipment, evidence: unknown, data: Dataset, now: Date): CountryPreview {
  const s = shipment;
  if (s.destinationCountry !== "CN" && s.destinationCountry !== "US")
    throw new InputError([{ path: "/shipment/destinationCountry", code: "UNSUPPORTED_CN_US_PREVIEW" }]);
  if (!(s.destinationCountry === "CN" ? chinaFacts(evidence) : usFacts(evidence)))
    throw new InputError([{ path: "/evidence", code: "INVALID_COUNTRY_PILOT_EVIDENCE" }]);
  if (s.transaction !== "b2c_sale" || s.originCountry === s.destinationCountry ||
    s.originZone !== "standard" || s.destinationZone !== "standard" || !s.consignmentScopeConfirmed ||
    s.transitRoute?.stops.length || (s.loadingCountry && s.loadingCountry !== s.originCountry) || !s.items.length ||
    s.items.some(item => item.goodsType !== "ordinary" || item.originCountry === "KP" || item.originCountry === s.destinationCountry) || s.originCountry === "KP")
    return { procedure: "COUNTRY_IMPORT_SCOPE_REVIEW", charges: [], reasons: ["DIRECT_ORDINARY_B2C_SCOPE_REQUIRED"], sources: [] };
  return s.destinationCountry === "CN" ? china(s, evidence as ChinaFacts, data, now) : unitedStates(s, evidence as UsFacts, data, now);
}
