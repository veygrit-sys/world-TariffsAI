import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { classificationBatchFromCsv, type ClassificationBatchInput } from "../src/classification-batch.ts";
import { ClassificationCatalog, loadClassificationCatalog } from "../src/classification-catalog.ts";
import { loadClassificationEvents } from "../src/classification-store.ts";
import { routeClassificationBatch } from "../src/classification-routing.ts";
import { loadDataset } from "../src/dataset.ts";
import { validateTariffImport } from "../src/tariffs.ts";
import type { ClassificationEvent } from "../src/classification-approvals.ts";
import type { ClassificationCatalogDocument } from "../src/classification-types.ts";

const reference = new URL("../examples/jp-stationery/", import.meta.url);
function readReference(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, reference), "utf8"));
}
export function mergedCatalog(base: ClassificationCatalog): ClassificationCatalogDocument {
  const pilot = new ClassificationCatalog(readReference("classification.json"));
  const document = {
    version: pilot.version + "." + base.digest.slice(0, 16),
    sources: [...base.sources, ...pilot.sources],
    rules: [...base.rules, ...pilot.rules],
  };
  new ClassificationCatalog(document);
  return document;
}

/** Metadata and origin bytes are pinned to the one Japanese observation date. */
export function prepareReference(original: Buffer, catalog: ClassificationCatalog) {
  const { source, lines } = validateTariffImport(readReference("tariff-source.json"),
    readReference("tariff-lines.json"), loadDataset());
  const digest = createHash("sha256").update(original).digest("hex");
  if (digest !== source.inputFiles[0]!.sha256) throw new Error("JP_SOURCE_DIGEST_MISMATCH");
  return { catalog: mergedCatalog(catalog), digest, source, lines };
}

const fieldLabels: Record<string, string> = {
  function: "用途", core_color: "芯色", construction: "構造", presentation: "輸入時の構成",
};

/** Extract a labeled clause for human review. It never changes the merchant's attributes. */
export function specificationHints(description: string, attribute: string): string[] {
  const label = fieldLabels[attribute];
  if (!label) return [];
  const hints: string[] = [];
  for (const rawClause of description.split(/[。；;\r\n]/u)) {
    const clause = rawClause.trim();
    if (clause.startsWith(label + "：") || clause.startsWith(label + ":")) {
      if (clause.slice(label.length + 1).trim()) hints.push(clause);
    }
  }
  return [...new Set(hints)];
}

export function intakeReport(batch: ClassificationBatchInput, catalog: ClassificationCatalog,
  events: readonly ClassificationEvent[], now: Date) {
  if (batch.context.country !== "JP" || batch.context.direction !== "import" || batch.context.hsEdition !== "HS2022")
    throw new Error("JP_IMPORT_HS2022_REQUIRED");
  const routing = routeClassificationBatch(batch, catalog, events, loadDataset(), now);
  return {
    context: routing.context, counts: routing.counts, merchantId: routing.merchantId,
    catalogDigest: routing.catalogDigest, productionAuthorized: routing.productionAuthorized,
    items: routing.results.map((result, index) => ({
      sku: result.sku, revision: result.revision, status: result.status,
      candidate: result.selectedCandidate, approvedCode: result.assignment.nationalCode,
      classificationConfirmed: result.classificationConfirmed,
      decisionReasons: result.decisionReasons, questionsTruncated: result.questionsTruncated,
      questions: result.questions.map(question => ({
        ...question,
        specificationExcerpts: specificationHints(batch.products[index]!.description, question.attribute),
      })),
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, path, other, ...extra] = process.argv.slice(2);
  try {
    if (!path || !other || extra.length) throw new Error("USAGE");
    const catalog = loadClassificationCatalog();
    if (command === "prepare") {
      const original = readFileSync(path);
      const { catalog: document, digest } = prepareReference(original, catalog);
      // Exclusive directory creation keeps concurrent attempts and existing output separate.
      mkdirSync(other, { mode: 0o700 });
      try {
        mkdirSync(join(other, "evidence"), { mode: 0o700 });
        writeFileSync(join(other, "evidence", digest), original, { flag: "wx", mode: 0o600 });
        writeFileSync(join(other, "classification.json"), JSON.stringify(document) + "\n", { flag: "wx", mode: 0o600 });
      } catch (error) {
        rmSync(other, { recursive: true, force: true });
        throw error;
      }
      console.log(JSON.stringify({ sourceSha256: digest, templateDate: "2026-11-25", approved: false }));
    } else if (command === "intake") {
      const context: unknown = JSON.parse(readFileSync(other, "utf8"));
      const batch = classificationBatchFromCsv(readFileSync(path, "utf8"), context);
      const now = new Date();
      console.log(JSON.stringify(intakeReport(batch, catalog, loadClassificationEvents(process.env, now), now), null, 2));
    } else throw new Error("USAGE");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "USAGE") console.error("Usage: jp-stationery prepare ORIGINAL_CH96_HTML NEW_DIRECTORY | intake MERCHANT_CSV CONTEXT_JSON");
    else if (message === "JP_SOURCE_DIGEST_MISMATCH" || message === "JP_IMPORT_HS2022_REQUIRED") console.error(message);
    else console.error("JP_STATIONERY_INPUT_OR_OUTPUT_INVALID");
    process.exitCode = 1;
  }
}
