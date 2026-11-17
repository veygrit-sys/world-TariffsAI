import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, sep } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { loadDataset } from "../src/dataset.ts";
import { loadOperationalTariffCatalog, tariffStatistics, type TariffLine, type TariffSnapshotSource } from "../src/tariffs.ts";
import { verifyTariffUpdate } from "../scripts/verify-tariff-update.ts";
import { signTariffReview, type TariffReviewDraft } from "../src/tariff-review.ts";
import type { Dataset } from "../src/types.ts";

const data: Dataset = {
  version: "synthetic-update-fixture",
  countries: [{ code: "JP", alpha3: "JPN", name: "Japan", nameJa: "日本", inScope: true, researchProfile: null }],
  supplementalRegions: [], sources: [], cards: [], rules: [],
};
const observed = "2026-11-12";
const updateDate = "2026-11-13";
const bytes = Buffer.from("synthetic source for update tests");
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const sourceHash = digest(bytes);

function writePack(path: string, id: string, date: string, scope: TariffSnapshotSource["scope"] = "national_schedule") {
  mkdirSync(path);
  const lines: TariffLine[] = [{
    code: "2204100000",
    reference: "Synthetic line",
    rates: [{ charge: "customs_duty", treatment: "mfn", label: "Example only", expression: "3%" }],
  }];
  const contents = gzipSync(JSON.stringify({ id, lines }));
  const snapshot = {
    id, jurisdiction: "JP", countries: ["JP"], zone: "standard", edition: "Synthetic",
    hsEdition: "2022", availableFrom: date, availableThrough: date, checkedOn: date, scope,
    authority: "Test fixture", sourceUrl: "https://customs.example.test/",
    terms: "Test fixture", termsUrl: "https://customs.example.test/terms",
    inputFiles: [{ url: "https://customs.example.test/source", sha256: sourceHash }], limitations: ["Synthetic fixture"],
    file: `${id}.json.gz`, sha256: digest(contents), statistics: tariffStatistics(lines),
  };
  writeFileSync(join(path, snapshot.file), contents);
  const manifest = join(path, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ version: 1, snapshots: [snapshot] }));
  return digest(readFileSync(manifest));
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "tariff-update-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bundledPath = join(root, "bundled");
  const evidence = join(root, "evidence");
  const review = join(root, "review.json");
  const trustedKeys = join(root, "trusted-keys.json");
  const bundledDigest = writePack(bundledPath, "synthetic-base", observed);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(trustedKeys, JSON.stringify({ "test-key": publicKey }));
  mkdirSync(evidence);
  writeFileSync(join(evidence, sourceHash), bytes);
  const draft = (referenceDate: string, overlayDigests: string[], changes: Partial<TariffReviewDraft> = {}): TariffReviewDraft => ({
    keyId: "test-key", reviewer: "Test reviewer", reviewedOn: referenceDate,
    referenceUrl: "https://customs.example.test/review", referenceDate, requiredDestinations: ["JP"],
    manifestSha256: [bundledDigest, ...overlayDigests], ...changes,
  });
  const writeReview = (date: string, digests: string[], changes?: Partial<TariffReviewDraft>) =>
    writeFileSync(review, JSON.stringify(signTariffReview(draft(date, digests, changes), privateKey)));
  return { root, evidence, review, bundledDigest, bundled: pathToFileURL(bundledPath + sep), trustedKeys, privateKey, draft, writeReview };
}

test("audit reports expiry and withholds a future activation", async (t) => {
  const { bundled } = fixture(t);
  const report = await verifyTariffUpdate(data, { bundled, date: updateDate, today: observed, active: [], require: ["JP"] });
  assert.equal(report.status, "hold");
  assert.equal(report.mode, "audit");
  assert.equal(report.activation, null);
  assert.equal(report.standardCoverage.proposed, 0);
  assert.equal(report.requiredCoverage[0]!.lastEarlierReferenceThrough, observed);
  assert.deepEqual(report.blockers, ["UPDATE_DATE_NOT_OBSERVED", "REQUIRED_PUBLISHED_TARIFF_MISSING:JP"]);
});

test("stages a reviewed exact manifest and returns restart and rollback paths", async (t) => {
  const { root, evidence, review, bundled, trustedKeys, writeReview } = fixture(t);
  const active = join(root, "active");
  const proposed = join(root, "next");
  const retained = writePack(active, "synthetic-older", observed);
  const added = writePack(proposed, "synthetic-update", updateDate);
  writeReview(updateDate, [retained, added]);
  const report = await verifyTariffUpdate(data, {
    bundled, evidence, review, trustedKeys, date: updateDate, today: updateDate, active: [active], candidate: [active, proposed], require: ["JP"],
  });
  assert.equal(report.status, "verified");
  assert.equal(report.verifiedSourceInputCount, 1);
  assert.equal(report.requiredCoverage[0]!.snapshotId, "synthetic-update");
  assert.deepEqual(report.activation, { variable: "VEYGRIT_TARIFF_DIR", proposedValue: [active, proposed].join(delimiter), rollbackValue: active });
  assert.equal(report.changedSelection[0]!.nextSnapshot, "synthetic-update");
});

