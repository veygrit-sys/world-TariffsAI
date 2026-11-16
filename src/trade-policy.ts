export const PILOT_ROUTES = Object.freeze(["JP-CN", "CN-JP", "JP-US", "US-JP", "CN-US", "US-CN"] as const);
export type PilotRoute = (typeof PILOT_ROUTES)[number];
export type TradePolicyScope = "pilot" | "worldwide";

export interface TradePolicyInput {
  dispatchCountry: string;
  destinationCountry: string;
  productOriginCountries: readonly string[];
  loadingCountry?: string;
  transitCountries?: readonly string[];
  usJurisdictionApplies?: boolean;
}

export type NorthKoreaBlockReason = "KP_COMMERCIAL_EXCLUDED" | "JP_KP_ORIGIN_OR_LOADING_EXCLUDED";
export type TradePolicyReason = NorthKoreaBlockReason | "KP_NEXUS_REVIEW" | "US_IR_CU_TRADE_REVIEW"
  | "US_JURISDICTION_REVIEW_REQUIRED" | "RU_BY_TRADE_REVIEW" | "JP_LOADING_COUNTRY_REQUIRED"
  | "PILOT_ROUTE" | "WORLDWIDE_ROUTE_REVIEW" | "ROUTE_OUT_OF_SCOPE";

export interface TradePolicyEvidence {
  sourceId: string;
  jurisdiction: "JP" | "US";
  authority: string;
  url: string;
  effectiveFrom?: string;
  effectiveThrough?: string;
}

export interface TradePolicyDecision {
  status: "blocked" | "review_required" | "pilot" | "eligible_for_review" | "out_of_scope";
  pilotRoute: PilotRoute | null;
  reasonCode: TradePolicyReason;
  evidence: TradePolicyEvidence[];
  shippingAuthorized: false;
}

const japanNorthKorea: TradePolicyEvidence = {
  sourceId: "JP_METI_DPRK_TRADE_2025",
  jurisdiction: "JP",
  authority: "METI",
  url: "https://www.meti.go.jp/press/2025/04/20250408002/20250408002.html",
  effectiveFrom: "2025-04-14",
  effectiveThrough: "2027-04-13",
};

const usNorthKorea: TradePolicyEvidence = {
  sourceId: "US_OFAC_DPRK_SANCTIONS",
  jurisdiction: "US",
  authority: "OFAC",
  url: "https://ofac.treasury.gov/sanctions-programs-and-country-information/north-korea-sanctions",
};

const usIran: TradePolicyEvidence = {
  sourceId: "US_BIS_IRAN_EXPORT_CONTROLS",
  jurisdiction: "US",
  authority: "BIS",
  url: "https://www.bis.gov/licensing/country-guidance/iran-export-controls",
};

const usCuba: TradePolicyEvidence = {
  sourceId: "US_OFAC_CUBA_FAQ_758",
  jurisdiction: "US",
  authority: "OFAC",
  url: "https://ofac.treasury.gov/faqs/758",
};

const japanRussiaBelarus: TradePolicyEvidence = {
  sourceId: "JP_METI_RUSSIA_BELARUS_TRADE_CONTROLS",
  jurisdiction: "JP",
  authority: "METI",
  url: "https://www.meti.go.jp/policy/external_economy/trade_control/01_seido/04_seisai/crimea.html",
};

const usRussiaBelarus: TradePolicyEvidence = {
  sourceId: "US_OFAC_SANCTIONS_PROGRAMS",
  jurisdiction: "US",
  authority: "OFAC",
  url: "https://ofac.treasury.gov/sanctions-programs-and-country-information",
};

const code = (value?: string) => value?.trim().toUpperCase() ?? "";

export function northKoreaBlockReason(input: TradePolicyInput): NorthKoreaBlockReason | null {
  const destination = code(input.destinationCountry);
  if (code(input.dispatchCountry) === "KP" || destination === "KP")
    return "KP_COMMERCIAL_EXCLUDED";
  if (destination === "JP" && (
    code(input.loadingCountry) === "KP" || input.productOriginCountries.some((origin) => code(origin) === "KP")
  )) return "JP_KP_ORIGIN_OR_LOADING_EXCLUDED";
  return null;
}

// Geographic U.S. nexus can extend beyond the federal customs area (31 CFR 560.307).
const usJurisdictionLocations = new Set(["US", "PR", "VI", "GU", "AS", "MP", "UM"]);

/** Evaluate Veygrit's commercial scope after the caller validates the country registry. */
export function assessTradePolicy(input: TradePolicyInput, scope: TradePolicyScope = "pilot"): TradePolicyDecision {
  const dispatch = code(input.dispatchCountry);
  const destination = code(input.destinationCountry);
  const loading = code(input.loadingCountry);
  const routeLocations = [dispatch, destination, loading, ...(input.transitCountries ?? []).map(code)];
  const involved = new Set([...routeLocations, ...input.productOriginCountries.map(code)]);
  const usNexus = input.usJurisdictionApplies === true ||
    routeLocations.some((location) => usJurisdictionLocations.has(location));
  const pilotRoute = PILOT_ROUTES.find((route) => route === dispatch + "-" + destination) ?? null;
  const worldwideRoute = scope === "worldwide" && dispatch.length > 0 && destination.length > 0 &&
    dispatch !== destination;
  const commercialCandidate = pilotRoute !== null || worldwideRoute;
  const decision = (
    status: TradePolicyDecision["status"], reasonCode: TradePolicyReason, evidence: TradePolicyEvidence[] = [],
  ): TradePolicyDecision => ({
    status, pilotRoute, reasonCode, evidence: evidence.map((source) => ({ ...source })), shippingAuthorized: false,
  });

  const northKoreaBlock = northKoreaBlockReason(input);
  if (northKoreaBlock)
    return decision("blocked", northKoreaBlock, usNexus ? [japanNorthKorea, usNorthKorea] : [japanNorthKorea]);
  if (involved.has("KP"))
    return decision("review_required", "KP_NEXUS_REVIEW", usNexus ? [usNorthKorea] : []);
  const unknownUsJurisdiction = commercialCandidate && input.usJurisdictionApplies === undefined;
  if ((usNexus || unknownUsJurisdiction) && (involved.has("IR") || involved.has("CU"))) {
    const evidence = [involved.has("IR") ? usIran : undefined, involved.has("CU") ? usCuba : undefined]
      .filter((source) => source !== undefined);
    return decision("review_required", usNexus ? "US_IR_CU_TRADE_REVIEW" : "US_JURISDICTION_REVIEW_REQUIRED", evidence);
  }
  if (involved.has("RU") || involved.has("BY"))
    return decision("review_required", "RU_BY_TRADE_REVIEW", usNexus ? [japanRussiaBelarus, usRussiaBelarus] : [japanRussiaBelarus]);
  if (commercialCandidate && destination === "JP" && !loading)
    return decision("review_required", "JP_LOADING_COUNTRY_REQUIRED", [japanNorthKorea]);
  if (pilotRoute) return decision("pilot", "PILOT_ROUTE");
  if (worldwideRoute) return decision("eligible_for_review", "WORLDWIDE_ROUTE_REVIEW");
  return decision("out_of_scope", "ROUTE_OUT_OF_SCOPE");
}
