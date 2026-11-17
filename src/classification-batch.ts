import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset } from "./dataset.ts";
import { InputError } from "./schema.ts";
import { parseClassificationRequest } from "./classification.ts";
import type { ClassificationCatalog } from "./classification-catalog.ts";
import {
  assignClassification, classificationAssignmentSchema,
  type ClassificationAssignment, type ClassificationEvent,
} from "./classification-approvals.ts";
import {
  classificationContextSchema, classificationObject, classificationProductSchema,
  type ClassificationContext, type ClassificationProduct,
} from "./classification-types.ts";
import type { Dataset } from "./types.ts";

export interface ClassificationBatchInput {
  context: ClassificationContext;
  products: ClassificationProduct[];
}
const assignmentStatuses = ["approved", "needs_attributes", "candidates", "unsupported", "review_required"] as const;
export interface ClassificationBatch {
  merchantId: string;
  context: ClassificationContext;
  status: "approved" | "review_required";
  counts: Record<(typeof assignmentStatuses)[number], number>;
  results: ClassificationAssignment[];
}
export const classificationBatchInputSchema = classificationObject({
  context: classificationContextSchema,
  products: { type: "array", minItems: 1, maxItems: 100, items: classificationProductSchema },
});
export const classificationBatchOutputSchema = classificationObject({
  merchantId: classificationProductSchema.properties.merchantId,
  context: classificationContextSchema,
  status: { enum: ["approved", "review_required"] },
  counts: classificationObject(Object.fromEntries(assignmentStatuses.map(status => [status,
    { type: "integer", minimum: 0, maximum: 100 }]))),
  results: { type: "array", minItems: 1, maxItems: 100, items: classificationAssignmentSchema },
});
const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ClassificationBatchInput>(classificationBatchInputSchema);

/** A batch belongs to one authenticated merchant; each SKU is evaluated once. */
export function parseClassificationBatch(input: unknown, data: Dataset = loadDataset()): ClassificationBatchInput {
  if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20)
    .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  const products: ClassificationProduct[] = [];
  const seen = new Set<string>();
  let context: ClassificationContext | undefined;
  const merchantId = input.products[0]!.merchantId;
  for (const [index, product] of input.products.entries()) {
    if (product.merchantId !== merchantId)
      throw new InputError([{ path: `/products/${index}/merchantId`, code: "CLASSIFICATION_BATCH_MERCHANT_MISMATCH" }]);
    if (seen.has(product.sku))
      throw new InputError([{ path: `/products/${index}/sku`, code: "DUPLICATE_CLASSIFICATION_SKU" }]);
    seen.add(product.sku);
    const parsed = parseClassificationRequest({ product, context: input.context }, data);
    products.push(parsed.product);
    context = parsed.context;
  }
  return { context: context!, products };
}

export function assignClassificationBatch(
  input: unknown, catalog: ClassificationCatalog, events: readonly ClassificationEvent[],
  data: Dataset = loadDataset(), now = new Date(),
): ClassificationBatch {
  const batch = parseClassificationBatch(input, data);
  const results = batch.products.map(product => assignClassification({ product, context: batch.context }, catalog, events, data, now));
  const counts: ClassificationBatch["counts"] = {
    approved: 0, needs_attributes: 0, candidates: 0, unsupported: 0, review_required: 0,
  };
  for (const result of results) counts[result.status] += 1;
  return { merchantId: batch.products[0]!.merchantId, context: batch.context,
    status: counts.approved === results.length ? "approved" : "review_required", counts, results };
}

function csvFailure(code: string, row?: number): never {
  throw new InputError([{ path: row === undefined ? "/csv" : `/csv/rows/${row}`, code }]);
}

/** Bounded CSV parser supporting quoted commas/newlines, escaped quotes, BOM and CRLF. */
function csvRows(input: string): string[][] {
  if (Buffer.byteLength(input, "utf8") > 1_048_576) csvFailure("CLASSIFICATION_CSV_TOO_LARGE");
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, afterQuote = false;
  const cell = () => {
    row.push(value); value = ""; afterQuote = false;
    if (row.length > 55) csvFailure("CLASSIFICATION_CSV_TOO_MANY_COLUMNS", rows.length + 1);
  };
  const line = () => {
    cell(); rows.push(row); row = [];
    if (rows.length > 101) csvFailure("CLASSIFICATION_CSV_TOO_MANY_ROWS");
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index++; }
        else { quoted = false; afterQuote = true; }
      } else value += char;
    } else if (char === ",") cell();
    else if (char === "\n" || char === "\r") {
      line();
      if (char === "\r" && text[index + 1] === "\n") index++;
    } else if (char === '"' && value.length === 0 && !afterQuote) quoted = true;
    else {
      if (char === '"' || afterQuote) csvFailure("INVALID_CLASSIFICATION_CSV_QUOTING", rows.length + 1);
      value += char;
    }
    if (value.length > 10_000) csvFailure("CLASSIFICATION_CSV_CELL_TOO_LONG", rows.length + 1);
  }
  if (quoted) csvFailure("INVALID_CLASSIFICATION_CSV_QUOTING", rows.length + 1);
  if (row.length || value.length || afterQuote) line();
  if (rows.length < 2) csvFailure("CLASSIFICATION_CSV_PRODUCTS_REQUIRED");
  return rows;
}

/** Import data only. Formulas are retained as inert strings and no approvals are created. */
export function classificationBatchFromCsv(
  csv: string, context: unknown, data: Dataset = loadDataset(),
): ClassificationBatchInput {
  const rows = csvRows(csv);
  const headers = rows[0]!;
  const required = ["merchantId", "sku", "revision", "description"];
  if (new Set(headers).size !== headers.length || required.some(key => !headers.includes(key)) ||
      headers.some(key => !required.includes(key) && key !== "attributes" && !/^attribute\.[a-z][a-z0-9_]{0,49}$/.test(key)))
    csvFailure("INVALID_CLASSIFICATION_CSV_HEADERS");
  const products = rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) csvFailure("CLASSIFICATION_CSV_COLUMN_COUNT", index + 2);
    const values = Object.fromEntries(headers.map((header, column) => [header, cells[column]!]));
    let attributes: Record<string, unknown> = {};
    if (values.attributes) {
      let parsed: unknown;
      try { parsed = JSON.parse(values.attributes); }
      catch { csvFailure("INVALID_CLASSIFICATION_CSV_ATTRIBUTES", index + 2); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        csvFailure("INVALID_CLASSIFICATION_CSV_ATTRIBUTES", index + 2);
      attributes = { ...parsed as Record<string, unknown> };
    }
    for (const header of headers.filter(header => header.startsWith("attribute."))) {
      const value = values[header]!;
      if (!value) continue;
      const key = header.slice("attribute.".length);
      if (Object.hasOwn(attributes, key) && attributes[key] !== value)
        csvFailure("CONFLICTING_CLASSIFICATION_CSV_ATTRIBUTE", index + 2);
      attributes[key] = value;
    }
    return { merchantId: values.merchantId, sku: values.sku, revision: values.revision,
      description: values.description, attributes };
  });
  return parseClassificationBatch({ context, products }, data);
}
