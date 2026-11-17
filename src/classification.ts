import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset, todayJst } from "./dataset.ts";
import { requestDigest } from "./engine.ts";
import { InputError } from "./schema.ts";
import type { Dataset } from "./types.ts";
import { ClassificationCatalog } from "./classification-catalog.ts";
import {
  classificationRequestSchema, type ClassificationCandidate, type ClassificationContext,
  type ClassificationProduct, type ClassificationProposal, type ClassificationQuestion,
  type ClassificationRequest, type ClassificationRule, type ClassificationSource,
} from "./classification-types.ts";

const ajv = new Ajv({ allErrors: true, strict: true });
(addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
const validate = ajv.compile<ClassificationRequest>(classificationRequestSchema);

/** Search and fingerprint normalization never fills in an unprovided product fact. */
export function normalizeClassificationText(value: string): string {
  return normalizeIdentityText(value).toLowerCase();
}

function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeClassificationProduct(product: ClassificationProduct): ClassificationProduct {
  return {
    merchantId: product.merchantId, sku: product.sku, revision: product.revision,
    description: normalizeIdentityText(product.description),
    attributes: Object.fromEntries(Object.keys(product.attributes).sort()
      .map((key) => [key, normalizeIdentityText(product.attributes[key]!)])),
  };
}

export function normalizeClassificationContext(context: ClassificationContext): ClassificationContext {
  return { ...context, hsEdition: context.hsEdition.normalize("NFKC").trim().replace(/\s+/gu, " ") };
}

export function productFingerprint(product: ClassificationProduct): string {
  return requestDigest(normalizeClassificationProduct(product));
}

export function classificationContextDigest(context: ClassificationContext): string {
  return requestDigest(normalizeClassificationContext(context));
}

export function parseClassificationRequest(input: unknown, data: Dataset = loadDataset()): ClassificationRequest {
  if (!validate(input)) throw new InputError((validate.errors ?? []).slice(0, 20)
    .map(({ instancePath, keyword }) => ({ path: instancePath, code: keyword })));
  const product = normalizeClassificationProduct(input.product);
  const context = normalizeClassificationContext(input.context);
  if (!product.description || !product.sku.trim() || !context.hsEdition || Object.values(product.attributes).some((value) => !value))
    throw new InputError([{ path: "/product", code: "CLASSIFICATION_TEXT_REQUIRED" }]);
  if (![...data.countries, ...data.supplementalRegions].some(({ code }) => code === context.country))
    throw new InputError([{ path: "/context/country", code: "UNKNOWN_COUNTRY" }]);
  return { product, context };
}

export function classificationScopeMatches(
  country: string, direction: string, edition: string, context: ClassificationContext,
): boolean {
  return (country === "*" || country === context.country) &&
    (direction === "both" || direction === context.direction) &&
    normalizeIdentityText(edition) === context.hsEdition;
}

export function classificationSourceIssue(source: ClassificationSource, context: ClassificationContext, today: string): string | null {
  if (!source.countries.some((country) => classificationScopeMatches(country, source.direction, source.hsEdition, context)))
    return "CLASSIFICATION_SOURCE_SCOPE_MISMATCH";
  if (source.checkedOn > today) return "CLASSIFICATION_SOURCE_NOT_OBSERVED";
  if (source.reviewBy < today || source.reviewBy < context.date) return "CLASSIFICATION_SOURCE_REVIEW_EXPIRED";
  if (context.date < source.effectiveFrom || context.date > source.effectiveThrough)
    return "CLASSIFICATION_SOURCE_DATE_NOT_COVERED";
  return null;
}

function keywordMatches(text: string, keyword: string): boolean {
  const term = normalizeClassificationText(keyword);
  let offset = text.indexOf(term);
  while (offset !== -1) {
    const before = text[offset - 1] ?? "";
    const after = text[offset + term.length] ?? "";
    const leftMatches = !/[a-z0-9]/.test(term[0] ?? "") || !/[a-z0-9]/.test(before);
    const rightMatches = !/[a-z0-9]/.test(term.at(-1) ?? "") || !/[a-z0-9]/.test(after);
    if (leftMatches && rightMatches) return true;
    offset = text.indexOf(term, offset + 1);
  }
  return false;
}

interface RankedCandidate {
  rule: ClassificationRule;
  candidate: ClassificationCandidate;
  keywordCount: number;
}

function matchingAttributes(rule: ClassificationRule, product: ClassificationProduct): string[] | null {
  const matched: string[] = [];
  for (const [key, alternatives] of Object.entries(rule.attributeConditions)) {
    const supplied = Object.hasOwn(product.attributes, key) ? product.attributes[key] : undefined;
    if (supplied === undefined) continue;
    // Attribute values are untyped facts: case can distinguish units or formulas.
    // Catalogs may list deliberate aliases; generic search case-folding is unsafe here.
    if (!alternatives.some((value) => normalizeIdentityText(value) === supplied)) return null;
    matched.push(key);
  }
  return matched.sort();
}

function canApproveNationalCode(
  rule: ClassificationRule, sources: readonly ClassificationSource[], context: ClassificationContext,
  missing: readonly string[],
): boolean {
  return missing.length === 0 && Boolean(rule.nationalCode && rule.tariffEdition) &&
    rule.country === context.country && rule.direction === context.direction &&
    sources.some((source) => source.kind === "tariff_schedule" && source.direction === context.direction &&
      source.countries.includes(context.country));
}

function rankRule(
  rule: ClassificationRule, request: ClassificationRequest, catalog: ClassificationCatalog,
  today: string, findings: Map<string, ClassificationProposal["findings"][number]>,
): RankedCandidate | null {
  if (!classificationScopeMatches(rule.country, rule.direction, rule.hsEdition, request.context)) return null;
  const searchable = normalizeClassificationText([request.product.description, ...Object.values(request.product.attributes)].join(" "));
  const keywordCount = rule.keywords.filter((keyword) => keywordMatches(searchable, keyword)).length;
  if (!keywordCount) return null;
  const matchedAttributes = matchingAttributes(rule, request.product);
  if (matchedAttributes === null) return null;
  const sources = rule.sourceIds.map((id) => catalog.source(id)!);
  let invalid = false;
  for (const source of sources) {
    const issue = classificationSourceIssue(source, request.context, today);
    if (issue) {
      findings.set(source.id + ":" + issue, { code: issue, sourceId: source.id });
      invalid = true;
    }
  }
  if (invalid) return null;
  const missingAttributes = rule.requiredAttributes.filter((key) => !Object.hasOwn(request.product.attributes, key)).sort();
  return {
    rule, keywordCount,
    candidate: {
      ruleId: rule.id, hs6: rule.hs6, nationalCode: rule.nationalCode ?? null,
      tariffEdition: rule.tariffEdition ?? null, title: rule.title, rationale: rule.rationale,
      sourceIds: [...rule.sourceIds], matchedAttributes, missingAttributes,
      eligibleForApproval: canApproveNationalCode(rule, sources, request.context, missingAttributes),
      classificationConfirmed: false,
    },
  };
}

function bestCandidates(candidates: RankedCandidate[]): RankedCandidate[] {
  candidates.sort((a, b) => b.candidate.matchedAttributes.length - a.candidate.matchedAttributes.length ||
    a.candidate.missingAttributes.length - b.candidate.missingAttributes.length ||
    b.keywordCount - a.keywordCount || a.rule.id.localeCompare(b.rule.id));
  const identities = new Set<string>();
  return candidates.filter(({ candidate }) => {
    const key = [candidate.hs6, candidate.nationalCode ?? "", candidate.tariffEdition ?? ""].join(":");
    if (identities.has(key)) return false;
    identities.add(key);
    return true;
  }).slice(0, 3);
}

function questionsFor(candidates: readonly RankedCandidate[]): ClassificationQuestion[] {
  const questions = new Map<string, ClassificationQuestion>();
  for (const { rule, candidate } of candidates) {
    for (const attribute of candidate.missingAttributes) {
      const question = questions.get(attribute) ?? {
        attribute, question: Object.hasOwn(rule.questions, attribute)
          ? rule.questions[attribute]! : `Provide the confirmed ${attribute.replaceAll("_", " ")}.`,
        candidateRuleIds: [],
      };
      question.candidateRuleIds.push(rule.id);
      questions.set(attribute, question);
    }
  }
  // Keep each response actionable and within its published bound. Remaining
  // attributes stay visible on the candidates and can be asked on the next pass.
  return [...questions.values()].slice(0, 50);
}

/** Grounded reference search and questions; only a separate recorded review can confirm a code. */
export function proposeClassification(
  input: unknown, catalog: ClassificationCatalog, data: Dataset = loadDataset(), now = new Date(),
): ClassificationProposal {
  const request = parseClassificationRequest(input, data);
  const { product, context } = request;
  const base = {
    merchantId: product.merchantId, sku: product.sku, revision: product.revision, context,
    productFingerprint: productFingerprint(product), contextDigest: classificationContextDigest(context),
    requestDigest: requestDigest(request), catalogDigest: catalog.digest, catalogVersion: catalog.version,
    candidates: [] as ClassificationCandidate[], questions: [] as ClassificationQuestion[],
    findings: [] as ClassificationProposal["findings"], classificationConfirmed: false as const,
  };
  const country = [...data.countries, ...data.supplementalRegions].find(({ code }) => code === context.country)!;
  if (!country.inScope || context.country === "KP" || context.country === "AQ")
    return { ...base, status: "unsupported", findings: [{ code: "CLASSIFICATION_COUNTRY_EXCLUDED" }] };
  const findings = new Map<string, ClassificationProposal["findings"][number]>();
  const ranked = bestCandidates(catalog.rules.flatMap((rule) => {
    const candidate = rankRule(rule, request, catalog, todayJst(now), findings);
    return candidate ? [candidate] : [];
  }));
  const candidates = ranked.map(({ candidate }) => candidate);
  if (!candidates.length) return {
    ...base, status: findings.size ? "review_required" : "unsupported",
    findings: findings.size ? [...findings.values()].slice(0, 2000) : [{ code: "CLASSIFICATION_REFERENCE_NOT_FOUND" }],
  };
  return {
    ...base, status: candidates[0]!.missingAttributes.length ? "needs_attributes" : "candidates",
    candidates, questions: questionsFor(ranked), findings: [...findings.values()].slice(0, 2000),
  };
}
