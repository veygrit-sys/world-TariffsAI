import { todayJst } from "./dataset.ts";
import { PILOT_ROUTES } from "./trade-policy.ts";
import type { Dataset } from "./types.ts";
import { VERSION } from "./version.ts";
import { liveValidationStages, parseLiveValidationRecords } from "./live-validation.ts";

const liveValidationPending = "pending_live_validation";

export function releaseReadiness(
  data: Dataset, now = new Date(), records: unknown = [], tariffManifestSha256: readonly string[] = [],
) {
  const validations = parseLiveValidationRecords(records, now)
    .filter((record) => record.datasetVersion === data.version &&
      record.tariffManifestSha256.length === tariffManifestSha256.length &&
      record.tariffManifestSha256.every((hash, index) => hash === tariffManifestSha256[index]));
  const byRoute = new Map(validations.map((record) => [record.route, record]));
  const verified = validations.filter((record) => liveValidationStages.every((stage) => record[stage]));
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
      const record = byRoute.get(route);
      return {
        route, from, to,
        checkout: record?.checkout ? "validated" : liveValidationPending,
        customsHandoff: record?.customsHandoff ? "validated" : liveValidationPending,
        invoiceReconciliation: record?.invoiceReconciliation ? "validated" : liveValidationPending,
        productionAuthorized: false as const,
      };
    }),
    productionVerifiedRouteCount: verified.length,
  };
}
