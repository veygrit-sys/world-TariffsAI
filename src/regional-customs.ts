import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { rolloutMarket } from "./rollout-market.ts";
import type { Dataset } from "./types.ts";

const topics = ["procedure", "tariff", "tax", "territory", "restriction"] as const;
const statuses = ["official_procedure", "official_reference", "pending", "excluded"] as const;

type Topic = typeof topics[number];

interface RegionalCustomsEntry {
  country: string;
  status: typeof statuses[number];
  sources: { url: string; authority: string; title: string; topic: Topic }[];
  guidance: { topic: Topic; textJa: string; sourceUrls: string[] }[];
}

/** Research references for the destination's imports. These do not approve a shipment. */
export interface RegionalCustomsProfile extends RegionalCustomsEntry {
  pass: 2 | 3 | 4 | 5 | 6;
  reviewedOn: string;
}

interface RegionalCustomsPack {
  pass: RegionalCustomsProfile["pass"];
  reviewedOn: string;
  entries: RegionalCustomsEntry[];
}

const object = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const array = (items: object) => ({ type: "array", items });
const topic = { enum: [...topics] };
const text = { type: "string", minLength: 1 };
const url = { type: "string", format: "uri", pattern: "^https://" };
const packFields = {
  pass: { enum: [2, 3, 4, 5, 6] },
  reviewedOn: { type: "string", format: "date" },
};
const entryFields = {
  country: { type: "string", pattern: "^[A-Z]{2}$" },
  status: { enum: [...statuses] },
  sources: array(object({ url, authority: text, title: text, topic })),
  guidance: array(object({
    topic,
    textJa: text,
    sourceUrls: { ...array(url), minItems: 1, uniqueItems: true },
  })),
};

export const regionalCustomsProfileSchema = object({ ...packFields, ...entryFields });

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validatePack = ajv.compile<RegionalCustomsPack>(
  object({ ...packFields, entries: array(object(entryFields)) }),
);

function validateEntry(entry: RegionalCustomsEntry): boolean {
  const urls = new Set(entry.sources.map(({ url }) => url));
  const safelySourced = entry.sources.every(({ url }) => {
    const address = new URL(url);
    return !!address.hostname && !address.username && !address.password;
  }) && entry.guidance.every(({ sourceUrls }) => sourceUrls.every((url) => urls.has(url)));
  if (!safelySourced) return false;
  if (entry.status === "excluded") return entry.country === "KP";
  if (entry.country === "KP") return false;
  if (entry.status === "pending") return entry.sources.length === 0 && entry.guidance.length === 0;
  if (entry.status === "official_reference") return entry.sources.length > 0;
  return entry.guidance.some(({ topic }) => topic === "procedure" || topic === "territory");
}

export function loadRegionalCustoms(
  data: Dataset,
  documents: readonly { pass: RegionalCustomsProfile["pass"]; contents: unknown }[],
): NonNullable<Dataset["regionalCustoms"]> {
  const profiles: Record<string, RegionalCustomsProfile> = {};
  const registry = [...data.countries, ...data.supplementalRegions]
    .filter(({ inScope }) => inScope);
  for (const { pass, contents } of documents) {
    if (!validatePack(contents) || contents.pass !== pass)
      throw new Error("INVALID_REGIONAL_CUSTOMS_PACK: " + pass);
    const expected = new Set(registry.filter(({ code }) => rolloutMarket(code)?.pass === pass)
      .map(({ code }) => code));
    for (const entry of contents.entries) {
      if (!expected.delete(entry.country) || profiles[entry.country] || !validateEntry(entry))
        throw new Error("INVALID_REGIONAL_CUSTOMS_DESTINATION: " + entry.country);
      profiles[entry.country] = { ...entry, pass, reviewedOn: contents.reviewedOn };
    }
    if (expected.size) throw new Error("MISSING_REGIONAL_CUSTOMS_DESTINATIONS: " + [...expected].join(","));
  }
  return profiles;
}

export function regionalCustomsProfile(data: Dataset, destinationCountry: string): RegionalCustomsProfile | null {
  const profile = data.regionalCustoms?.[destinationCountry];
  return profile ? structuredClone(profile) : null;
}
