export interface TransitStop {
  country: string;
  handling: "transit" | "transshipment" | "storage" | "unknown";
  customsStatus: "under_customs_control" | "released" | "unknown";
  evidenceRef?: string;
}
export interface TransitRoute {
  completeness: "confirmed" | "partial";
  stops: TransitStop[];
}
export interface TransitReview {
  status: "not_provided" | "direct_reported" | "control_reported" | "evidence_required" | "customs_release_review" | "route_review";
  loadingCountryConsistent: boolean | null;
  stops: (Omit<TransitStop, "evidenceRef"> & { sequence: number; evidenceReported: boolean })[];
  requiresReview: boolean;
  preferentialEligibilityConfirmed: false;
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const stop = {
  country,
  handling: { enum: ["transit", "transshipment", "storage", "unknown"] },
  customsStatus: { enum: ["under_customs_control", "released", "unknown"] },
  evidenceRef: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9_.:-]+$" },
};
const stopRequired = ["country", "handling", "customsStatus"];
export const transitRouteSchema = object({
  completeness: { enum: ["confirmed", "partial"] },
  stops: { type: "array", maxItems: 20, items: object(stop, stopRequired) },
});
export const transitReviewSchema = object({
  status: { enum: ["not_provided", "direct_reported", "control_reported", "evidence_required", "customs_release_review", "route_review"] },
  loadingCountryConsistent: { type: ["boolean", "null"] },
  stops: { type: "array", items: object({
    country: stop.country, handling: stop.handling, customsStatus: stop.customsStatus,
    sequence: { type: "integer", minimum: 1, maximum: 20 }, evidenceReported: { type: "boolean" },
  }, [...stopRequired, "sequence", "evidenceReported"]) },
  requiresReview: { type: "boolean" },
  preferentialEligibilityConfirmed: { const: false },
});
export const transitCountryQuerySchema = { type: "string", pattern: "^[A-Z]{2}(,[A-Z]{2}){0,19}$" };

export function reviewTransitRoute(route: TransitRoute | undefined, dispatch: string, loading?: string): TransitReview {
  const stops = (route?.stops ?? []).map(({ evidenceRef, ...entry }, index) => ({
    ...entry, sequence: index + 1, evidenceReported: evidenceRef !== undefined,
  }));
  const loadingCountryConsistent = loading && (route || loading !== dispatch)
    ? loading === dispatch || stops.some(({ country }) => country === loading) : null;
  let status: TransitReview["status"] = "not_provided";
  if (stops.some(({ customsStatus }) => customsStatus === "released")) status = "customs_release_review";
  else if (loadingCountryConsistent === false || route?.completeness === "partial" ||
      stops.some(({ handling, customsStatus, evidenceReported }) =>
        handling === "unknown" || customsStatus !== "under_customs_control" || !evidenceReported)) status = "evidence_required";
  else if (route) status = stops.length ? "control_reported" : "direct_reported";
  return { status, loadingCountryConsistent, stops,
    requiresReview: status === "evidence_required" || status === "customs_release_review", preferentialEligibilityConfirmed: false };
}
