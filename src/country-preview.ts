import { requestDigest, assess, EU_COUNTRIES } from "./engine.ts";
import { InputError, parseShipment } from "./schema.ts";
import { assessTradePolicy } from "./trade-policy.ts";
import { previewGB } from "./gb-low-value-pilot.ts";
import { previewSG } from "./singapore-pilot.ts";
import { previewOceania } from "./oceania-low-value.ts";
import { previewChinaUS } from "./china-us-import-pilot.ts";
import { previewEuJp } from "./eu-jp-country-preview.ts";
import type { Dataset } from "./types.ts";
import type { CountryPreview } from "./country-preview-types.ts";

export const countryPreviewDestinations = [...EU_COUNTRIES, "JP", "GB", "SG", "AU", "NZ", "CN", "US"].sort();
export interface CountryPreviewResult extends CountryPreview {
  route: string;
  destinationCountry: string;
  status: "partial_estimate" | "needs_review" | "out_of_scope";
  requestDigest: string;
  assessedAt: string;
  landedCostTotal: null;
  checkoutReady: false;
  productionAuthorized: false;
  shippingAuthorized: false;
}

export function previewCountryShipment(input: unknown, data: Dataset, now = new Date()): CountryPreviewResult {
  if (!Number.isFinite(now.getTime())) throw new InputError([{path:"/referenceTime", code:"INVALID_DATE_TIME"}]);
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !("shipment" in input) || Object.keys(input).some(k => !["shipment","evidence","usJurisdictionApplies"].includes(k)))
    throw new InputError([{path:"/",code:"INVALID_COUNTRY_PREVIEW"}]);
  const evidence = "evidence" in input ? input.evidence : {};
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
    throw new InputError([{path:"/evidence",code:"INVALID_COUNTRY_EVIDENCE"}]);
  const us = "usJurisdictionApplies" in input ? input.usJurisdictionApplies : undefined;
  if (us !== undefined && typeof us !== "boolean") throw new InputError([{path:"/usJurisdictionApplies",code:"INVALID_BOOLEAN"}]);
  const s = parseShipment(input.shipment);
  const a = assess(s, data, now);
  const dest = s.destinationCountry;
  function result(details: CountryPreview, status: CountryPreviewResult["status"]): CountryPreviewResult {
    return {...details, route:s.originCountry + "-" + dest, destinationCountry:dest, status,
      requestDigest:requestDigest(input), assessedAt:now.toISOString(), landedCostTotal:null, checkoutReady:false,
      productionAuthorized:false, shippingAuthorized:false};
  }
  const hold = (reason: string, excluded = false) => result({procedure:"ROUTE_REVIEW",charges:[],sources:[],reasons:[reason]},
    excluded ? "out_of_scope" : "needs_review");
  const policy = assessTradePolicy({dispatchCountry:s.originCountry,destinationCountry:dest,
    productOriginCountries:s.items.map(item => item.originCountry),
    ...(s.loadingCountry ? {loadingCountry:s.loadingCountry} : {}),
    ...(s.transitRoute ? {transitCountries:s.transitRoute.stops.map(stop => stop.country)} : {}),
    ...(us === undefined ? {} : {usJurisdictionApplies:us})}, "worldwide");
  if (policy.status === "blocked" || policy.status === "review_required") return hold(policy.reasonCode,policy.status === "blocked");
  if (a.status === "out_of_scope") return hold(a.findings.find(f => f.severity === "blocked")?.code ?? "ROUTE_OUT_OF_SCOPE", true);
  if (!countryPreviewDestinations.includes(dest)) return hold("COUNTRY_PROFILE_UNAVAILABLE", true);
  if (a.route !== "cross_border") return hold(a.findings.find(f => ["ZONE_UNRESOLVED","TRANSIT_CUSTOMS_REVIEW","TRADE_BLOC_REVIEW"].includes(f.code))?.code ?? "CROSS_BORDER_REQUIRED");
  if (s.transitRoute?.stops.length) return hold("TRANSIT_CUSTOMS_REVIEW");
  if (s.transaction !== "b2c_sale" || !s.consignmentScopeConfirmed || s.items.some(i => i.goodsType !== "ordinary") ||
      (s.inventoryStatus !== "free_circulation" && !(dest === "CN" && s.inventoryStatus === "bonded" && s.regime === "cn_1210")))
    return hold("COUNTRY_PROCEDURE_REVIEW");
  let details: CountryPreview;
  switch (dest) {
    case "GB": details = previewGB(s,evidence,data,now); break;
    case "SG": details = previewSG(s,evidence,data,now); break;
    case "AU": case "NZ": details = previewOceania(s,evidence,data,now); break;
    case "CN": case "US": details = previewChinaUS(s,evidence,data,now); break;
    default: details = previewEuJp(s,evidence,data,now,a);
  }
  if (details.charges.length && !details.charges.some(charge => charge.category === "carrier_fee")
      && !details.reasons.some(reason => reason.includes("CARRIER_FEE")))
    details.reasons.push("CARRIER_FEES_UNRESOLVED");
  return result(details, details.charges.length ? "partial_estimate" : "needs_review");
}
