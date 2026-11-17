import { writeFileSync } from "node:fs";
import {
  shipmentSchema,
  askSchema,
  classifySchema,
  customsPlanSchema,
  tariffLookupSchema,
} from "../src/schema.ts";
import { checkoutAmountHoldReasons } from "../src/checkout.ts";
import { customsDocumentCodes } from "../src/types.ts";
import { pilotChargeCategories, pilotQuoteInputSchema, worldQuoteInputSchema } from "../src/pilot-quote.ts";
import { invoiceReconciliationInputSchema, invoiceReconciliationOutputSchema } from "../src/invoice-reconciliation.ts";
import { importSettlementCoverageInputSchema, importSettlementCoverageOutputSchema } from "../src/import-settlement-coverage.ts";
import { importSettlementDestinationsOutputSchema } from "../src/import-settlement-destinations.ts";
import { importSettlementPlanInputSchema, importSettlementPlanOutputSchema } from "../src/import-settlement-plan.ts";
import { importSettlementReconciliationInputSchema, importSettlementReconciliationOutputSchema } from "../src/import-settlement-reconciliation.ts";
import { importSettlementLedgerInputSchema, importSettlementLedgerOutputSchema } from "../src/import-settlement-ledger.ts";
import { classificationRequestSchema, classificationProposalSchema } from "../src/classification-types.ts";
import { classificationAssignmentSchema } from "../src/classification-approvals.ts";
import { classificationBatchInputSchema, classificationBatchOutputSchema } from "../src/classification-batch.ts";
import { classificationSourceSchema } from "../src/classification-catalog.ts";
import { PILOT_ROUTES } from "../src/trade-policy.ts";
import { VERSION } from "../src/version.ts";
import { tariffEvidenceBases } from "../src/tariff-evidence.ts";
import { tariffSourceStatuses } from "../src/tariff-source-directory.ts";
import { documentFormats } from "../src/tariff-source-registry.ts";
import { customsScopeClassifications } from "../src/destination-customs-scope.ts";
import { tradeBlocCheckSchema } from "../src/trade-blocs.ts";
import { transitReviewSchema } from "../src/transit-route.ts";
import { specialProcedureCheckSchema } from "../src/special-procedures.ts";
import { specialTerritoryReviewSchema } from "../src/special-territories.ts";
import { importIntakeCheckSchema } from "../src/import-controls.ts";
import { customsFeeReferenceSchema } from "../src/customs-fees.ts";
import { regionalCustomsProfileSchema } from "../src/regional-customs.ts";
import { worldDirectionCoverageOutputSchema, worldDirectionInputSchema, worldDirectionOutputSchema } from "../src/world-directions.ts";
import { classificationRolloutInputSchema, classificationRolloutOutputSchema } from "../src/classification-rollout.ts";
const response = (
  description: string,
  schema: unknown = { type: "object" },
) => ({ description, content: { "application/json": { schema } } });
const errors = {
  400: response("Invalid or extra input fields"),
  401: response("Invalid service credential"),
  403: response("Browser origin rejected"),
  405: response("HTTP method not allowed"),
  413: response("Body exceeds 64 KiB"),
  415: response("Expected uncompressed JSON"),
  429: response("Process-local rate limit exceeded"),
  500: response("Generic internal error"),
};
const amount = {
  type: "object",
  additionalProperties: false,
  required: ["currency", "value"],
  properties: { currency: { type: "string" }, value: { type: "string" } },
};
const assessment = {
  type: "object",
  required: [
    "status",
    "shippingAuthorized",
    "checkoutReady",
    "charges",
    "unknownCharges",
    "landedCostTotal",
  ],
  properties: {
    schemaVersion: { type: "string" },
    ruleSetVersion: { type: "string" },
    requestDigest: { type: "string" },
    assessedAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
    importDate: { type: "string", format: "date" },
    status: { enum: ["partial_estimate", "needs_review", "out_of_scope"] },
    shippingAuthorized: { const: false },
    checkoutReady: { const: false },
    charges: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "amount", "ruleId", "sourceIds"],
        properties: {
          kind: { type: "string" },
          amount,
          collection: { type: "string" },
          ruleId: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
          basis: { type: "string" },
          rounding: { type: "string" },
        },
      },
    },
    unknownCharges: { type: "array", items: { type: "string" } },
    estimatedTaxSubtotal: { anyOf: [amount, { type: "null" }] },
    landedCostTotal: { type: "null" },
  },
};
const checkoutTaxGroup = {
  type: "object",
  required: ["status", "knownSubtotal", "charges", "unresolvedCharges"],
  properties: {
    status: { enum: ["estimate_available", "partial_estimate", "review_required"] },
    knownSubtotal: { anyOf: [amount, { type: "null" }] },
    charges: assessment.properties.charges,
    unresolvedCharges: { type: "array", items: { type: "string" } },
  },
};
const checkoutPreview = {
  type: "object",
  required: [
    "schemaVersion", "context", "status", "ruleSetVersion", "requestDigest",
    "assessedAt", "expiresAt", "importDate", "route", "goodsSubtotal", "customsAmountHold", "checkoutTax", "importTaxAndDuty",
    "otherUnresolvedCharges", "taxHandoff", "requiresRequote", "checkoutReady",
    "shippingAuthorized", "landedCostTotal", "findings", "sourceIds", "sources", "documents",
  ],
  properties: {
    schemaVersion: { const: "1.0" },
    context: { const: "shipment_preview" },
    status: assessment.properties.status,
    ruleSetVersion: { type: "string" },
    requestDigest: { type: "string" },
    assessedAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
    importDate: { type: "string", format: "date" },
    route: { enum: ["domestic", "eu_intra_union", "cross_border", "unresolved"] },
    goodsSubtotal: amount,
    customsAmountHold: {
      type: "object", required: ["required", "reasons"], additionalProperties: false,
      properties: {
        required: { type: "boolean" },
        reasons: { type: "array", uniqueItems: true, items: { enum: [...checkoutAmountHoldReasons] } },
      },
    },
    checkoutTax: checkoutTaxGroup,
    importTaxAndDuty: checkoutTaxGroup,
    otherUnresolvedCharges: { type: "array", items: { type: "string" } },
    taxHandoff: { enum: ["evidence_present", "evidence_required", "not_evaluated"] },
    requiresRequote: { type: "boolean" },
    checkoutReady: { const: false },
    shippingAuthorized: { const: false },
    landedCostTotal: { type: "null" },
    findings: { type: "array", items: { type: "object" } },
    sourceIds: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "object" } },
    documents: { type: "array", items: { type: "string" } },
  },
};
const destinationCoverage = {
  type: "object",
  required: ["referenceDate", "checkedOn", "ruleSetVersion", "commonCalculationConditions", "totals", "destinations"],
  properties: {
    referenceDate: { type: "string", format: "date" },
    checkedOn: { type: "string", format: "date" },
    ruleSetVersion: { type: "string" },
    commonCalculationConditions: { type: "array", items: { type: "string" } },
    totals: { type: "object", additionalProperties: { type: "integer", minimum: 0 } },
    destinations: {
      type: "array",
      items: {
        type: "object",
        required: [
          "destinationCountry", "name", "nameJa", "membershipStatus", "officialSources",
          "generalDutyPolicies", "standardTariffStatus", "referencesOnDate", "pastReferences",
          "futureReferences", "chargeReferencesOnDate", "conditionalCalculationRules", "commerciallyAuthorised",
          "customsPlanAvailable", "publishedStandardTariffSnapshotIdsOnDate",
        ],
        properties: {
          destinationCountry: { type: "string", pattern: "^[A-Z]{2}$" },
          name: { type: "string" },
          nameJa: { type: "string" },
          membershipStatus: { enum: ["member", "outside_wco_roster"] },
          officialSources: { type: "array", items: { type: "object" } },
          generalDutyPolicies: { type: "array", items: { type: "object" } },
          standardTariffStatus: {
            enum: ["tariff_reference_on_date", "tariff_reference_other_date", "official_sources_only", "registry_only"],
          },
          referencesOnDate: { type: "array", items: { type: "object" } },
          pastReferences: { type: "array", items: { type: "object" } },
          futureReferences: { type: "array", items: { type: "object" } },
          chargeReferencesOnDate: {
            type: "object",
            required: ["importVatOrGst", "excise", "additionalDutyOrTradeRemedy"],
            properties: {
              importVatOrGst: { type: "array", items: { type: "string" } },
              excise: { type: "array", items: { type: "string" } },
              additionalDutyOrTradeRemedy: { type: "array", items: { type: "string" } },
            },
          },
          conditionalCalculationRules: { type: "array", items: { type: "object" } },
          customsPlanAvailable: { const: true },
          publishedStandardTariffSnapshotIdsOnDate: { type: "array", items: { type: "string" } },
          commerciallyAuthorised: { const: false },
        },
      },
    },
  },
};
const post = (
  summary: string,
  schema: unknown,
  output: unknown = { type: "object" },
) => ({
  post: {
    summary,
    requestBody: {
      required: true,
      content: { "application/json": { schema } },
    },
    responses: {
      200: response("Source-backed decision support", output),
      ...errors,
    },
  },
});
const tariffRateReference = {
  type: "object",
  required: ["charge", "label", "expression", "adValoremPercent"],
  properties: {
    charge: {
      enum: [
        "customs_duty",
        "import_vat",
        "import_gst",
        "additional_duty",
        "excise",
        "trade_remedy",
        "levy",
        "fee",
        "other",
      ],
    },
    label: { type: "string" },
    expression: { type: "string" },
    adValoremPercent: { type: ["string", "null"] },
    originCountries: { type: "array", items: { type: "string" } },
    excludedOriginCountries: { type: "array", items: { type: "string" } },
    condition: { type: "string" },
  },
};
const tariffLineReference = {
  type: "object",
  required: ["code", "reference", "rates"],
  properties: {
    code: { type: "string" },
    reference: { type: "string" },
    rates: { type: "array", items: tariffRateReference },
    url: { type: "string", format: "uri" },
  },
};
const generalDutyPolicy = {
  type: "object",
  required: ["destinationCountry", "treatment", "scope", "otherChargesAndControls", "sources"],
  properties: {
    destinationCountry: { type: "string", pattern: "^[A-Z]{2}$" },
    treatment: { enum: ["general_zero", "most_goods_zero"] },
    customsTerritory: { type: "string" },
    availableFrom: { type: "string", format: "date" },
    availableThrough: { type: "string", format: "date" },
    scope: { type: "string" },
    otherChargesAndControls: { type: "string" },
    sources: { type: "array", items: { type: "object" } },
  },
};
const tariffLookupResult = {
  type: "object",
  required: [
    "status",
    "referenceDate",
    "matches",
    "applicableRate",
    "generalDutyPolicy",
    "measures",
  ],
  properties: {
    status: { type: "string" },
    referenceDate: { type: ["string", "null"], format: "date" },
    applicableRate: { type: "null" },
    generalDutyPolicy: { anyOf: [generalDutyPolicy, { type: "null" }] },
    matches: { type: "array", items: tariffLineReference },
    measures: {
      type: "object",
      required: ["status", "sources", "matches", "totalMatches", "nextOffset"],
      properties: {
        status: {
          enum: [
            "measure_references",
            "no_matching_measures",
            "date_not_covered",
            "source_not_loaded",
            "territory_unresolved",
          ],
        },
        sources: {
          type: "array",
          items: {
            type: "object",
            required: ["snapshot", "referenceDate"],
            properties: {
              snapshot: {
                type: "object",
                required: [
                  "id",
                  "sourceUrl",
                  "availableFrom",
                  "availableThrough",
                ],
                properties: {
                  id: { type: "string" },
                  sourceUrl: { type: "string", format: "uri" },
                  availableFrom: { type: "string", format: "date" },
                  availableThrough: { type: "string", format: "date" },
                },
              },
              referenceDate: { type: ["string", "null"], format: "date" },
            },
          },
        },
        matches: {
          type: "array",
          items: {
            ...tariffLineReference,
            required: [
              ...tariffLineReference.required,
              "snapshotId",
              "matchedBy",
            ],
            properties: {
              ...tariffLineReference.properties,
              snapshotId: { type: "string" },
              matchedBy: { enum: ["exact", "prefix", "more_specific"] },
            },
          },
        },
        totalMatches: { type: "integer" },
        nextOffset: { type: ["integer", "null"] },
      },
    },
  },
};
const record = (properties: Record<string, unknown>) => ({
  type: "object", required: Object.keys(properties), properties, additionalProperties: false,
});
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
const array = (items: unknown) => ({ type: "array", items });
const string = { type: "string" };
const date = { type: "string", format: "date" };
const nonNegativeInteger = { type: "integer", minimum: 0 };
const territory = { enum: ["standard", "special", "unknown"] };
const choice = (...values: string[]) => ({ enum: values });
const dutyScenario = {
  oneOf: [
    record({ status: { const: "not_requested" } }),
    record({ status: { const: "review_required" }, reason: string }),
    record({
      status: { const: "calculated" },
      amount,
      treatment: choice("mfn", "general", "zero_duty_policy"),
      basis: choice("confirmed_line_customs_value", "confirmed_gross_weight", "published_zero_rate", "confirmed_zero_duty_policy"),
      expression: string,
      conditions: array(string),
      sourceUrls: array({ type: "string", format: "uri" }),
      snapshotId: nullable(string),
      rounding: choice("half_up_per_line", "exact"),
    }),
  ],
};
const destinationProfile = record({
  destinationCountry: { type: "string", pattern: "^[A-Z]{2}$" },
  referenceDate: date,
  membershipStatus: choice("member", "outside_wco_roster"),
  officialSources: array({ type: "object" }),
  generalDutyPolicy: nullable(generalDutyPolicy),
});
const snapshotReference = record({
  id: string,
  role: choice("tariff", "measures"),
  jurisdiction: string,
  scope: choice("national_schedule", "published_baseline", "compiled_reference", "hs6_aggregate"),
  edition: string,
  availableFrom: date,
  availableThrough: date,
  checkedOn: date,
  sourceUrl: { type: "string", format: "uri" },
  sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
  charges: array(string),
});
const customsPlanLine = record({
  itemId: string,
  quantity: { type: "integer", minimum: 1 },
  originCountry: { type: "string", pattern: "^[A-Z]{2}$" },
  tariffCode: nullable(string),
  classification: choice("confirmed", "candidate", "missing"),
  restrictionHints: array(string),
  confirmedCustomsValue: nullable(amount),
  tariffReferences: nullable(record({
    status: string,
    totalMatches: nonNegativeInteger,
    nextOffset: nullable(nonNegativeInteger),
    matches: array(tariffLineReference),
    snapshotId: nullable(string),
    measures: record({
      status: tariffLookupResult.properties.measures.properties.status,
      totalMatches: nonNegativeInteger,
      nextOffset: nullable(nonNegativeInteger),
      matches: tariffLookupResult.properties.measures.properties.matches,
      activeSnapshotIds: array(string),
    }),
  })),
  dutyScenario,
});
const customsPlan = record({
  schemaVersion: { const: "1.0" },
  requestDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
  importDate: date,
  origin: nullable(destinationProfile),
  destination: nullable(destinationProfile),
  destinationProcedures: nullable(regionalCustomsProfileSchema),
  feeReferences: array(customsFeeReferenceSchema),
  importIntake: array(importIntakeCheckSchema),
  specialTerritories: nullable(specialTerritoryReviewSchema),
  specialProcedures: array(specialProcedureCheckSchema),
  tradeBlocs: array(tradeBlocCheckSchema),
  transitReview: nullable(transitReviewSchema),
  originCustomsTerritory: nullable(string),
  originZone: territory,
  destinationZone: territory,
  customsTerritory: nullable(string),
  checkout: checkoutPreview,
  tariffCoverage: record({
    status: choice("published_for_date", "reference_for_date", "other_dates_only", "official_sources_only",
      "territory_review", "outside_scope"),
    datedReferences: array(snapshotReference),
    otherDateReferences: array(snapshotReference),
  }),
  lines: array(customsPlanLine),
  baseDutyScenario: record({
    status: choice("not_requested", "review_required", "partial", "calculated"),
    knownSubtotal: nullable(amount),
    unresolvedItemIds: array(string),
  }),
  handoff: record({
    status: choice("outside_scope", "domestic_review", "route_review", "missing_information", "available_for_review"),
    incoterm: nullable(choice("DAP", "DDP", "other")),
    transaction: shipmentSchema.properties.transaction,
    transport: shipmentSchema.properties.transport,
    regime: shipmentSchema.properties.regime,
    missingInputs: array(string),
    documents: array(record({
      code: choice(...customsDocumentCodes),
      stage: choice("shipment", "export", "import"),
      status: choice("provided", "prepare_for_review", "check_requirement"),
    })),
    requiresReview: { const: true },
  }),
  guidanceSources: array({ type: "object" }),
});
const tradePolicy = record({
  status: choice("blocked", "review_required", "pilot", "eligible_for_review", "out_of_scope"),
  pilotRoute: nullable(choice(...PILOT_ROUTES)),
  reasonCode: string,
  evidence: array({
    type: "object",
    additionalProperties: false,
    required: ["sourceId", "jurisdiction", "authority", "url"],
    properties: {
      sourceId: string,
      jurisdiction: choice("JP", "US"),
      authority: string,
      url: { type: "string", format: "uri" },
      effectiveFrom: date,
      effectiveThrough: date,
    },
  }),
  shippingAuthorized: { const: false },
});
const quoteEvidence = record({
  id: string,
  sourceUrl: { type: "string", format: "uri" },
  sourceType: choice("authority", "customs_broker", "carrier", "merchant"),
  destinationCountry: string,
  currency: string,
  reviewedOn: date,
  effectiveFrom: date,
  effectiveThrough: date,
  reviewBy: date,
});
const digest = { type: "string", pattern: "^[0-9a-f]{64}$" };
const pilotQuote = record({
  schemaVersion: { const: "1.0" },
  orderId: string,
  estimateId: string,
  requestDigest: digest,
  shipmentDigest: digest,
  ruleSetVersion: string,
  status: choice("blocked", "review_required", "out_of_scope", "estimated"),
  issuedOn: date,
  importDate: date,
  expiresAt: nullable({ type: "string", format: "date-time" }),
  currency: string,
  tradePolicy,
  deliveryTerms: nullable(choice("DAP", "DDP")),
  goodsSubtotal: nullable(amount),
  freight: nullable(amount),
  insurance: nullable(amount),
  charges: array(record({
    category: choice(...pilotChargeCategories),
    status: choice("confirmed", "not_applicable", "review_required"),
    amount: nullable(amount),
    timing: nullable(choice("checkout", "import")),
    payer: nullable(choice("buyer", "seller")),
    evidence: nullable(quoteEvidence),
    calculation: nullable({
      type: "object",
      additionalProperties: false,
      required: ["method"],
      properties: {
        method: choice("confirmed_amount", "ad_valorem", "not_applicable"),
        taxBase: amount,
        ratePercent: string,
        rounding: { const: "half_up_minor_unit" },
      },
    }),
  })),
  buyerAtCheckout: nullable(amount),
  buyerAtImport: nullable(amount),
  buyerTotal: nullable(amount),
  importChargesTotal: nullable(amount),
  estimate: nullable(invoiceReconciliationInputSchema.properties.estimate),
  findings: array({
    type: "object", additionalProperties: false, required: ["code"],
    properties: { code: string, category: choice(...pilotChargeCategories) },
  }),
  checkoutReady: { const: false },
  shippingAuthorized: { const: false },
  productionAuthorized: { const: false },
});
const releaseReadiness = record({
  version: { const: VERSION },
  status: { const: "pilot" },
  checkedOn: date,
  datasetVersion: string,
  registryDestinations: nonNegativeInteger,
  commercialExclusions: array(record({ country: { const: "KP" }, reasonCode: { const: "KP_COMMERCIAL_EXCLUDED" } })),
  routes: array(record({
    route: choice(...PILOT_ROUTES),
    from: choice("JP", "CN", "US"),
    to: choice("JP", "CN", "US"),
    checkout: choice("pending_live_validation", "validated"),
    customsHandoff: choice("pending_live_validation", "validated"),
    invoiceReconciliation: choice("pending_live_validation", "validated"),
    productionAuthorized: { const: false },
  })),
  productionVerifiedRouteCount: { type: "integer", minimum: 0, maximum: PILOT_ROUTES.length },
});
const doc = {
  openapi: "3.1.0",
  info: {
    title: "Veygrit Customs AI",
    version: VERSION,
    description:
      "Decision support. Country recognition is global; numeric coverage is explicitly scoped. No customs filing or shipping authorisation.",
  },
  servers: [{ url: "http://127.0.0.1:3008" }],
  security: [{ serviceBearer: [] }],
  paths: {
    "/health": {
      get: {
        security: [],
        summary: "Minimal health",
        responses: { 200: response("Healthy") },
      },
    },
    "/v1/countries": {
      get: {
        summary: "249 ISO country/territory entries",
        responses: { 200: response("Registry"), ...errors },
      },
    },
    "/v1/coverage": {
      get: {
        summary: "Explicit coverage and limitations",
        responses: { 200: response("Coverage"), ...errors },
      },
    },
    "/v1/sources": {
      get: {
        summary: "Primary and inherited source provenance",
        responses: { 200: response("Source catalogue"), ...errors },
      },
    },
    "/v1/tariffs/coverage": {
      get: {
        summary:
          "Tariff schedule and import tax measure coverage by destination",
        responses: { 200: response("Tariff coverage"), ...errors },
      },
    },
    "/v1/tariffs/coverage/wco": {
      get: {
        summary: "Coverage for the 187 WCO members and EU participation status",
        parameters: [
          {
            name: "date",
            in: "query",
            description:
              "Import date. Defaults to the current calendar date in Asia/Tokyo.",
            schema: { type: "string", format: "date" },
          },
        ],
        responses: {
          200: response("Dated tariff and source coverage by WCO member", {
            type: "object",
            required: [
              "referenceDate",
              "memberCount",
              "members",
              "affiliates",
              "allMemberTaxRatesComplete",
            ],
            properties: {
              referenceDate: { type: "string", format: "date" },
              memberCount: { type: "integer" },
              membersWithTariffReferences: { type: "integer" },
              membersWithTariffReferencesOnDate: { type: "integer" },
              membersWithTariffReferencesOtherDatesOnly: { type: "integer" },
              membersWithOfficialSources: { type: "integer" },
              membersWithOfficialSourcesOnly: { type: "integer" },
              membersWithMembershipOnly: { type: "integer" },
              membersWithImportMeasuresOnDate: { type: "integer" },
              membersWithVatOrGstMeasurePacksOnDate: { type: "integer" },
              allMemberTaxRatesComplete: { type: "boolean" },
              members: { type: "array", items: { $ref: "#/components/schemas/WcoParticipant" } },
              affiliates: { type: "array", items: { $ref: "#/components/schemas/WcoParticipant" } },
            },
          }),
          ...errors,
        },
      },
    },
    "/v1/tariffs/coverage/territories": {
      get: {
        summary: "Destinations outside the WCO roster and source-backed general duty policies",
        parameters: [{
          name: "date",
          in: "query",
          description: "Import date. Defaults to the current calendar date in Asia/Tokyo.",
          schema: { type: "string", format: "date" },
        }],
        responses: {
          200: response("Territory scope, source links and general duty policy", {
            type: "object",
            required: ["referenceDate", "nonMemberDestinations", "generalDutyPolicies"],
            properties: {
              referenceDate: { type: "string", format: "date" },
              nonMemberDestinationCount: { type: "integer" },
              nonMemberDestinationsWithTariffReferencesOnDate: { type: "integer" },
              nonMemberDestinationsWithOfficialSources: { type: "integer" },
              allNonMemberTaxRatesComplete: { type: "boolean" },
              nonMemberDestinations: { type: "array", items: { type: "object" } },
              generalDutyPolicies: { type: "array", items: generalDutyPolicy },
            },
          }),
          ...errors,
        },
      },
    },
    "/v1/coverage/destinations": {
      get: {
        summary: "Dated destination coverage for source links, tariff references and calculation rules",
        parameters: [{
          name: "date",
          in: "query",
          description: "Import date. Defaults to the current calendar date in Asia/Tokyo.",
          schema: { type: "string", format: "date" },
        }],
        responses: { 200: response("Destination coverage ledger", destinationCoverage), ...errors },
      },
    },
    "/v1/checkout/preview": post(
      "Preview checkout tax and import-stage amounts from a service-supplied shipment",
      { $ref: "#/components/schemas/Shipment" },
      checkoutPreview,
    ),
    "/v1/customs/plan": post(
      "Prepare worldwide customs review, dated tariff evidence and scoped base-duty scenarios",
      { $ref: "#/components/schemas/CustomsPlanRequest" },
      { $ref: "#/components/schemas/CustomsPlan" },
    ),
    "/v1/release-readiness": {
      get: {
        summary: "Pilot routes, commercial exclusions and live validation status",
        responses: { 200: response("Release readiness", releaseReadiness), ...errors },
      },
    },
    "/v1/pilot/quote": post(
      "Estimate pilot B2C landed costs using reviewed shipment and charge evidence",
      { $ref: "#/components/schemas/PilotQuoteRequest" },
      { $ref: "#/components/schemas/PilotQuote" },
    ),
    "/v1/worldwide/coverage": {
      get: {
        summary: "Count worldwide direction candidates and destination rollout passes",
        parameters: [{ name: "date", in: "query", schema: date }],
        responses: { 200: response("Worldwide direction and rollout coverage", worldDirectionCoverageOutputSchema), ...errors },
      },
    },
    "/v1/worldwide/direction": {
      get: {
        summary: "Look up one dispatch-to-destination direction and its public references",
        parameters: [
          { name: "originCountry", in: "query", required: true, schema: { type: "string", pattern: "^[A-Z]{2}$" } },
          { name: "destinationCountry", in: "query", required: true, schema: { type: "string", pattern: "^[A-Z]{2}$" } },
          ...(["originZone", "destinationZone", "originCustomsTerritory", "customsTerritory", "loadingCountry", "transitCountries"] as const).map((name) =>
            ({ name, in: "query", schema: worldDirectionInputSchema.properties[name] })),
          { name: "date", in: "query", schema: date },
        ],
        responses: { 200: response("Worldwide direction", worldDirectionOutputSchema), ...errors },
      },
    },
    "/v1/worldwide/quote": post(
      "Estimate reviewed ordinary cross-border B2C shipments across worldwide directions",
      { $ref: "#/components/schemas/WorldQuoteRequest" },
      { $ref: "#/components/schemas/PilotQuote" },
    ),
    "/v1/worldwide/reconcile": post(
      "Reconcile a worldwide import charge estimate and a clearance invoice",
      { $ref: "#/components/schemas/InvoiceReconciliationInput" },
      { $ref: "#/components/schemas/InvoiceReconciliation" },
    ),
    "/v1/pilot/reconcile": post(
      "Reconcile a stored import charge estimate and a clearance invoice",
      { $ref: "#/components/schemas/InvoiceReconciliationInput" },
      { $ref: "#/components/schemas/InvoiceReconciliation" },
    ),
    "/v1/import-settlement/coverage": {
      get: {
        summary: "Screen a directed standard courier route for settlement evidence and holds",
        description: "Assumes direct carriage with loading in the origin country. Shipment, tariff applicability and carrier billing require separate review.",
        parameters: [
          ...(["originCountry", "destinationCountry"] as const).map((name) =>
            ({ name, in: "query", required: true, schema: importSettlementCoverageInputSchema.properties[name] })),
          { name: "date", in: "query", description: "Import date. Defaults to today in Asia/Tokyo.", schema: date },
        ],
        responses: { 200: response("Directed settlement evidence screening", { $ref: "#/components/schemas/ImportSettlementCoverage" }), ...errors },
      },
    },
    "/v1/import-settlement/destinations": {
      get: {
        summary: "List evidence and holds for all inbound or outbound standard courier directions of one country",
        description: "Supply exactly one country parameter. Lists other scoped country and region codes. No shipment, billing or checkout approval is issued.",
        parameters: [
          { name: "originCountry", in: "query", description: "Anchor country for outbound directions. Mutually exclusive with destinationCountry.", schema: importSettlementCoverageInputSchema.properties.originCountry },
          { name: "destinationCountry", in: "query", description: "Anchor country for inbound directions. Mutually exclusive with originCountry.", schema: importSettlementCoverageInputSchema.properties.destinationCountry },
          { name: "date", in: "query", description: "Import date. Defaults to today in Asia/Tokyo.", schema: date },
        ],
        responses: { 200: response("Inbound or outbound settlement evidence screening", { $ref: "#/components/schemas/ImportSettlementDestinations" }), ...errors },
      },
    },
    "/v1/import-settlement/plan": post(
      "Check reviewed carrier-advance billing for a directed cross-border courier shipment",
      { $ref: "#/components/schemas/ImportSettlementPlanInput" },
      { $ref: "#/components/schemas/ImportSettlementPlan" },
    ),
    "/v1/import-settlement/reconcile": post(
      "Reconcile trusted remittance, invoice and payment evidence for a directed cross-border courier shipment",
      { $ref: "#/components/schemas/ImportSettlementReconciliationInput" },
      { $ref: "#/components/schemas/ImportSettlementReconciliation" },
    ),
    "/v1/import-settlement/ledger": post(
      "Reconcile parcel allocations, reassessments, refunds and reviewed settlement FX for one order",
      { $ref: "#/components/schemas/ImportSettlementLedgerInput" },
      { $ref: "#/components/schemas/ImportSettlementLedger" },
    ),
    "/v1/tariffs/evidence": {
      get: {
        summary: "Look up destination tariff sources and documented customs scope",
        parameters: [
          { name: "country", in: "query", required: true, schema: { type: "string", pattern: "^[A-Z]{2}$" } },
          { name: "date", in: "query", description: "Import date. Defaults to today in Asia/Tokyo.", schema: date },
        ],
        responses: {
          200: response("Destination evidence and review conditions", record({
            country: { type: "string", pattern: "^[A-Z]{2}$" },
            referenceDate: date,
            evidenceBasis: choice(...tariffEvidenceBases),
            sourceStatus: choice(...tariffSourceStatuses),
            customsScope: nullable(record({
              classification: choice(...customsScopeClassifications),
              noteJa: string, requiredChecks: array(string), checkedOn: date,
              sources: array(record({ id: string, authority: string, url: { type: "string", format: "uri" } })),
            })),
            directDownloads: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                required: ["id", "countries", "url", "authority", "scope", "note", "access", "format"],
                properties: {
                  id: string, countries: array(string), url: { type: "string", format: "uri" },
                  authority: string, scope: choice("national", "customs_union"), note: string,
                  access: { const: "download" }, format: choice(...documentFormats),
                  role: choice("base_schedule", "policy_notice", "policy_attachment"),
                  expected: string, group: string, rangeRecovery: { const: true },
                },
              },
            },
            references: {
              type: "array",
              items: {
                type: "object", required: ["url", "authority", "title", "kind", "scope", "classification"],
                properties: {
                  url: { type: "string", format: "uri" }, authority: string, title: string, kind: string, scope: string,
                  classification: choice("official_schedule_lookup", "other_official_reference"),
                },
              },
            },
            publishedTariffSnapshotIds: array(string),
            generalDutyPolicies: array(generalDutyPolicy),
            tariffEffectiveDateVerifiedByAcquisition: { const: false },
            shippingAuthorized: { const: false },
          })),
          ...errors,
        },
      },
    },
    "/v1/tariffs/lookup": post(
      "Look up tariff lines, HS6 candidates and additional tax measures",
      { $ref: "#/components/schemas/TariffLookup" },
      { $ref: "#/components/schemas/TariffLookupResult" },
    ),
    "/v1/assess": post(
      "Assess structured tax-exclusive shipment",
      { $ref: "#/components/schemas/Shipment" },
      assessment,
    ),
    "/v1/ask": post("Retrieve multilingual reviewed evidence", {
      $ref: "#/components/schemas/Ask",
    }),
    "/v1/classify": post(
      "Product attribute and restriction triage; does not assign HS",
      classifySchema,
    ),
    "/v1/classification/propose": post(
      "Suggest source-backed HS candidates and questions; does not confirm a classification",
      { $ref: "#/components/schemas/ClassificationRequest" },
      { $ref: "#/components/schemas/ClassificationProposal" },
    ),
    "/v1/classification/assign": post(
      "Reuse a current server-reviewed classification for the exact merchant SKU and product revision",
      { $ref: "#/components/schemas/ClassificationRequest" },
      { $ref: "#/components/schemas/ClassificationAssignment" },
    ),
    "/v1/classification/batch": post(
      "Classify a bounded single-merchant product batch with protected approval history",
      { $ref: "#/components/schemas/ClassificationBatchInput" },
      { $ref: "#/components/schemas/ClassificationBatch" },
    ),
    "/v1/classification/rollout": {
      get: { summary: "Track all destinations, missing official evidence and selected product examples in resumable geographic batches",
        parameters: Object.entries(classificationRolloutInputSchema.properties).map(([name, schema]) => ({ name, in: "query", schema })),
        responses: { 200: response("Classification evidence rollout; discovery links do not verify classification",
          { $ref: "#/components/schemas/ClassificationRollout" }), ...errors } },
    },
    "/v1/classification/coverage": {
      get: { summary: "Describe loaded classification catalog coverage without claiming universal classification",
        responses: { 200: response("Loaded catalog scope", record({
          catalogVersion: string, catalogDigest: string, sourceCount: { type: "integer" },
          ruleCount: { type: "integer" }, nationalCodeRuleCount: { type: "integer" },
          countries: array(string), directions: array(choice("import", "export", "both")), hsEditions: array(string),
          assignmentRequiresRecordedReview: { const: true }, shippingAuthorized: { const: false }, productionAuthorized: { const: false },
        })), ...errors } },
    },
    "/v1/classification/sources": {
      get: { summary: "Resolve classification evidence IDs to scoped sources and review dates",
        parameters: [
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, maximum: 999999, default: 0 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ], responses: { 200: response("Classification evidence sources", record({
          catalogVersion: string, catalogDigest: string,
          sources: { type: "array", items: classificationSourceSchema },
          total: { type: "integer", minimum: 0 }, nextOffset: { type: ["integer", "null"], minimum: 0 },
        })), ...errors } },
    },
  },
  components: {
    securitySchemes: { serviceBearer: { type: "http", scheme: "bearer" } },
    schemas: {
      ClassificationRequest: classificationRequestSchema,
      ClassificationRollout: classificationRolloutOutputSchema,
      ClassificationProposal: classificationProposalSchema,
      ClassificationAssignment: classificationAssignmentSchema,
      ClassificationBatchInput: classificationBatchInputSchema,
      ClassificationBatch: classificationBatchOutputSchema,
      WcoParticipant: {
        type: "object",
        required: ["memberId", "membershipStatus", "status", "lookupDestinations", "tariffReferences", "officialSources"],
        properties: {
          memberId: { type: "string", pattern: "^[A-Z]{2}$" },
          iso2: { type: ["string", "null"] },
          name: { type: "string" },
          nameJa: { type: "string" },
          membershipStatus: { enum: ["member", "akin_to_wco_membership"] },
          status: {
            enum: [
              "tariff_reference_on_date",
              "tariff_reference_other_date",
              "official_sources_only",
              "membership_only",
            ],
          },
          lookupDestinations: { type: "array", items: { type: "string" } },
          tariffReferences: { type: "array", items: { type: "object" } },
          officialSources: { type: "array", items: { type: "object" } },
          measureSnapshotIdsOnDate: { type: "array", items: { type: "string" } },
          measureChargesOnDate: { type: "array", items: { type: "string" } },
        },
      },
      Shipment: shipmentSchema,
      CustomsPlanRequest: {
        ...customsPlanSchema,
        properties: { ...customsPlanSchema.properties, shipment: { $ref: "#/components/schemas/Shipment" } },
      },
      CustomsPlan: customsPlan,
      PilotQuoteRequest: pilotQuoteInputSchema,
      WorldQuoteRequest: worldQuoteInputSchema,
      PilotQuote: pilotQuote,
      InvoiceReconciliationInput: invoiceReconciliationInputSchema,
      InvoiceReconciliation: invoiceReconciliationOutputSchema,
      ImportSettlementPlanInput: importSettlementPlanInputSchema,
      ImportSettlementPlan: importSettlementPlanOutputSchema,
      ImportSettlementCoverage: importSettlementCoverageOutputSchema,
      ImportSettlementDestinations: importSettlementDestinationsOutputSchema,
      ImportSettlementReconciliationInput: importSettlementReconciliationInputSchema,
      ImportSettlementReconciliation: importSettlementReconciliationOutputSchema,
      ImportSettlementLedgerInput: importSettlementLedgerInputSchema,
      ImportSettlementLedger: importSettlementLedgerOutputSchema,
      Ask: askSchema,
      Assessment: assessment,
      TariffLookup: tariffLookupSchema,
      TariffLookupResult: tariffLookupResult,
    },
  },
};
writeFileSync(
  new URL("../docs/openapi.json", import.meta.url),
  JSON.stringify(doc, null, 2) + "\n",
);
console.log("Generated docs/openapi.json from runtime input schemas.");
