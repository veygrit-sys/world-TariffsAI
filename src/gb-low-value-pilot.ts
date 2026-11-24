import { Ajv } from "ajv";
import type { CountryPreview } from "./country-preview-types.ts";
import { sourcesCurrent, todayJst } from "./dataset.ts";
import { assess } from "./engine.ts";
import { minor } from "./money.ts";
import type { Dataset, Shipment } from "./types.ts";
import { isDate } from "./wco.ts";

const reviewedOn = "2026-11-24";
const reviewBy = "2026-12-11";
const bookSource = {
  id: "gb-pilot-hmrc-printed-books",
  url: "https://www.gov.uk/guidance/zero-rating-books-and-printed-matter-for-vat-notice-70110",
  reviewBy,
};
const sales = "primary-gb-sale";
const duty = "primary-gb-duty";
const delivery = "primary-gb-delivery";
const rate = "primary-gb-rate";

interface Evidence {
  saleDate: string;
  destinationRegion: "england" | "scotland" | "wales" | "northern_ireland" | "other" | "unknown";
  stockAtSale: "outside_uk" | "inside_uk" | "unknown";
  invoiceBasis: "net_goods_separate_freight" | "other" | "unknown";
  deliveryContract: "delivery_required" | "separate_service" | "unknown";
  nonExciseConfirmed: boolean;
  skuReviews: { itemId: string; sku: string; vatTreatment: "standard" | "bound_printed_literary_work" | "unreviewed" }[];
}

const identifier = { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.:-]+$" };
const validEvidence = new Ajv({ ownProperties: true }).compile<Evidence>({
  type: "object",
  additionalProperties: false,
  required: ["saleDate", "destinationRegion", "stockAtSale", "invoiceBasis", "deliveryContract", "nonExciseConfirmed", "skuReviews"],
  properties: {
    saleDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    destinationRegion: { enum: ["england", "scotland", "wales", "northern_ireland", "other", "unknown"] },
    stockAtSale: { enum: ["outside_uk", "inside_uk", "unknown"] },
    invoiceBasis: { enum: ["net_goods_separate_freight", "other", "unknown"] },
    deliveryContract: { enum: ["delivery_required", "separate_service", "unknown"] },
    nonExciseConfirmed: { type: "boolean" },
    skuReviews: {
      type: "array", minItems: 1, maxItems: 100,
      items: {
        type: "object", additionalProperties: false, required: ["itemId", "sku", "vatTreatment"],
        properties: {
          itemId: identifier, sku: identifier,
          vatTreatment: { enum: ["standard", "bound_printed_literary_work", "unreviewed"] },
        },
      },
    },
  },
});

/** HMRC direct B2C low-value goods. The shared assessor owns the threshold and standard-rate calculation. */
export function previewGB(shipment: Shipment, evidence: unknown, data: Dataset, now: Date): CountryPreview {
  const result: CountryPreview = { procedure: "GB_LOW_VALUE_DIRECT_B2C", charges: [], reasons: [], sources: [] };
  function hold(reason: string): CountryPreview {
    result.reasons.push(reason);
    return result;
  }
  const today = todayJst(now);
  if ([today, shipment.importDate].some(date => date < reviewedOn || date > reviewBy))
    return hold("GB_SOURCE_WINDOW_REVIEW");
  if (!validEvidence(evidence)) return hold("GB_EVIDENCE_REQUIRED");
  if (!isDate(evidence.saleDate) || evidence.saleDate < reviewedOn || evidence.saleDate > shipment.importDate)
    return hold("GB_SALE_DATE_REVIEW");
  if (shipment.destinationCountry !== "GB" || !["england", "scotland", "wales"].includes(evidence.destinationRegion))
    return hold("GB_DESTINATION_REGION_REVIEW");
  if (evidence.stockAtSale !== "outside_uk") return hold("GB_STOCK_AT_SALE_REVIEW");
  if (!evidence.nonExciseConfirmed) return hold("GB_EXCISE_REVIEW");
  if (evidence.invoiceBasis !== "net_goods_separate_freight") return hold("GB_INVOICE_BASIS_REVIEW");

  const sourceIds = [sales, duty, delivery, rate];
  if (!sourcesCurrent(data, sourceIds, shipment.importDate, now)) return hold("GB_SOURCE_WINDOW_REVIEW");
  result.sources = data.sources.filter(s => sourceIds.includes(s.id))
    .map(({ id, url, reviewBy: deadline }) => ({ id, url, reviewBy: deadline < reviewBy ? deadline : reviewBy }));
  const assessment = assess(shipment, data, now);
  const relief = assessment.charges.find(c => c.kind === "customs_duty" && c.ruleId === "GB_LOW_VALUE");
  if (!relief) {
    // Route/release/FTA notices do not identify why the monetary rule was held.
    const reason = assessment.findings.filter(f => f.severity !== "info").at(-1)?.code;
    return hold(reason ?? "GB_LOW_VALUE_SCOPE_REVIEW");
  }
  result.charges.push({ category: "customs_duty", ...relief.amount, collection: relief.collection, sourceIds: [sales, duty] });

  if (shipment.sellerTaxRegistration !== "registered") return hold("SELLER_TAX_REQUIRED");
  if (evidence.deliveryContract !== "delivery_required") return hold("GB_DELIVERY_CONTRACT_REVIEW");
  // Separate insurance may itself have a different liability. The pilot accepts freight alone.
  if (minor(shipment.insurance, "GBP") !== 0n) return hold("GB_INSURANCE_TREATMENT_REVIEW");

  const reviews = new Map(evidence.skuReviews.map(review => [review.itemId, review]));
  if (reviews.size !== evidence.skuReviews.length || reviews.size !== shipment.items.length ||
      !shipment.items.every(i => reviews.has(i.id) && i.productIdentifier === reviews.get(i.id)!.sku &&
        i.classificationConfirmed === true && i.hs6 !== undefined)) return hold("GB_SKU_EVIDENCE_REVIEW");

  const allBooks = evidence.skuReviews.every(review => review.vatTreatment === "bound_printed_literary_work");
  if (allBooks) {
    // The reviewer identifies each SKU as a bound printed literary work supplied on its own. HS alone does not establish zero rating.
    if (!shipment.items.every(i => i.hs6 === "490199" && i.standardTaxConfirmed !== true))
      return hold("GB_SKU_VAT_TREATMENT_REVIEW");
    result.sources.push({ ...bookSource });
    result.charges.push({ category: "checkout_tax", value: "0.00", currency: "GBP", collection: "checkout",
      sourceIds: [sales, delivery, bookSource.id] });
  } else {
    if (!evidence.skuReviews.every(review => review.vatTreatment === "standard"))
      return hold("GB_SKU_VAT_TREATMENT_REVIEW");
    const saleTax = assessment.charges.find(c => c.kind === "sales_vat_gst" && c.ruleId === "GB_LOW_VALUE");
    if (!saleTax) return hold("GB_SKU_VAT_TREATMENT_REVIEW");
    result.charges.push({ category: "checkout_tax", ...saleTax.amount, collection: saleTax.collection,
      sourceIds: [sales, delivery, rate] });
  }
  if (!shipment.taxEvidenceConfirmed) return hold("TAX_EVIDENCE_REQUIRED");
  result.charges.push({ category: "import_vat_gst", value: "0.00", currency: "GBP", collection: "not_applicable",
    sourceIds: [sales, duty] });
  return result;
}
