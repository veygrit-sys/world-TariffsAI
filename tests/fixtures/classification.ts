import { ClassificationCatalog } from "../../src/classification-catalog.ts";
import { proposeClassification } from "../../src/classification.ts";
import type { ClassificationApprovalInput } from "../../src/classification-approvals.ts";
import type { ClassificationCatalogDocument, ClassificationRequest } from "../../src/classification-types.ts";
import { data } from "../helpers.ts";

export const classificationFixtureNow = new Date("2026-11-18T03:00:00Z");

/** Synthetic references exercise the workflow; they are not official classification data. */
export function classificationFixtureDocument(): ClassificationCatalogDocument {
  return {
    version: "synthetic-classification-v1",
    sources: [{ id: "synthetic-jp-schedule", title: "Synthetic Japan tariff schedule", url: "https://test.example/classification/jp",
      kind: "tariff_schedule", countries: ["JP"], direction: "import", hsEdition: "HS2022",
      checkedOn: "2026-11-18", reviewBy: "2026-12-18", effectiveFrom: "2026-11-01",
      effectiveThrough: "2026-12-18", terms: "Synthetic fixture only" }],
    rules: [{ id: "synthetic-ceramic-cup", title: "Synthetic ceramic cup reference", country: "JP", direction: "import",
      hsEdition: "HS2022", hs6: "691200", nationalCode: "691200100", tariffEdition: "synthetic-jp-2026",
      keywords: ["cup", "mug", "カップ", "杯"], requiredAttributes: ["material", "intended_use", "construction"],
      attributeConditions: { material: ["ceramic"], intended_use: ["tableware"], construction: ["finished"] },
      questions: { material: "What is its confirmed material?", intended_use: "What is its intended use?", construction: "Is it a finished article?" },
      sourceIds: ["synthetic-jp-schedule"], rationale: "Synthetic matching fixture for a complete set of reviewed product attributes." }],
  };
}

export function classificationFixtureCatalog(): ClassificationCatalog {
  return new ClassificationCatalog(classificationFixtureDocument(), data);
}

export function classificationFixtureRequest(): ClassificationRequest {
  return {
    product: { merchantId: "synthetic-merchant", sku: "synthetic-cup", revision: "v1",
      description: "Ceramic cup", attributes: { material: "ceramic", intended_use: "tableware", construction: "finished" } },
    context: { country: "JP", direction: "import", date: "2026-11-18", hsEdition: "HS2022" },
  };
}

export function classificationFixtureApprovalInput(
  catalog = classificationFixtureCatalog(), request = classificationFixtureRequest(),
): ClassificationApprovalInput {
  return {
    id: "synthetic-approval-1", request, requestDigest: proposeClassification(request, catalog, data, classificationFixtureNow).requestDigest,
    ruleId: catalog.rules[0]!.id, validFrom: "2026-11-18", validThrough: "2026-11-25",
    reviewedOn: "2026-11-18", reviewBy: "2026-11-25", reviewerRef: "synthetic-reviewer",
    evidenceIds: ["synthetic-review-evidence"],
  };
}
