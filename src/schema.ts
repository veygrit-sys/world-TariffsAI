import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { transitRouteSchema } from "./transit-route.ts";
import { specialTerritorySelectorSchema } from "./special-territories.ts";
import { customsDocumentCodes, type Shipment, type AskRequest, type CustomsPlanLineInput, type CustomsPlanRequest } from "./types.ts";
import type { TariffLookupRequest } from "./tariffs.ts";

const money = { type: "string", pattern: "^(0|[1-9]\\d{0,11})(\\.\\d{1,4})?$" };
const country = { type: "string", pattern: "^[A-Z]{2}$" };
const tariffCode = { type: "string", pattern: "^[0-9][0-9. -]{4,22}[0-9]$" };
const opaque = {
  type: "string",
  minLength: 1,
  maxLength: 100,
  pattern: "^[A-Za-z0-9_.:-]+$",
};
const locale = { type: "string", enum: ["ja", "en", "zh"] };
const choice = (...values: string[]) => ({ type: "string", enum: values });
const object = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
export const shipmentSchema = {
  $id: "https://veygrit.example/schemas/shipment.json",
  ...object(
    {
      originCountry: country,
      destinationCountry: country,
      loadingCountry: country,
      transitRoute: transitRouteSchema,
      originZone: choice("standard", "special", "unknown"),
      destinationZone: choice("standard", "special", "unknown"),
      importDate: { type: "string", format: "date" },
      locale,
      currency: { type: "string", pattern: "^[A-Z]{3}$" },
      freight: money,
      insurance: money,
      items: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: object(
          {
            id: opaque,
            description: { type: "string", minLength: 1, maxLength: 300 },
            quantity: { type: "integer", minimum: 1, maximum: 10000 },
            unitValue: money,
            originCountry: country,
            goodsType: choice(
              "ordinary",
              "alcohol",
              "tobacco",
              "food",
              "medicine",
              "cosmetics",
              "battery",
              "plant",
              "animal",
              "dual_use",
              "unknown",
            ),
            hs6: { type: "string", pattern: "^\\d{6}$" },
            classificationConfirmed: { type: "boolean" },
            standardTaxConfirmed: { type: "boolean" },
            nonDutiableConfirmed: { type: "boolean" },
            japanReliefEligibility: choice(
              "eligible",
              "ineligible",
              "unreviewed",
            ),
            productIdentifier: opaque,
          },
          [
            "id",
            "description",
            "quantity",
            "unitValue",
            "originCountry",
            "goodsType",
          ],
        ),
      },
      transaction: choice(
        "b2c_sale",
        "b2b_sale",
        "private_gift",
        "return",
        "sample",
      ),
      channel: choice("direct", "marketplace"),
      transport: choice("air", "post", "sea", "land", "courier_unspecified"),
      regime: choice("standard", "ioss", "cn_9610", "cn_1210", "unknown"),
      inventoryStatus: choice("free_circulation", "bonded", "unknown"),
      sellerTaxRegistration: choice("registered", "not_registered", "unknown"),
      consignmentScopeConfirmed: { type: "boolean" },
      japanDeclaration: {
        type: "object", additionalProperties: false,
        properties: { singleLineConfirmed: { type: "boolean" }, dutySchedule: choice("ordinary", "ordinary_elected") },
        required: ["singleLineConfirmed", "dutySchedule"],
      },
      incoterm: choice("DAP", "DDP", "other"),
      customsValue: money,
      customsValueConfirmed: { type: "boolean" },
      taxEvidenceConfirmed: { type: "boolean" },
      euDeclaration: object({
        itemCount: { type: "integer", minimum: 1, maximum: 10000 },
        countConfirmed: { const: true },
        flatDutyTreatmentConfirmed: { type: "boolean" },
      }, ["itemCount", "countConfirmed"]),
      china: object(
        {
          positiveListConfirmed: { type: "boolean" },
          identityEvidenceConfirmed: { type: "boolean" },
          electronicRecordsConfirmed: { type: "boolean" },
          annualRemaining: money,
        },
        [
          "positiveListConfirmed",
          "identityEvidenceConfirmed",
          "electronicRecordsConfirmed",
          "annualRemaining",
        ],
      ),
      veygrit: object(
        {
          merchantId: opaque,
          orderId: opaque,
          cartVersion: opaque,
          addressTokenRef: opaque,
          addressVersion: opaque,
          grantRef: opaque,
        },
        [
          "merchantId",
          "orderId",
          "cartVersion",
          "addressTokenRef",
          "addressVersion",
          "grantRef",
        ],
      ),
    },
    [
      "originCountry",
      "destinationCountry",
      "originZone",
      "destinationZone",
      "importDate",
      "currency",
      "freight",
      "insurance",
      "items",
      "transaction",
      "channel",
      "transport",
      "regime",
      "inventoryStatus",
      "sellerTaxRegistration",
      "consignmentScopeConfirmed",
    ],
  ),
};
export const askSchema = {
  $id: "https://veygrit.example/schemas/ask.json",
  ...object(
    {
      question: { type: "string", minLength: 1, maxLength: 2000 },
      locale,
      originCountry: country,
      destinationCountry: country,
      importDate: { type: "string", format: "date" },
      tariffCode,
      destinationZone: choice("standard", "special", "unknown"),
      customsTerritory: { type: "string", pattern: "^[A-Z][A-Z0-9_-]{1,23}$" },
    },
    ["question"],
  ),
};
export const tariffLookupSchema = object(
  {
    destinationCountry: country,
    code: tariffCode,
    originCountry: country,
    date: { type: "string", format: "date" },
    zone: choice("standard", "special", "unknown"),
    customsTerritory: { type: "string", pattern: "^[A-Z][A-Z0-9_-]{1,23}$" },
    snapshotId: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,79}$" },
    offset: { type: "integer", minimum: 0, maximum: 200000 },
    limit: { type: "integer", minimum: 1, maximum: 50 },
    measureOffset: { type: "integer", minimum: 0, maximum: 200000 },
    measureLimit: { type: "integer", minimum: 1, maximum: 50 },
  },
  ["destinationCountry", "code"],
);
export const classifySchema = {
  ...object(
    { description: { type: "string", minLength: 1, maxLength: 1000 }, locale },
    ["description"],
  ),
};
export const customsTerritorySelectorSchema = specialTerritorySelectorSchema;

