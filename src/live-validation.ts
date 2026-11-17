import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { todayJst } from "./dataset.ts";
import { PILOT_ROUTES, type PilotRoute } from "./trade-policy.ts";

export const liveValidationStages = ["checkout", "customsHandoff", "invoiceReconciliation"] as const;
export type LiveValidationStage = (typeof liveValidationStages)[number];

export interface LiveValidationEvidence {
  status: "validated";
  evidenceId: string;
  reviewerRef: string;
  reviewedOn: string;
}

export type LiveValidationRecord = {
  route: PilotRoute;
  orderId: string;
  datasetVersion: string;
  tariffManifestSha256: string[];
} & Partial<Record<LiveValidationStage, LiveValidationEvidence>>;

const reference = { type: "string", minLength: 16, maxLength: 100, pattern: "^[A-Za-z][A-Za-z0-9_.:-]+$" };
const evidenceSchema = {
  type: "object", additionalProperties: false,
  required: ["status", "evidenceId", "reviewerRef", "reviewedOn"],
  properties: {
    status: { const: "validated" },
    evidenceId: reference,
    reviewerRef: reference,
    reviewedOn: { type: "string", format: "date" },
  },
};

export const liveValidationRecordsSchema = {
  type: "array", maxItems: PILOT_ROUTES.length,
  items: {
    type: "object", additionalProperties: false, minProperties: 5,
    required: ["route", "orderId", "datasetVersion", "tariffManifestSha256"],
    properties: {
      route: { enum: [...PILOT_ROUTES] },
      orderId: reference,
      datasetVersion: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" },
      tariffManifestSha256: { type: "array", minItems: 1, maxItems: 100,
        items: { type: "string", pattern: "^[a-f0-9]{64}$" } },
      checkout: evidenceSchema,
      customsHandoff: evidenceSchema,
      invoiceReconciliation: evidenceSchema,
    },
  },
};

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<LiveValidationRecord[]>(liveValidationRecordsSchema);

/** Operator-managed review references describe a sample order, not shipment authorisation. */
export function parseLiveValidationRecords(input: unknown, now = new Date()): LiveValidationRecord[] {
  if (!validate(input)) throw new Error("INVALID_LIVE_VALIDATION_RECORDS");
  const reviewedOn = todayJst(now);
  const routes = new Set<PilotRoute>();
  for (const record of input) {
    if (routes.has(record.route)) throw new Error("DUPLICATE_LIVE_VALIDATION_ROUTE");
    routes.add(record.route);
    for (const stage of liveValidationStages) {
      if (record[stage] && record[stage].reviewedOn > reviewedOn)
        throw new Error("LIVE_VALIDATION_REVIEW_NOT_OBSERVED");
    }
  }
  return input;
}

/** Read references from a protected operator file. Their authenticity is reviewed outside this package. */
export function loadLiveValidationRecords(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
  now = new Date(),
): LiveValidationRecord[] {
  const path = env.VEYGRIT_LIVE_VALIDATION_FILE;
  if (!path) return [];
  return parseLiveValidationRecords(JSON.parse(readFileSync(path, "utf8")), now);
}
