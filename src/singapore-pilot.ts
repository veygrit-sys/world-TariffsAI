import { countryPreviewReviews } from "./country-preview-review.ts";
import { Ajv } from "ajv";
import { currentRule, todayJst } from "./dataset.ts";
import { assess } from "./engine.ts";
import { minor, money } from "./money.ts";
import type { Dataset, Shipment } from "./types.ts";
import type { CountryPreview } from "./country-preview-types.ts";

interface SingaporeEvidence {
  singleOverseasSaleToConsumer: boolean;
  buyerNotGstRegistered: boolean;
  sellerRegistrationVerified: boolean;
  netGoodsAndSeparateDeliveryReviewed: boolean;
  checkoutGst: "paid_and_transmitted" | "not_collected" | "unverified" | "charged_twice";
  sellerUsesSalesValueThreshold?: boolean;
  sellerRoundsOnInvoiceTotal?: boolean;
  singleImportLineConfirmed?: boolean;
  cifWithoutFurtherAdjustments?: boolean;
}
const validateEvidence = new Ajv({ strict: true }).compile<SingaporeEvidence>({
  type: "object", additionalProperties: false,
  properties: {
    singleOverseasSaleToConsumer: { type: "boolean" },
    buyerNotGstRegistered: { type: "boolean" },
    sellerRegistrationVerified: { type: "boolean" },
    netGoodsAndSeparateDeliveryReviewed: { type: "boolean" },
    checkoutGst: { enum: ["paid_and_transmitted", "not_collected", "unverified", "charged_twice"] },
    sellerUsesSalesValueThreshold: { type: "boolean" },
    sellerRoundsOnInvoiceTotal: { type: "boolean" },
    singleImportLineConfirmed: { type: "boolean" },
    cifWithoutFurtherAdjustments: { type: "boolean" },
  },
  required: ["singleOverseasSaleToConsumer", "buyerNotGstRegistered", "sellerRegistrationVerified",
    "netGoodsAndSeparateDeliveryReviewed", "checkoutGst"],
});

