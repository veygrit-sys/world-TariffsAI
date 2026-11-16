import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { delimiter, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { loadDataset, todayJst } from "../src/dataset.ts";
import { TariffCatalog, type TariffSnapshot } from "../src/tariffs.ts";
import { PILOT_ROUTES } from "../src/trade-policy.ts";
import type { Dataset } from "../src/types.ts";
import { requireCoverageDate } from "../src/wco.ts";
import { verifySignedTariffReview, type SignedTariffReview, type TariffReviewScope } from "../src/tariff-review.ts";

const defaultDestinations = [...new Set(PILOT_ROUTES.map((route) => route.split("-")[1]!))].sort();
const scopeRank = { hs6_aggregate: 0, compiled_reference: 1, published_baseline: 2, national_schedule: 3 } as const;
const bundledTariffs = new URL("../data/tariffs/", import.meta.url);
const directoryUrl = (path: string) => pathToFileURL(resolve(path) + sep);
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

interface UpdateOptions {
  date: string;
  today: string;
  active: string[];
  candidate?: string[];
  require: string[];
  evidence?: string;
  review?: string;
  trustedKeys?: string;
  prepareReview?: boolean;
  bundled?: URL;
}

function coverageOn(catalog: TariffCatalog, date: string) {
  const { snapshots, measureSnapshots } = catalog.coverage();
  const selected = new Map<string, TariffSnapshot>();
  // TariffCatalog returns snapshots in the same order used by lookup.
  for (const pack of snapshots) {
    if (pack.availableFrom > date || pack.availableThrough < date) continue;
    for (const country of pack.countries) {
      const key = pack.zone === "standard" ? country : `${country}/${pack.jurisdiction}`;
      if (!selected.has(key)) selected.set(key, pack);
    }
  }
  const measures = new Set<string>();
  for (const pack of measureSnapshots) {
    if (pack.availableFrom > date || pack.availableThrough < date) continue;
    for (const country of pack.countries) {
      for (const charge of pack.statistics.charges ?? [])
        measures.add(`${country}/${pack.zone}/${pack.jurisdiction}/${charge}`);
    }
  }
  return { selected, measures, snapshots: [...snapshots, ...measureSnapshots] };
}

async function verifyEvidence(snapshot: TariffSnapshot, directory: string | undefined, verified: Set<string>) {
  if (!directory) throw new Error("UPDATE_SOURCE_EVIDENCE_REQUIRED");
  for (const input of snapshot.inputFiles) {
    if (verified.has(input.sha256)) continue;
    const hash = createHash("sha256");
    try {
      for await (const chunk of createReadStream(resolve(directory, input.sha256))) hash.update(chunk);
    } catch {
      throw new Error(`UPDATE_SOURCE_EVIDENCE_MISSING: ${snapshot.id} ${input.sha256}`);
    }
    if (hash.digest("hex") !== input.sha256)
      throw new Error(`UPDATE_SOURCE_EVIDENCE_HASH_MISMATCH: ${snapshot.id} ${input.sha256}`);
    verified.add(input.sha256);
  }
}

export async function verifyTariffUpdate(data: Dataset, options: UpdateOptions) {
  const { date, today } = options;
  requireCoverageDate(date);
  requireCoverageDate(today);

  const active = options.active.map((path) => resolve(path));
  const candidate = options.candidate?.map((path) => resolve(path)) ?? active;
  const changedStack = !isDeepStrictEqual(active, candidate);
  if (options.prepareReview && !changedStack) throw new Error("UPDATE_CANDIDATE_CHANGE_REQUIRED");
  if ([...active, ...candidate].some((path) => path.includes(delimiter)))
    throw new Error("INVALID_TARIFF_DIRECTORY_DELIMITER");
  const bundled = options.bundled ?? bundledTariffs;
  const allDirectories = [...new Set([bundled.href, ...[...active, ...candidate].map((path) => directoryUrl(path).href)])];
  const manifests = new Map<string, string>();
  for (const directory of allDirectories) {
    const manifest = new URL("manifest.json", directory);
    const digest = sha256(readFileSync(manifest));
    new TariffCatalog(data, [new URL(directory)]).verify();
    if (digest !== sha256(readFileSync(manifest))) throw new Error("UPDATE_MANIFEST_CHANGED_DURING_VERIFICATION");
    manifests.set(directory, digest);
  }
  const current = coverageOn(new TariffCatalog(data, [bundled, ...active.map(directoryUrl)]), date);
  const next = options.candidate
    ? coverageOn(new TariffCatalog(data, [bundled, ...candidate.map(directoryUrl)]), date)
    : current;
  for (const [directory, digest] of manifests) {
    if (digest !== sha256(readFileSync(new URL("manifest.json", directory))))
      throw new Error("UPDATE_MANIFEST_CHANGED_DURING_VERIFICATION");
  }

  const countries = new Set([...data.countries, ...data.supplementalRegions].filter((entry) => entry.inScope).map((entry) => entry.code));
  const required = [...new Set(options.require)].sort();
  if (!required.length || required.some((country) => !countries.has(country)))
    throw new Error("INVALID_REQUIRED_TARIFF_DESTINATION");
  const beforeById = new Map(current.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const afterById = new Map(next.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const added = next.snapshots.filter(({ id }) => !beforeById.has(id));
  for (const pack of next.snapshots) {
    const before = beforeById.get(pack.id);
    if (before && !isDeepStrictEqual(before, pack)) throw new Error(`UPDATE_SNAPSHOT_ID_REDEFINED: ${pack.id}`);
    if (pack.checkedOn > today) throw new Error(`UPDATE_SNAPSHOT_NOT_OBSERVED: ${pack.id}`);
  }
  const activeManifests = active.map((path) => ({ path, sha256: manifests.get(directoryUrl(path).href)! }));
  const candidateManifests = candidate.map((path) => ({ path, sha256: manifests.get(directoryUrl(path).href)! }));
  const bundledManifestSha256 = manifests.get(bundled.href)!;
  const reviewScope: TariffReviewScope = {
    referenceDate: date,
    requiredDestinations: required,
    manifestSha256: [bundledManifestSha256, ...candidateManifests.map(({ sha256 }) => sha256)],
  };
  let review: SignedTariffReview | null = null;
  if (changedStack && !options.prepareReview) {
    if (!options.review) throw new Error("UPDATE_REVIEW_REQUIRED");
    if (!options.trustedKeys) throw new Error("UPDATE_TRUSTED_REVIEW_KEYS_REQUIRED");
    review = verifySignedTariffReview(
      JSON.parse(readFileSync(options.review, "utf8")),
      JSON.parse(readFileSync(options.trustedKeys, "utf8")),
      reviewScope,
      today,
    );
  }
  const verifiedInputs = new Set<string>();
  for (const pack of added) {
    if (review && pack.checkedOn > review.reviewedOn)
      throw new Error(`UPDATE_REVIEW_PRECEDES_OBSERVATION: ${pack.id}`);
    await verifyEvidence(pack, options.evidence, verifiedInputs);
  }
  for (const [directory, digest] of manifests) {
    if (digest !== sha256(readFileSync(new URL("manifest.json", directory))))
      throw new Error("UPDATE_MANIFEST_CHANGED_DURING_VERIFICATION");
  }

  const requiredCoverage = required.map((country) => {
    const snapshot = next.selected.get(country);
    const status = snapshot && scopeRank[snapshot.scope] >= scopeRank.published_baseline && snapshot.statistics.codesWithRates > 0
      ? "published_reference" : snapshot ? "limited_reference" : "missing";
    const prior = next.snapshots
      .filter((row) => !row.role && row.zone === "standard" && row.countries.includes(country) && row.availableThrough < date)
      .map((row) => row.availableThrough).sort().at(-1) ?? null;
    return { country, status, snapshotId: snapshot?.id ?? null, lastEarlierReferenceThrough: prior };
  });
  const lostCoverage = [...current.selected.keys()].filter((key) => !next.selected.has(key)).sort();
  const downgradedCoverage = [...current.selected].filter(([key, before]) => {
    const after = next.selected.get(key);
    return after && scopeRank[after.scope] < scopeRank[before.scope];
  }).map(([key]) => key).sort();
  const lostMeasures = [...current.measures].filter((measure) => !next.measures.has(measure)).sort();
  const changedSelection = [...next.selected].flatMap(([scope, pack]) => {
    const before = current.selected.get(scope);
    if (before?.id === pack.id) return [];
    return [{
      scope,
      previousSnapshot: before?.id ?? null,
      nextSnapshot: pack.id,
      ratedCodeCountChange: pack.statistics.codesWithRates - (before?.statistics.codesWithRates ?? 0),
      lostChapters: before?.statistics.chapters.filter((chapter) => !pack.statistics.chapters.includes(chapter)) ?? [],
    }];
  }).sort((a, b) => a.scope.localeCompare(b.scope));

  const shadowedCandidateTariffScopes = added
    .filter((pack) => !pack.role && pack.availableFrom <= date && pack.availableThrough >= date)
    .flatMap((pack) => pack.countries.flatMap((country) => {
      const scope = pack.zone === "standard" ? country : `${country}/${pack.jurisdiction}`;
      const selected = next.selected.get(scope);
      return selected && selected.id !== pack.id
        ? [{ scope, stagedSnapshot: pack.id, selectedSnapshot: selected.id }] : [];
    }));

  const blockers = [
    ...(date > today ? ["UPDATE_DATE_NOT_OBSERVED"] : []),
    ...requiredCoverage.filter(({ status }) => status !== "published_reference").map(({ country }) => `REQUIRED_PUBLISHED_TARIFF_MISSING:${country}`),
    ...lostCoverage.map((key) => `TARIFF_COVERAGE_LOST:${key}`),
    ...downgradedCoverage.map((key) => `TARIFF_SCOPE_DOWNGRADED:${key}`),
    ...lostMeasures.map((key) => `TARIFF_MEASURE_COVERAGE_LOST:${key}`),
  ];
  return {
    status: blockers.length ? "hold" as const : options.prepareReview ? "review_required" as const : "verified" as const,
    mode: options.prepareReview ? "prepare_review" as const : options.candidate ? "update" as const : "audit" as const,
    referenceDate: date,
    checkedOn: today,
    datasetVersion: data.version,
    bundledManifestSha256,
    requiredCoverage,
    standardCoverage: {
      active: [...current.selected.keys()].filter((key) => !key.includes("/")).length,
      proposed: [...next.selected.keys()].filter((key) => !key.includes("/")).length,
      latestReferenceThrough: next.snapshots.filter((pack) => !pack.role && pack.zone === "standard")
        .map((pack) => pack.availableThrough).sort().at(-1) ?? null,
    },
    changedSelection,
    shadowedCandidateTariffScopes,
    addedSnapshots: added.map(({ id, sha256, sourceUrl, availableFrom, availableThrough, checkedOn }) => ({
      id, sha256, sourceUrl, availableFrom, availableThrough, checkedOn,
    })),
    removedSnapshotIds: current.snapshots.filter(({ id }) => !afterById.has(id)).map(({ id }) => id),
    review,
    ...(options.prepareReview ? { approvalDraft: { keyId: "", reviewer: "", reviewedOn: today, referenceUrl: "", ...reviewScope } } : {}),
    verifiedSourceInputCount: verifiedInputs.size,
    duePrimarySources: data.sources.filter((source) => source.verification === "primary_rechecked" && source.reviewBy <= today)
      .map(({ id, url, reviewBy }) => ({ id, url, reviewBy })),
    activeManifests,
    candidateManifests,
    blockers,
    activation: blockers.length || !review ? null : {
      variable: "VEYGRIT_TARIFF_DIR",
      proposedValue: candidate.join(delimiter),
      rollbackValue: active.join(delimiter),
    },
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      date: { type: "string" },
      active: { type: "string", multiple: true },
      candidate: { type: "string", multiple: true },
      "bundled-only": { type: "boolean" },
      require: { type: "string" },
      evidence: { type: "string" },
      review: { type: "string" },
      "trusted-keys": { type: "string" },
      "prepare-review": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log("Usage: npm run tariff:verify-update -- [--date YYYY-MM-DD] [--active DIR ...] [--candidate DIR ... | --bundled-only] [--evidence DIR] [--prepare-review | --review FILE --trusted-keys FILE] [--require JP,CN,US]");
    return;
  }
  if (values["bundled-only"] && values.candidate) throw new Error("UPDATE_CANDIDATE_ARGUMENT_CONFLICT");
  const today = todayJst(new Date());
  const active = values.active ?? (process.env.VEYGRIT_TARIFF_DIR ?? "").split(delimiter).filter(Boolean);
  const candidate = values["bundled-only"] ? [] : values.candidate;
  const report = await verifyTariffUpdate(loadDataset(), {
    today,
    date: values.date ?? today,
    active,
    require: values.require?.split(",").map((country) => country.trim()) ?? defaultDestinations,
    ...(candidate ? { candidate } : {}),
    ...(values.evidence ? { evidence: values.evidence } : {}),
    ...(values.review ? { review: values.review } : {}),
    ...(values["trusted-keys"] ? { trustedKeys: values["trusted-keys"] } : {}),
    ...(values["prepare-review"] ? { prepareReview: true } : {}),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "hold") process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main().catch((error: unknown) => {
    console.error(JSON.stringify({ status: "invalid", error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}