export const customsPlanSchema = object(
  {
    shipment: { $ref: shipmentSchema.$id },
    originCustomsTerritory: customsTerritorySelectorSchema,
    customsTerritory: customsTerritorySelectorSchema,
    lines: {
      type: "array",
      maxItems: 100,
      items: object({
        itemId: opaque,
        tariffCode,
        customsValue: money,
        grossWeightKg: { type: "string", pattern: "^(0|[1-9]\\d{0,8})(\\.\\d{1,3})?$" },
        rateTreatment: choice("mfn", "general", "zero_duty_policy"),
        preferenceAgreement: { type: "string", pattern: "^[a-z][a-z0-9_]{2,79}$" },
      }, ["itemId"]),
    },
    availableDocuments: {
      type: "array",
      uniqueItems: true,
      maxItems: customsDocumentCodes.length,
      items: choice(...customsDocumentCodes),
    },
  },
  ["shipment"],
);
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  removeAdditional: false,
});
// The package exposes a CJS-compatible function under NodeNext.
const addFormats = addFormatsModule as unknown as (instance: Ajv) => void;
addFormats(ajv);
const shipmentValidator = ajv.compile<Shipment>(shipmentSchema);
const customsPlanValidator = ajv.compile<CustomsPlanRequest>(customsPlanSchema);
const askValidator = ajv.compile<AskRequest>(askSchema);
const tariffLookupValidator =
  ajv.compile<TariffLookupRequest>(tariffLookupSchema);
const classifyValidator = ajv.compile<{
  description: string;
  locale?: "ja" | "en" | "zh";
}>(classifySchema);
export class InputError extends Error {
  issues: { path: string; code: string }[];
  constructor(issues: { path: string; code: string }[]) {
    super("INVALID_INPUT");
    this.name = "InputError";
    this.issues = issues;
  }
}
function checked<T>(
  validator: import("ajv").ValidateFunction<T>,
  value: unknown,
): T {
  if (!validator(value))
    throw new InputError(
      (validator.errors ?? [])
        .slice(0, 20)
        .map((e) => ({ path: e.instancePath, code: e.keyword })),
    );
  return value;
}
export const parseShipment = (value: unknown): Shipment =>
  checked(shipmentValidator, value);
export const parseCustomsPlan = (value: unknown): CustomsPlanRequest =>
  checked(customsPlanValidator, value);
export const parseAsk = (value: unknown): AskRequest =>
  checked(askValidator, value);
export const parseTariffLookup = (value: unknown): TariffLookupRequest =>
  checked(tariffLookupValidator, value);
export const parseClassify = (value: unknown) =>
  checked(classifyValidator, value);

export function checkCustomsPlanLines(input: CustomsPlanRequest): Map<string, CustomsPlanLineInput> {
  const items = new Map(input.shipment.items.map((item) => [item.id, item]));
  const lines = new Map<string, CustomsPlanLineInput>();
  for (const [index, line] of (input.lines ?? []).entries()) {
    const item = items.get(line.itemId);
    const path = "/lines/" + index;
    if (!item || lines.has(line.itemId))
      throw new InputError([{ path: path + "/itemId", code: item ? "DUPLICATE_ITEM_ID" : "UNKNOWN_ITEM_ID" }]);
    if (line.preferenceAgreement && line.rateTreatment)
      throw new InputError([{ path: path + "/rateTreatment", code: "CONFLICTING_DUTY_TREATMENTS" }]);
    const code = line.tariffCode?.replace(/[. -]/g, "");
    if (code !== undefined && !/^\d{6,12}$/.test(code))
      throw new InputError([{ path: path + "/tariffCode", code: "INVALID_TARIFF_CODE" }]);
    if (code && item.hs6 && !code.startsWith(item.hs6))
      throw new InputError([{ path: path + "/tariffCode", code: "HS6_MISMATCH" }]);
    lines.set(line.itemId, code === undefined ? line : { ...line, tariffCode: code });
  }
  return lines;
}
