import type { CountryPreview } from "./country-preview-types.ts";
import { todayJst } from "./dataset.ts";
import { assess } from "./engine.ts";
import { minor, money, tax } from "./money.ts";
import { assessTradePolicy } from "./trade-policy.ts";
import type { Dataset, Shipment } from "./types.ts";

const checkedOn = "2026-11-24";
const reviewBy = "2026-12-11";
const source = (id: string, url: string) => ({ id, url, reviewBy });
const ato = "https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses";
const ird = "https://www.ird.govt.nz/gst/gst-for-overseas-businesses/gst-on-low-value-imported-goods";

const sources = {
  AU: {
    border: source("au-abf-import-declarations", "https://www.abf.gov.au/importing-exporting-and-manufacturing/importing/how-to-import/import-declaration"),
    sale: source("au-ato-low-value-imports", ato + "/gst-on-low-value-imported-goods"),
    rate: source("au-ato-gst-rate", ato + "/how-australian-gst-works"),
  },
  NZ: {
    border: source("nz-customs-duty-allowances", "https://www.customs.govt.nz/sending-and-receiving/duty-and-gst/duty-and-allowances"),
    sale: source("nz-ird-low-value-merchants", ird + "/who-needs-to-charge-gst/merchants"),
    rate: source("nz-ird-when-to-charge", ird + "/when-to-charge-gst-on-low-value-imported-goods"),
    levy: source("nz-customs-goods-levies", "https://www.customs.govt.nz/business/goods-levies"),
    levyBasis: source("nz-customs-goods-levies-2026", "https://www.customs.govt.nz/business/goods-levies/goods-levies-2026-changes"),
  },
};

// Both examples use an ordinary stationery line. Other products require their own scope review.
const stationery = new Set(["482020", "960810", "960910"]);
const evidenceFlags = [
  "nonresidentMerchantArrangesDelivery", "residentPrivateConsumer",
  "allInvoiceAmountsTaxExclusive", "ordinaryNonExcisableGoods",
] as const;
const evidenceKeys = new Set<string>(["reference", "saleDate", ...evidenceFlags]);

function evidenceConfirmed(input: unknown, importDate: string): boolean {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const facts = input as Record<string, unknown>;
  const saleDate = facts.saleDate;
  if (typeof saleDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(saleDate) ||
      !Number.isFinite(Date.parse(saleDate)) || new Date(saleDate).toISOString().slice(0, 10) !== saleDate ||
      saleDate < checkedOn || saleDate > importDate) return false;
  return Object.keys(facts).length === evidenceKeys.size &&
    Object.keys(facts).every((key) => evidenceKeys.has(key)) &&
    typeof facts.reference === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(facts.reference) &&
    evidenceFlags.every((key) => facts[key] === true);
}

export function previewOceania(
  shipment: Shipment, evidence: unknown, data: Dataset, now: Date,
): CountryPreview {
  const destination = shipment.destinationCountry;
  if (destination !== "AU" && destination !== "NZ") {
    return { procedure: "OCEANIA_LOW_VALUE", charges: [], reasons: ["DESTINATION_OUT_OF_SCOPE"], sources: [] };
  }
  const refs = sources[destination];
  const preview: CountryPreview = {
    procedure: destination === "AU" ? "AU_DIRECT_LOW_VALUE_POST" : "NZ_DIRECT_LOW_VALUE",
    charges: [], reasons: [], sources: Object.values(refs).map((ref) => ({ ...ref })),
  };
  const hold = (reason: string) => {
    preview.reasons.push(reason);
    return preview;
  };
  const asOf = todayJst(now);
  if ([asOf, shipment.importDate].some((day) => day < checkedOn || day > reviewBy))
    return hold("SOURCE_REVIEW_REQUIRED");
  if (!evidenceConfirmed(evidence, shipment.importDate)) return hold("OCEANIA_MERCHANT_INVOICE_EVIDENCE_REQUIRED");
  if (shipment.channel !== "direct" || shipment.transaction !== "b2c_sale" ||
      shipment.sellerTaxRegistration !== "registered" || !shipment.taxEvidenceConfirmed)
    return hold("REGISTERED_DIRECT_CONSUMER_SALE_REQUIRED");
  if (shipment.currency !== (destination === "AU" ? "AUD" : "NZD"))
    return hold("CURRENCY_CONVERSION_REQUIRED");
  if (destination === "AU" ? shipment.transport !== "post" : !["post", "air", "sea"].includes(shipment.transport))
    return hold("TRANSPORT_REVIEW");
  const item = shipment.items[0];
  if (shipment.items.length !== 1 || !item || !item.classificationConfirmed ||
      !item.standardTaxConfirmed || item.goodsType !== "ordinary" || !stationery.has(item.hs6 ?? ""))
    return hold("CONFIRMED_STANDARD_STATIONERY_LINE_REQUIRED");
  if (!shipment.customsValueConfirmed || shipment.customsValue === undefined || !shipment.consignmentScopeConfirmed)
    return hold("CONFIRMED_AGGREGATE_CUSTOMS_VALUE_REQUIRED");

  const policy = assessTradePolicy({
    dispatchCountry: shipment.originCountry, destinationCountry: destination,
    productOriginCountries: [item.originCountry],
    ...(shipment.loadingCountry ? { loadingCountry: shipment.loadingCountry } : {}),
    transitCountries: shipment.transitRoute?.stops.map((stop) => stop.country) ?? [],
  }, "worldwide");
  if (policy.status === "blocked" || policy.status === "review_required") return hold(policy.reasonCode);

  // The core assessment validates money, checks geography and requires a current low-value rule.
  const base = assess(shipment, data, now);
  const duty = base.charges.find((charge) => charge.kind === "customs_duty");
  if (!duty || base.route !== "cross_border") {
    preview.reasons = base.findings.filter((finding) => finding.severity !== "info").map((finding) => finding.code);
    return preview;
  }
  const { currency } = shipment;
  const goods = minor(item.unitValue, currency) * BigInt(item.quantity);
  if (goods === 0n || minor(shipment.customsValue, currency) !== goods)
    return hold("INVOICE_AND_AGGREGATE_CUSTOMS_VALUE_REVIEW");

  if (goods > minor("1000", currency)) return hold("THRESHOLD_EXCEEDED");
  const imported = base.charges.find((charge) => charge.kind === "import_vat_gst");
  const sale = base.charges.find((charge) => charge.kind === "sales_vat_gst");
  let checkout;
  if (destination === "NZ") {
    if (!imported || !sale) return hold("NZ_GST_EVIDENCE_REQUIRED");
    checkout = sale.amount;
  } else {
    const taxableValue = goods + minor(shipment.freight, currency) + minor(shipment.insurance, currency);
    checkout = money(tax(taxableValue, 1000), currency);
  }
  preview.charges = [
    { category: "customs_duty", ...duty.amount, collection: duty.collection, sourceIds: [refs.border.id] },
    { category: "import_vat_gst", ...(imported?.amount ?? money(0n, currency)), collection: "not_applicable",
      sourceIds: [refs.border.id] },
    { category: "checkout_tax", ...checkout, collection: "checkout", sourceIds: [refs.sale.id, refs.rate.id] },
  ];
  if (destination === "NZ") preview.reasons.push(shipment.transport === "post"
    ? "NZ_POSTAL_OPERATOR_LEVY_BUYER_SHARE_UNKNOWN" : "NZ_FREIGHT_LEVY_BUYER_SHARE_UNKNOWN");
  return preview;
}
