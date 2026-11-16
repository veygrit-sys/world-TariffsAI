import type { TradeBlocReference } from "./trade-blocs.ts";
import type { TransitRoute } from "./transit-route.ts";
import type { SpecialProcedureReference } from "./special-procedures.ts";
import type { SpecialTerritoryReference } from "./special-territories.ts";
import type { ImportControlReference } from "./import-controls.ts";
import type { CustomsFeeReference } from "./customs-fees.ts";
import type { RegionalCustomsProfile } from "./regional-customs.ts";
import type { DestinationCustomsProfile, TariffLookupResult } from "./tariffs.ts";

export type Locale = "ja" | "en" | "zh";
export type GoodsType =
  | "ordinary"
  | "alcohol"
  | "tobacco"
  | "food"
  | "medicine"
  | "cosmetics"
  | "battery"
  | "plant"
  | "animal"
  | "dual_use"
  | "unknown";
export interface Item {
  id: string;
  description: string;
  quantity: number;
  unitValue: string;
  originCountry: string;
  goodsType: GoodsType;
  hs6?: string;
  classificationConfirmed?: boolean;
  standardTaxConfirmed?: boolean;
  nonDutiableConfirmed?: boolean;
  japanReliefEligibility?: "eligible" | "ineligible" | "unreviewed";
  productIdentifier?: string;
}
export interface Shipment {
  originCountry: string;
  destinationCountry: string;
  /** Country or territory where the goods were loaded for the relevant import. */
  loadingCountry?: string;
  /** Intermediate stops in travel order, with reported customs treatment. */
  transitRoute?: TransitRoute;
  originZone: "standard" | "special" | "unknown";
  destinationZone: "standard" | "special" | "unknown";
  importDate: string;
  locale?: Locale;
  currency: string;
  freight: string;
  insurance: string;
  items: Item[];
  transaction: "b2c_sale" | "b2b_sale" | "private_gift" | "return" | "sample";
  channel: "direct" | "marketplace";
  transport: "air" | "post" | "sea" | "land" | "courier_unspecified";
  regime: "standard" | "ioss" | "cn_9610" | "cn_1210" | "unknown";
  inventoryStatus: "free_circulation" | "bonded" | "unknown";
  sellerTaxRegistration: "registered" | "not_registered" | "unknown";
  consignmentScopeConfirmed: boolean;
  incoterm?: "DAP" | "DDP" | "other";
  customsValue?: string;
  customsValueConfirmed?: boolean;
  taxEvidenceConfirmed?: boolean;
  /** Number of items in the customs declaration, confirmed by the declarant. */
  euDeclaration?: { itemCount: number; countConfirmed: true; flatDutyTreatmentConfirmed?: boolean };
  china?: {
    positiveListConfirmed: boolean;
    identityEvidenceConfirmed: boolean;
    electronicRecordsConfirmed: boolean;
    annualRemaining: string;
  };
  veygrit?: {
    merchantId: string;
    orderId: string;
    cartVersion: string;
    addressTokenRef: string;
    addressVersion: string;
    grantRef: string;
  };
}

export const customsDocumentCodes = [
  "COMMERCIAL_INVOICE",
  "VALUE_EVIDENCE",
  "PACKING_LIST",
  "TRANSPORT_DOCUMENT",
  "EXPORT_DECLARATION",
  "IMPORT_DECLARATION",
  "POSTAL_CUSTOMS_DECLARATION",
  "ORIGIN_EVIDENCE",
  "PREFERENCE_EVIDENCE",
  "PERMIT_OR_CERTIFICATE",
  "IMPORT_PERMIT",
  "BIOSECURITY_IMPORT_PERMIT",
  "PHYTOSANITARY_CERTIFICATE",
  "VETERINARY_HEALTH_CERTIFICATE",
  "PRODUCT_COMPLIANCE_CERTIFICATE",
  "PACKING_DECLARATION",
  "QUARANTINE_DECLARATION",
  "BIOSECURITY_CLEARANCE",
  "RETURN_EVIDENCE",
  "PRODUCT_IDENTIFIER_EVIDENCE",
  "IOSS_SECURE_HANDOFF_REFERENCE",
  "IDENTITY_VERIFIED_REFERENCE",
  "ORDER_PAYMENT_LOGISTICS_EVIDENCE",
  "POSITIVE_LIST_EVIDENCE",
] as const;

export type CustomsDocumentCode = (typeof customsDocumentCodes)[number];
export type BaseDutyTreatment = "mfn" | "general" | "zero_duty_policy";