test("rejects source tampering, unreviewed manifest bytes and packed data tampering", async (t) => {
  const { root, evidence, review, bundled, trustedKeys, writeReview } = fixture(t);
  const proposed = join(root, "next");
  const manifest = writePack(proposed, "synthetic-update", updateDate);
  const options = {
    bundled, evidence, review, trustedKeys, date: updateDate, today: updateDate, active: [], candidate: [proposed], require: ["JP"],
  };
  writeReview(updateDate, ["0".repeat(64)]);
  await assert.rejects(verifyTariffUpdate(data, options), /UPDATE_REVIEW_MANIFEST_MISMATCH/);
  writeReview(updateDate, [manifest]);
  writeFileSync(join(evidence, sourceHash), "altered source");
  await assert.rejects(verifyTariffUpdate(data, options), /UPDATE_SOURCE_EVIDENCE_HASH_MISMATCH/);
  writeFileSync(join(proposed, "synthetic-update.json.gz"), "altered pack");
  await assert.rejects(verifyTariffUpdate(data, options), /TARIFF_PACK_INTEGRITY/);
});

test("holds a same-day loss of published scope and rejects redefining a snapshot ID", async (t) => {
  const { root, evidence, review, bundled, trustedKeys, writeReview } = fixture(t);
  const active = join(root, "active");
  const proposed = join(root, "next");
  const redefined = join(root, "redefined");
  writePack(active, "synthetic-update", updateDate);
  const manifest = writePack(proposed, "synthetic-limited", updateDate, "compiled_reference");
  writePack(redefined, "synthetic-update", updateDate, "compiled_reference");
  writeReview(updateDate, [manifest]);
  const options = {
    bundled, evidence, review, trustedKeys, date: updateDate, today: updateDate, active: [active], candidate: [proposed], require: ["JP"],
  };
  const report = await verifyTariffUpdate(data, options);
  assert.equal(report.status, "hold");
  assert.equal(report.activation, null);
  assert.deepEqual(report.blockers, ["REQUIRED_PUBLISHED_TARIFF_MISSING:JP", "TARIFF_SCOPE_DOWNGRADED:JP"]);
  await assert.rejects(verifyTariffUpdate(data, { ...options, candidate: [redefined] }), /UPDATE_SNAPSHOT_ID_REDEFINED/);
});

test("prepares exact approval scope after source checks and never activates an unsigned candidate", async (t) => {
  const { root, evidence, review, bundled, trustedKeys, bundledDigest } = fixture(t);
  const proposed = join(root, "next");
  const manifest = writePack(proposed, "synthetic-update", updateDate);
  const options = {
    bundled, evidence, date: updateDate, today: updateDate, active: [], candidate: [proposed], require: ["JP"],
  };
  const prepared = await verifyTariffUpdate(data, { ...options, prepareReview: true });
  assert.equal(prepared.status, "review_required");
  assert.equal(prepared.mode, "prepare_review");
  assert.equal(prepared.activation, null);
  assert.equal(prepared.verifiedSourceInputCount, 1);
  assert.deepEqual(prepared.approvalDraft, {
    keyId: "", reviewer: "", reviewedOn: updateDate, referenceUrl: "", referenceDate: updateDate,
    requiredDestinations: ["JP"], manifestSha256: [bundledDigest, manifest],
  });
  writeFileSync(review, JSON.stringify(prepared.approvalDraft));
  await assert.rejects(verifyTariffUpdate(data, { ...options, review, trustedKeys }), /UPDATE_REVIEW_SIGNATURE_REQUIRED/);
  writeFileSync(join(evidence, sourceHash), "tampered download");
  await assert.rejects(verifyTariffUpdate(data, { ...options, prepareReview: true }), /UPDATE_SOURCE_EVIDENCE_HASH_MISMATCH/);
});

test("rejects mutated approvals, untrusted keys and a different date or destination scope", async (t) => {
  const { root, evidence, review, bundled, trustedKeys, writeReview } = fixture(t);
  const proposed = join(root, "next");
  const manifest = writePack(proposed, "synthetic-update", updateDate);
  const options = {
    bundled, evidence, review, trustedKeys, date: updateDate, today: updateDate, active: [], candidate: [proposed], require: ["JP"],
  };
  writeReview(updateDate, [manifest]);
  const signed = JSON.parse(readFileSync(review, "utf8"));
  writeFileSync(review, JSON.stringify({ ...signed, reviewer: "Substituted reviewer" }));
  await assert.rejects(verifyTariffUpdate(data, options), /INVALID_TARIFF_REVIEW_SIGNATURE/);
  writeReview(updateDate, [manifest], { keyId: "unknown-reviewer" });
  await assert.rejects(verifyTariffUpdate(data, options), /UPDATE_REVIEW_KEY_NOT_TRUSTED/);
  writeReview(updateDate, [manifest], { requiredDestinations: ["JP", "CN"] });
  await assert.rejects(verifyTariffUpdate(data, options), /UPDATE_REVIEW_SCOPE_MISMATCH/);
  writeReview(observed, [manifest]);
  await assert.rejects(verifyTariffUpdate(data, options), /UPDATE_REVIEW_SCOPE_MISMATCH/);
});

