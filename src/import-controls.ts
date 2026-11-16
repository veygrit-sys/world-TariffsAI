import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { customsDocumentCodes, type CustomsDocumentCode, type CustomsPlanLineInput, type Dataset, type GoodsType, type Shipment } from "./types.ts";

export interface ImportControlReference {
  id: string;
  countries: string[];
  category: "import_permit" | "biosecurity" | "documents" | "territory";
  titleJa: string;
  submissionJa: string;
  conditionJa: string;
  requirement: "verify_conditions" | "document_required" | "authority_review";
  appliesWhen: {
    tariffCodes?: string[];
    goodsTypes?: GoodsType[];
    transports?: Shipment["transport"][];
    transactions?: Shipment["transaction"][];
  };
  documents: CustomsDocumentCode[];
  referenceFrom: string;
  referenceThrough: string;
  sources: { authority: string; title: string; url: string }[];
}

export interface ImportIntakeCheck {
  reference: ImportControlReference;
  status: "verify_classification" | "check_with_authority" | "documents_needed" | "documents_reported";
  itemIds: string[];
  documents: {
    code: CustomsDocumentCode;
    status: "reported_present" | "required_for_review" | "check_requirement";
  }[];
  acceptanceConfirmed: false;
}

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: "object", properties, required, additionalProperties: false,
});
const array = (items: object, minItems = 1) => ({ type: "array", minItems, uniqueItems: true, items });
const text = { type: "string", minLength: 1 };
const date = { type: "string", format: "date" };
const goodsTypes = ["ordinary", "alcohol", "tobacco", "food", "medicine", "cosmetics", "battery", "plant", "animal", "dual_use", "unknown"];
const transports = ["air", "post", "sea", "land", "courier_unspecified"];
const documentCode = { enum: [...customsDocumentCodes] };
export const importControlReferenceSchema = object({
  id: { type: "string", pattern: "^[a-z][a-z0-9_]{2,79}$" },
  countries: array({ type: "string", pattern: "^[A-Z]{2}$" }),
  category: { enum: ["import_permit", "biosecurity", "documents", "territory"] },
  titleJa: text, submissionJa: text, conditionJa: text,
  requirement: { enum: ["verify_conditions", "document_required", "authority_review"] },
  appliesWhen: object({
    tariffCodes: array({ type: "string", pattern: "^\\d{6,12}$" }),
    goodsTypes: array({ enum: goodsTypes }),
    transports: array({ enum: transports }),
    transactions: array({ enum: ["b2c_sale", "b2b_sale", "private_gift", "return", "sample"] }),
  }, []),
  documents: array(documentCode, 0),
  referenceFrom: date, referenceThrough: date,
  sources: array(object({ authority: text, title: text, url: { type: "string", format: "uri", pattern: "^https://" } })),
});

export const importIntakeCheckSchema = object({
  reference: importControlReferenceSchema,
  status: { enum: ["verify_classification", "check_with_authority", "documents_needed", "documents_reported"] },
  itemIds: array(text),
  documents: array(object({
    code: documentCode,
    status: { enum: ["reported_present", "required_for_review", "check_requirement"] },
  }), 0),
  acceptanceConfirmed: { const: false },
});

const ajv = new Ajv({ strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ImportControlReference[]>(array(importControlReferenceSchema, 0));

export function loadImportControls(data: Dataset, document: unknown): ImportControlReference[] {
  if (!validate(document)) throw new Error("INVALID_IMPORT_CONTROL_REFERENCES: " + ajv.errorsText(validate.errors));
  const registry = new Set([...data.countries, ...data.supplementalRegions]
    .filter(({ inScope }) => inScope).map(({ code }) => code));
  const ids = new Set<string>();
  for (const reference of document) {
    if (ids.has(reference.id) || reference.referenceFrom > reference.referenceThrough ||
        reference.countries.some((country) => !registry.has(country)) ||
        (reference.requirement === "document_required" && !reference.documents.length) ||
        reference.sources.some(({ url }) => {
          const address = new URL(url);
          return address.username || address.password;
        }))
      throw new Error("INVALID_IMPORT_CONTROL_REFERENCE: " + reference.id);
    ids.add(reference.id);
  }
  return document;
}

export function importControlReferences(data: Dataset, country: string, date: string): ImportControlReference[] {
  return (data.importControlReferences ?? []).filter((reference) =>
    reference.countries.includes(country) && reference.referenceFrom <= date && date <= reference.referenceThrough,
  ).map((reference) => structuredClone(reference));
}

export function reviewImportIntake(
  references: readonly ImportControlReference[],
  shipment: Shipment,
  lines: ReadonlyMap<string, CustomsPlanLineInput>,
  available: readonly CustomsDocumentCode[],
): ImportIntakeCheck[] {
  const checks: ImportIntakeCheck[] = [];
  const provided = new Set(available);
  for (const reference of references) {
    const { tariffCodes, goodsTypes, transports, transactions } = reference.appliesWhen;
    if ((transports && !transports.includes(shipment.transport)) ||
        (transactions && !transactions.includes(shipment.transaction))) continue;
    const itemIds: string[] = [];
    let classifiedMatch = false;
    for (const item of shipment.items) {
      if (goodsTypes && !goodsTypes.includes(item.goodsType)) continue;
      const declared = lines.get(item.id)?.tariffCode;
      const code = declared ?? item.hs6;
      if (tariffCodes && (!code || !tariffCodes.some((target) => code.startsWith(target) || target.startsWith(code)))) continue;
      itemIds.push(item.id);
      if (!tariffCodes || (declared && item.classificationConfirmed &&
          tariffCodes.includes(declared)))
        classifiedMatch = true;
    }
    if (!itemIds.length) continue;
    const required = classifiedMatch && reference.requirement === "document_required";
    const documents = reference.documents.map((code): ImportIntakeCheck["documents"][number] => ({
      code, status: provided.has(code) ? "reported_present" : required ? "required_for_review" : "check_requirement",
    }));
    checks.push({
      reference, itemIds, documents, acceptanceConfirmed: false,
      status: !classifiedMatch ? "verify_classification" :
        !required ? "check_with_authority" :
        documents.some(({ status }) => status === "required_for_review") ? "documents_needed" : "documents_reported",
    });
  }
  return checks;
}