const { checkedOn, reviewBy } = countryPreviewReviews.SG;
const official = [
  { id: "sg-customs-lvg", url: "https://www.customs.gov.sg/personal-shipment/buying-from-overseas/gst-on-low-value-goods/" },
  { id: "sg-iras-ovr", url: "https://www.iras.gov.sg/media/docs/default-source/e-tax/gst-e-tax-guide_taxing-imported-low-value-goods-by-way-of-the-overseas-vendor-registration-regime_%281st-ed%29.pdf" },
  { id: "sg-iras-import", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/claiming-gst-(input-tax)/importing-of-goods" },
  { id: "sg-customs-aggregation", url: "https://www.customs.gov.sg/files/circular%2021_2023.pdf" },
  { id: "sg-iras-rounding", url: "https://www.iras.gov.sg/media/docs/default-source/e-tax/record-keeping-guide-for-gst-registered-businesses.pdf" },
  { id: "sg-customs-permit-fields", url: "https://www.customs.gov.sg/files/businesses/PSB/TN%20Team/Module_5_-_important_permit_fields_table.pdf" },
  { id: "sg-customs-refund", url: "https://www.customs.gov.sg/personal-shipment/buying-from-overseas/refund-of-taxes/" },
].map(source => ({ ...source, reviewBy }));

/** Limited direct B2C preview. A zero import GST must have a documented basis even if GST was quoted at checkout. */
export function previewSG(shipment: Shipment, evidence: unknown, data: Dataset, now: Date): CountryPreview {
  const result: CountryPreview = { procedure: "SG_DIRECT_AIR_POST_LVG", charges: [], reasons: [], sources: official.map(s => ({...s})) };
  const hold = (reason: string) => { result.reasons.push(reason); return result; };
  const today = todayJst(now);
  const rule = currentRule(data, "SG_LOW_VALUE", shipment.importDate, now);
  if (!rule || rule.currency !== "SGD" || rule.vatBps !== 900 || minor(rule.threshold, "SGD") !== 40000n ||
      [today, shipment.importDate].some(date => date < checkedOn || date > reviewBy))
    return hold("SG_SOURCE_REVIEW");
  if (!validateEvidence(evidence)) return hold("SG_TRANSACTION_EVIDENCE_REQUIRED");
  if (shipment.currency !== "SGD") return hold("SG_REVIEWED_SGD_VALUES_REQUIRED");
  if (shipment.destinationCountry !== "SG" || shipment.originCountry === "SG" || shipment.originZone !== "standard" ||
      shipment.destinationZone !== "standard" || shipment.regime !== "standard" || shipment.inventoryStatus !== "free_circulation" ||
      shipment.transaction !== "b2c_sale" || shipment.channel !== "direct" || !["air", "post"].includes(shipment.transport) ||
      (shipment.loadingCountry && shipment.loadingCountry !== shipment.originCountry) ||
      shipment.transitRoute?.stops.length || !evidence.singleOverseasSaleToConsumer || !evidence.buyerNotGstRegistered)
    return hold("SG_DIRECT_B2C_AIR_POST_REQUIRED");
  if (!evidence.netGoodsAndSeparateDeliveryReviewed) return hold("SG_SEPARATE_NET_SALES_AND_DELIVERY_REQUIRED");
  if (!shipment.consignmentScopeConfirmed) return hold("SG_AGGREGATED_CONSIGNMENT_REQUIRED");
  if (!evidence.sellerRegistrationVerified || shipment.sellerTaxRegistration === "unknown") return hold("SG_SELLER_GST_STATUS_REQUIRED");
  if (!shipment.items.every(item => item.classificationConfirmed && item.hs6)) return hold("SG_CONFIRMED_CLASSIFICATION_REQUIRED");
  if (!shipment.items.every(item => item.goodsType === "ordinary" && item.nonDutiableConfirmed && item.standardTaxConfirmed))
    return hold("SG_NON_DUTIABLE_STANDARD_GOODS_REQUIRED");
  if (shipment.items.some(item => minor(item.unitValue, "SGD") > 40000n)) return hold("SG_ITEM_OVER_LVG_THRESHOLD");

  const assessed = assess(shipment, data, now);
  const duty = assessed.charges.find(c => c.kind === "customs_duty" && c.ruleId === rule.id && c.amount.value === "0.00");
  if (!duty || assessed.route !== "cross_border") return hold("SG_ROUTE_OR_TREATMENT_REVIEW");
  const add = (category: CountryPreview["charges"][number]["category"], value: string,
    collection: CountryPreview["charges"][number]["collection"], sourceIds: string[]) => {
    result.charges.push({ category, currency: "SGD", value, collection, sourceIds });
  };
  add("customs_duty", duty.amount.value, "not_applicable", ["sg-customs-lvg", "sg-iras-ovr"]);
  result.reasons.push("SG_CUSTOMS_FEE_REVIEW", "SG_CARRIER_FEE_REVIEW");
  if (evidence.checkoutGst === "charged_twice") return hold("SG_DOUBLE_COLLECTION_REFUND_REVIEW");

  if (shipment.sellerTaxRegistration === "registered") {
    if (!evidence.sellerUsesSalesValueThreshold) return hold("SG_OVR_ENTRY_VALUE_METHOD_REVIEW");
    if (evidence.checkoutGst === "not_collected") return hold("SG_CHECKOUT_COLLECTION_CONFLICT");
    const checkout = assessed.charges.find(c => c.kind === "sales_vat_gst" && c.ruleId === rule.id);
    if (!evidence.sellerRoundsOnInvoiceTotal || !checkout) return hold("SG_CHECKOUT_GST_ROUNDING_REVIEW");
    add("checkout_tax", checkout.amount.value, "checkout", ["sg-customs-lvg", "sg-iras-ovr", "sg-iras-rounding"]);
    if (evidence.checkoutGst !== "paid_and_transmitted" || !shipment.taxEvidenceConfirmed)
      return hold("SG_GST_PAID_ITEM_HANDOFF_REQUIRED");
    add("import_vat_gst", "0.00", "not_applicable", ["sg-customs-lvg", "sg-iras-ovr"]);
    return result;
  }

  if (evidence.checkoutGst !== "not_collected") return hold("SG_CHECKOUT_COLLECTION_CONFLICT");
  add("checkout_tax", "0.00", "not_applicable", ["sg-customs-lvg"]);
  // The border base is the reviewed aggregate customs value. Decline resale, commissions,
  // extra adjustments or consolidated parcels omitted from the submitted order.
  if (!shipment.customsValueConfirmed || !shipment.customsValue || !evidence.cifWithoutFurtherAdjustments)
    return hold("SG_REVIEWED_CIF_REQUIRED");
  const goods = shipment.items.reduce((sum, item) => sum + minor(item.unitValue, "SGD") * BigInt(item.quantity), 0n);
  const cif = goods + minor(shipment.freight, "SGD") + minor(shipment.insurance, "SGD");
  if (minor(shipment.customsValue, "SGD") !== cif) return hold("SG_CIF_SCOPE_MISMATCH");
  if (cif <= 40000n) {
    add("import_vat_gst", "0.00", "not_applicable", ["sg-customs-lvg", "sg-customs-aggregation"]);
    return result;
  }
  // Only independently report an exact number of cents. The merchant's OVR
  // invoice rounding convention is not a rule for a Singapore Customs permit.
  if (!evidence.singleImportLineConfirmed || shipment.items.length !== 1) return hold("SG_IMPORT_LINE_SCOPE_REQUIRED");
  const numerator = cif * BigInt(rule.vatBps);
  if (numerator % 10000n !== 0n) return hold("SG_IMPORT_PERMIT_ROUNDING_REVIEW");
  add("import_vat_gst", money(numerator / 10000n, "SGD").value, "import", ["sg-iras-import", "sg-customs-aggregation", "sg-customs-permit-fields"]);
  return result;
}
