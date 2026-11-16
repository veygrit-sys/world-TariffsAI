import { todayJst } from "./dataset.ts";
import { PILOT_ROUTES } from "./trade-policy.ts";
import type { Dataset } from "./types.ts";
import { VERSION } from "./version.ts";

const liveValidationPending = "pending_live_validation";

export function releaseReadiness(data: Dataset, now = new Date()) {
  return {
    version: VERSION,
    status: "pilot" as const,
    checkedOn: todayJst(now),
    datasetVersion: data.version,
    registryDestinations: [...data.countries, ...data.supplementalRegions]
      .filter(({ inScope }) => inScope).length,
    commercialExclusions: [{ country: "KP", reasonCode: "KP_COMMERCIAL_EXCLUDED" }],
    routes: PILOT_ROUTES.map((route) => {
      const [from, to] = route.split("-") as [string, string];
      return {
        route, from, to,
        checkout: liveValidationPending,
        customsHandoff: liveValidationPending,
        invoiceReconciliation: liveValidationPending,
        productionAuthorized: false as const,
      };
    }),
    productionVerifiedRouteCount: 0,
  };
}