test("requires approval for removals and respects additional manifest order", async (t) => {
  const { root, bundled, review, trustedKeys, writeReview } = fixture(t);
  const first = join(root, "first");
  const second = join(root, "second");
  const firstDigest = writePack(first, "synthetic-first", observed);
  const secondDigest = writePack(second, "synthetic-second", observed);
  const options = { bundled, date: observed, today: observed, active: [first, second], require: ["JP"] };
  assert.equal((await verifyTariffUpdate(data, { ...options, candidate: [first, second] })).activation, null);
  await assert.rejects(verifyTariffUpdate(data, { ...options, candidate: [] }), /UPDATE_REVIEW_REQUIRED/);
  writeReview(observed, []);
  const removed = await verifyTariffUpdate(data, { ...options, candidate: [], review, trustedKeys });
  assert.equal(removed.activation?.proposedValue, "");
  assert.deepEqual(removed.removedSnapshotIds.sort(), ["synthetic-first", "synthetic-second"]);
  writeReview(observed, [firstDigest, secondDigest]);
  await assert.rejects(
    verifyTariffUpdate(data, { ...options, candidate: [second, first], review, trustedKeys }),
    /UPDATE_REVIEW_MANIFEST_MISMATCH/,
  );
});

test("signer publishes an approval file once without overwriting its contents", (t) => {
  const { root, draft, privateKey, review } = fixture(t);
  const privatePath = join(root, "private.pem");
  const draftPath = join(root, "draft.json");
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
  writeFileSync(draftPath, JSON.stringify(draft(observed, [])));
  const entry = fileURLToPath(new URL("../scripts/sign-tariff-review.ts", import.meta.url));
  const sign = () => spawnSync(process.execPath, [entry, "--draft", draftPath, "--private-key", privatePath, "--out", review], { encoding: "utf8" });
  assert.equal(sign().status, 0);
  const initial = readFileSync(review, "utf8");
  assert.match(initial, /"signature": "[A-Za-z0-9_-]{86}"/);
  assert.equal(sign().status, 1);
  assert.equal(readFileSync(review, "utf8"), initial);
});

test("operational loader rejects unsigned overlays and altered approved manifest or pack bytes", (t) => {
  const { root, review, trustedKeys, writeReview } = fixture(t);
  const proposed = join(root, "operational");
  const manifest = writePack(proposed, "operational-test-tariff", observed);
  const actualBundledDigest = digest(readFileSync(new URL("../data/tariffs/manifest.json", import.meta.url)));
  const dataset = loadDataset();
  const now = new Date(observed + "T00:00:00Z");
  assert.throws(() => loadOperationalTariffCatalog(dataset, { VEYGRIT_TARIFF_DIR: proposed }, now), /UPDATE_REVIEW_REQUIRED/);
  const bundledSnapshots: { role?: string }[] = JSON.parse(
    readFileSync(new URL("../data/tariffs/manifest.json", import.meta.url), "utf8"),
  ).snapshots;
  assert.equal(loadOperationalTariffCatalog(dataset, {}, now).coverage().snapshots.length,
    bundledSnapshots.filter(({ role }) => !role).length);
  writeReview(observed, [manifest], { manifestSha256: [actualBundledDigest, manifest] });
  const env = { VEYGRIT_TARIFF_DIR: proposed, VEYGRIT_TARIFF_APPROVAL: review, VEYGRIT_TARIFF_TRUSTED_KEYS: trustedKeys };
  const catalog = loadOperationalTariffCatalog(dataset, env, new Date(updateDate + "T00:00:00Z"));
  const request = { destinationCountry: "JP", code: "2204100000", snapshotId: "operational-test-tariff" };
  assert.equal(catalog.lookup({ ...request, date: updateDate }).status, "date_not_covered");
  writeFileSync(join(proposed, "operational-test-tariff.json.gz"), "changed pack");
  assert.throws(() => catalog.lookup({ ...request, date: observed }), /TARIFF_PACK_INTEGRITY/);
  const file = join(proposed, "manifest.json");
  writeFileSync(file, readFileSync(file, "utf8") + "\n");
  assert.throws(() => loadOperationalTariffCatalog(dataset, env, now), /UPDATE_REVIEW_MANIFEST_MISMATCH/);
});