export interface CustomsPlanLineInput {
  itemId: string;
  tariffCode?: string;
  /** Confirmed line value, including its quantity and applicable valuation adjustments. */
  customsValue?: string;
  /** Verified gross assessment weight of this line, including the applicable packaging. */
  grossWeightKg?: string;
  rateTreatment?: BaseDutyTreatment;
  /** Selects a treaty for documentary review of this item. */
  preferenceAgreement?: string;
}

export interface CustomsPlanRequest {
  shipment: Shipment;
  originCustomsTerritory?: string;
  customsTerritory?: string;
  lines?: CustomsPlanLineInput[];
  availableDocuments?: CustomsDocumentCode[];
}
export interface Country {
  code: string;
  alpha3: string;
  name: string;
  nameJa: string;
  inScope: boolean;
  researchProfile: string | null;
}
export interface SupplementalRegion {
  code: string;
  name: string;
  nameJa: string;
  inScope: boolean;
  codeScheme: "user_assigned";
  note: string;
}
export interface Source {
  id: string;
  title: string;
  url: string;
  verification: "primary_rechecked" | "inherited_research";
  checkedOn: string;
  reviewBy: string;
}
export interface Card {
  id: string;
  countries: string[];
  topics: string[];
  title: string;
  text: Record<Locale, string>;
  sourceIds: string[];
  verification: Source["verification"];
  validFrom: string | null;
  validTo: string | null;
}
export interface Rule {
  id: string;
  currency: string;
  threshold: string;
  vatBps?: number;
  flatDuty?: string;
  validFrom: string;
  validTo: string | null;
  checkedOn: string;
  reviewBy: string;
  sourceIds: string[];
}
export interface Dataset {
  version: string;
  countries: Country[];
  supplementalRegions: SupplementalRegion[];
  sources: Source[];
  cards: Card[];
  rules: Rule[];
  regionalCustoms?: Readonly<Record<string, RegionalCustomsProfile>>;
  customsFeeReferences?: readonly CustomsFeeReference[];
  importControlReferences?: readonly ImportControlReference[];
  specialProcedureReferences?: readonly SpecialProcedureReference[];
  tradeBlocs?: readonly TradeBlocReference[];
  specialTerritoryReferences?: readonly SpecialTerritoryReference[];
}
export interface Amount {
  currency: string;
  value: string;
}
export interface Charge {
  kind: "customs_duty" | "sales_vat_gst" | "import_vat_gst";
  amount: Amount;
  collection: "checkout" | "import" | "not_applicable";
  ruleId: string;
  sourceIds: string[];
  basis: string;
  rounding: "half_up_per_consignment" | "exact";
}
export interface Finding {
  code: string;
  severity: "info" | "review" | "blocked";
  message: string;
}
export interface Assessment {
  schemaVersion: string;
  ruleSetVersion: string;
  requestDigest: string;
  assessedAt: string;
  expiresAt: string;
  importDate: string;
  route: "domestic" | "eu_intra_union" | "cross_border" | "unresolved";
  status: "partial_estimate" | "needs_review" | "out_of_scope";
  shippingAuthorized: false;
  checkoutReady: false;
  findings: Finding[];
  charges: Charge[];
  unknownCharges: string[];
  estimatedTaxSubtotal: Amount | null;
  landedCostTotal: null;
  documents: string[];
  sourceIds: string[];
  sources: Source[];
  questions: string[];
}
export interface AskRequest {
  question: string;
  locale?: Locale;
  originCountry?: string;
  destinationCountry?: string;
  importDate?: string;
  tariffCode?: string;
  destinationZone?: Shipment["destinationZone"];
  customsTerritory?: string;
}
export interface Evidence {
  id: string;
  title: string;
  text: string;
  verification: Source["verification"];
  expired: boolean;
  sourceIds: string[];
}
export interface Answer {
  engine: "local_retrieval" | "ollama_evidence_selection";
  locale: Locale;
  summary: string;
  evidence: Evidence[];
  sources: Source[];
  requiresReview: true;
  modelFallback?: boolean;
  followUpQuestions: string[];
  numericQuote: null;
  tariffReference?: TariffLookupResult;
  destinationCustomsProfile?: DestinationCustomsProfile;
}
export interface EvidenceSelector {
  select(input: {
    intent: string;
    locale: Locale;
    evidence: Evidence[];
  }): Promise<string[]>;
}
