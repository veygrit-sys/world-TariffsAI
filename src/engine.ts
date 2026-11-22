import { createHash } from "node:crypto";
import type {
  Assessment,
  Dataset,
  Shipment,
  Rule,
  Locale,
  Charge,
} from "./types.ts";
import { currentRule, sourcesCurrent } from "./dataset.ts";
import { parseShipment, InputError } from "./schema.ts";
import { minor, money, tax } from "./money.ts";
import { message } from "./messages.ts";
import { reviewSpecialTerritories } from "./special-territories.ts";
import { requiresTradeBlocReview } from "./trade-blocs.ts";
import { reviewTransitRoute } from "./transit-route.ts";
import { assessTradePolicy, northKoreaBlockReason } from "./trade-policy.ts";

export const EU_COUNTRIES = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(
    " ",
  ),
);
// EU customs, VAT and excise territories have different boundaries.
const territoriesWithSeparateTreatment = new Set([
  "AX", "GF", "GI", "GP", "MC", "MF", "MQ", "RE", "SM", "YT",
  // Australian Customs Notice 2026/11 and DAFF external territory conditions.
  "CC", "CX", "NF", "HM",
]);
const sharedCustomsTerritories = [
  ["GB", new Set(["GG", "IM", "JE"])],
  ["AD", EU_COUNTRIES],
  ["CH", new Set(["LI"])],
  // 19 CFR 101.1 includes Puerto Rico in the United States customs territory.
  ["US", new Set(["PR"])],
] as const;

// Intra-area routes can require proof of circulation, origin and destination-specific controls.
const commonExternalTariffGroups = [
  new Set(["AM", "BY", "KG", "KZ", "RU"]), // EAEU Treaty, Article 25.
  new Set(["BW", "LS", "NA", "SZ", "ZA"]), // SACU Agreement, Articles 18–19.
  new Set(["AE", "BH", "KW", "OM", "QA", "SA"]), // GCC customs union.
];

export function requiresCustomsTerritoryReview(originCountry: string, destinationCountry: string): boolean {
  return originCountry !== destinationCountry && (
    territoriesWithSeparateTreatment.has(originCountry) ||
    territoriesWithSeparateTreatment.has(destinationCountry) ||
    commonExternalTariffGroups.some((group) => group.has(originCountry) && group.has(destinationCountry)) ||
    sharedCustomsTerritories.some(([country, partners]) =>
      (originCountry === country && partners.has(destinationCountry)) ||
      (destinationCountry === country && partners.has(originCountry)))
  );
}

const nationalCalculationRules: Readonly<Record<string, string>> = {
  GB: "GB_LOW_VALUE",
  SG: "SG_LOW_VALUE",
  JP: "JP_LOW_VALUE",
  AU: "AU_LOW_VALUE_POST",
  NZ: "NZ_LOW_VALUE",
};

export function calculationRuleId(destinationCountry: string): string | undefined {
  return EU_COUNTRIES.has(destinationCountry)
    ? "EU_TEMP_LOW_VALUE"
    : nationalCalculationRules[destinationCountry];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

export function requestDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export function assess(
  input: unknown,
  data: Dataset,
  now = new Date(),
): Assessment {
  const s: Shipment = parseShipment(input),
    locale: Locale = s.locale ?? "ja";
  const countries = new Map<string, { inScope: boolean }>(
    [...data.countries, ...data.supplementalRegions].map((c) => [c.code, c]),
  );
  const transitCountries = s.transitRoute?.stops.map(({ country }) => country) ?? [];
  const countryCodes = [
    s.originCountry,
    s.destinationCountry,
    ...(s.loadingCountry ? [s.loadingCountry] : []),
    ...transitCountries,
    ...s.items.map((i) => i.originCountry),
  ];
  for (const code of countryCodes)
    if (!countries.has(code))
      throw new InputError([{ path: "/country", code: "UNKNOWN_COUNTRY" }]);
  if (new Set(s.items.map((i) => i.id)).size !== s.items.length)
    throw new InputError([{ path: "/items", code: "DUPLICATE_ITEM_ID" }]);
  let goods: bigint,
    freight: bigint,
    insurance: bigint,
    customs: bigint | undefined;
  try {
    goods = s.items.reduce(
      (a, i) => a + minor(i.unitValue, s.currency) * BigInt(i.quantity),
      0n,
    );
    freight = minor(s.freight, s.currency);
    insurance = minor(s.insurance, s.currency);
    customs =
      s.customsValue === undefined
        ? undefined
        : minor(s.customsValue, s.currency);
    if (s.china) minor(s.china.annualRemaining, s.currency);
    if (goods + freight + insurance > 999999999999999n)
      throw new RangeError("VALUE_LIMIT");
  } catch {
    throw new InputError([
      { path: "/money", code: "INVALID_AMOUNT_OR_CURRENCY" },
    ]);
  }
  const cif = goods + freight + insurance;
  const result: Assessment = {
    schemaVersion: "1.0",
    ruleSetVersion: data.version,
    requestDigest: requestDigest(s),
    assessedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    importDate: s.importDate,
    route: "unresolved",
    status: "needs_review",
    shippingAuthorized: false,
    checkoutReady: false,
    findings: [],
    charges: [],
    unknownCharges: [
      "customs_duty",
      "sales_vat_gst",
      "import_vat_gst",
      "excise",
      "trade_remedies",
      "brokerage",
      "handling",
    ],
    estimatedTaxSubtotal: null,
    landedCostTotal: null,
    documents: ["COMMERCIAL_INVOICE", "PACKING_LIST", "TRANSPORT_DOCUMENT"],
    sourceIds: [],
    sources: [],
    questions: [],
  };
  const note = (
    code: string,
    severity: "info" | "review" | "blocked" = "review",
  ) => {
    if (!result.findings.some((f) => f.code === code))
      result.findings.push({ code, severity, message: message(code, locale) });
  };
  const cite = (...ids: string[]) => {
    result.sourceIds.push(...ids);
  };
  const add = (
    kind: Charge["kind"],
    amount: bigint,
    collection: Charge["collection"],
    r: Rule,
    basis: string,
    rounding: Charge["rounding"] = "exact",
  ) => {
    result.charges.push({
      kind,
      amount: money(amount, s.currency),
      collection,
      ruleId: r.id,
      sourceIds: [...r.sourceIds],
      basis,
      rounding,
    });
    result.unknownCharges = result.unknownCharges.filter((c) => c !== kind);
  };
  const finish = (): Assessment => {
    result.sourceIds = [...new Set(result.sourceIds)];
    result.sources = data.sources.filter((source) =>
      result.sourceIds.includes(source.id),
    );
    result.documents = [...new Set(result.documents)];
    result.questions = result.findings
      .filter((f) => f.severity !== "info")
      .map((f) => f.message);
    if (result.charges.length && result.status !== "out_of_scope") {
      result.status = "partial_estimate";
      result.estimatedTaxSubtotal = money(
        result.charges.reduce(
          (n, c) => n + minor(c.amount.value, s.currency),
          0n,
        ),
        s.currency,
      );
    }
    note("UNKNOWN_TOTAL", "info");
    return result;
  };
  const rule = (id: string): Rule | null => {
    const r = currentRule(data, id, s.importDate, now);
    if (!r) {
      note("RULE_NOT_CURRENT");
      return null;
    }
    cite(...r.sourceIds);
    // Cap cache lifetime at the first review or legal boundary (JST midnight).
    const limit = [
      r.reviewBy,
      ...r.sourceIds.map(
        (id) => data.sources.find((x) => x.id === id)!.reviewBy,
      ),
    ].sort()[0]!;
    const reviewEnd = Date.parse(limit + "T23:59:59+09:00");
    const legalEnd = r.validTo
      ? Date.parse(r.validTo + "T00:00:00+09:00")
      : Infinity;
    result.expiresAt = new Date(
      Math.min(Date.parse(result.expiresAt), reviewEnd, legalEnd),
    ).toISOString();
    if (s.currency !== r.currency) {
      note("CURRENCY_CONVERSION_REQUIRED");
      return null;
    }
    return r;
  };
  const standardTax = () => {
    if (!s.items.every((i) => i.standardTaxConfirmed === true)) {
      note("STANDARD_TAX_REQUIRED");
      return false;
    }
    return true;
  };
  const registered = () => {
    if (s.sellerTaxRegistration !== "registered") {
      note("SELLER_TAX_REQUIRED");
      return false;
    }
    return true;
  };
  note("ROUTE_RELEASE_REQUIRED");
  note("RESTRICTIONS_REVIEW");
  if (s.veygrit) note("GRANT_RECHECK_REQUIRED");
  const kpBlock = northKoreaBlockReason({
    dispatchCountry: s.originCountry,
    destinationCountry: s.destinationCountry,
    productOriginCountries: s.items.map((item) => item.originCountry),
    ...(s.loadingCountry ? { loadingCountry: s.loadingCountry } : {}),
  });
  if (kpBlock) {
    cite("primary-jp-kp-trade");
    note(kpBlock, "blocked");
    result.status = "out_of_scope";
    return finish();
  }
  if (countryCodes.some((c) => countries.get(c)?.inScope === false)) {
    note("ANTARCTICA_OUT_OF_SCOPE", "blocked");
    result.status = "out_of_scope";
    return finish();
  }
  const transitReview = reviewTransitRoute(s.transitRoute, s.originCountry, s.loadingCountry);
  if (transitCountries.length) {
    const trade = assessTradePolicy({
      dispatchCountry: s.originCountry, destinationCountry: s.destinationCountry,
      productOriginCountries: s.items.map(({ originCountry }) => originCountry), transitCountries,
      ...(s.loadingCountry ? { loadingCountry: s.loadingCountry } : {}),
    }, "worldwide");
    if (trade.status === "review_required" || trade.status === "blocked") {
      note("TRANSIT_TRADE_REVIEW");
      return finish();
    }
  }
  if (transitReview.requiresReview || (transitCountries.length > 0 &&
      (s.originCountry === s.destinationCountry || (EU_COUNTRIES.has(s.originCountry) &&
        EU_COUNTRIES.has(s.destinationCountry) && transitCountries.some((country) => !EU_COUNTRIES.has(country)))))) {
    note("TRANSIT_CUSTOMS_REVIEW");
    return finish();
  }
  if (requiresTradeBlocReview(data, s.originCountry, s.destinationCountry)) {
    note("TRADE_BLOC_REVIEW");
    return finish();
  }
  if (s.originZone !== "standard" || s.destinationZone !== "standard" ||
      requiresCustomsTerritoryReview(s.originCountry, s.destinationCountry) ||
      reviewSpecialTerritories(data, s, s.importDate).requiresRouteReview) {
    note("ZONE_UNRESOLVED");
    return finish();
  }
  result.route =
    s.originCountry === s.destinationCountry
      ? "domestic"
      : EU_COUNTRIES.has(s.originCountry) &&
          EU_COUNTRIES.has(s.destinationCountry)
        ? "eu_intra_union"
        : "cross_border";
  const bondedChinaRetail = s.destinationCountry === "CN" && s.regime === "cn_1210" && s.inventoryStatus === "bonded";
  if (s.inventoryStatus !== "free_circulation" && !bondedChinaRetail) {
    note("INVENTORY_REVIEW");
    return finish();
  }
  if (result.route === "domestic") {
    note("DOMESTIC_REVIEW");
    return finish();
  }
  if (result.route === "eu_intra_union") {
    note("EU_INTRA_REVIEW");
    return finish();
  }
  note("EXPORT_REVIEW");
  note("FTA_REVIEW");
  if (!s.consignmentScopeConfirmed) {
    note("AGGREGATION_REQUIRED");
    return finish();
  }
  if (s.transaction !== "b2c_sale") {
    note("TRANSACTION_REVIEW");
    return finish();
  }
  if (!s.items.every((i) => i.goodsType === "ordinary")) {
    note("REGULATED_GOODS");
    return finish();
  }
  const destinationRule = calculationRuleId(s.destinationCountry);
  if (destinationRule === "GB_LOW_VALUE") {
    const r = rule(destinationRule);
    if (!r) return finish();
    if (
      s.regime !== "standard" ||
      s.channel !== "direct" ||
      ["JE", "GG"].includes(s.originCountry)
    ) {
      note("TRANSACTION_REVIEW");
      return finish();
    }
    if (goods > minor(r.threshold, s.currency)) {
      note("THRESHOLD_EXCEEDED");
      return finish();
    }
    add("customs_duty", 0n, "not_applicable", r, "consignment_intrinsic_value");
    if (standardTax() && registered()) {
      add(
        "sales_vat_gst",
        tax(cif, r.vatBps!),
        "checkout",
        r,
        "tax_exclusive_goods_plus_delivery_and_insurance",
        "half_up_per_consignment",
      );
      if (s.taxEvidenceConfirmed)
        add(
          "import_vat_gst",
          0n,
          "not_applicable",
          r,
          "confirmed_checkout_tax_handoff",
        );
      else note("TAX_EVIDENCE_REQUIRED");
    }
  } else if (destinationRule === "EU_TEMP_LOW_VALUE") {
    if (s.importDate >= "2026-11-01") {
      cite("primary-eu-union-handling-fee");
      note("EU_HANDLING_FEE_REVIEW");
    }
    const r = rule(destinationRule);
    if (!r) return finish();
    if (goods > minor(r.threshold, s.currency)) {
      note("THRESHOLD_EXCEEDED");
      return finish();
    }
    // Regulation 2026/1022 redefines "goods in postal consignment" from July 1.
    // Physical postal transport alone does not establish distance-sale eligibility
    // or exclude preferential treatment. November 1 is the PID boundary.
    const standardFlatDuty = s.regime === "standard" &&
      s.euDeclaration?.flatDutyTreatmentConfirmed === true;
    if (s.regime !== "ioss" && !standardFlatDuty) {
      note("EU_PROCEDURE_REVIEW");
      return finish();
    }
    if (s.regime === "ioss" && !registered()) {
      note("IOSS_REGISTRATION_REQUIRED");
      return finish();
    }
    if (!s.items.every((i) => i.classificationConfirmed && i.hs6)) {
      note("CLASSIFICATION_REQUIRED");
      return finish();
    }
    const distinctSubheadings = new Set(s.items.map((i) => i.hs6!)).size;
    if (!s.euDeclaration || s.euDeclaration.itemCount < distinctSubheadings) {
      note("EU_DECLARATION_ITEM_COUNT_REQUIRED");
    } else {
      add(
        "customs_duty",
        minor(r.flatDuty!, s.currency) * BigInt(s.euDeclaration.itemCount),
        "import",
        r,
        "confirmed_customs_declaration_item_count",
      );
    }
    note("EU_VAT_UNRESOLVED");
    if (
      s.importDate >= "2026-11-01" &&
      s.items.some((i) => !i.productIdentifier)
    ) {
      note("EU_PRODUCT_ID_REQUIRED");
      result.documents.push("PRODUCT_IDENTIFIER_EVIDENCE");
    }
    if (s.regime === "ioss")
      result.documents.push("IOSS_SECURE_HANDOFF_REFERENCE");
  } else if (destinationRule === "SG_LOW_VALUE") {
    const r = rule(destinationRule);
    if (!r) return finish();
    if (s.regime !== "standard") {
      note("TRANSACTION_REVIEW");
      return finish();
    }
    if (!["air", "post"].includes(s.transport)) {
      note("TRANSPORT_REVIEW");
      return finish();
    }
    if (!s.items.every((i) => i.nonDutiableConfirmed)) {
      note("NON_DUTIABLE_REQUIRED");
      return finish();
    }
    add(
      "customs_duty",
      0n,
      "not_applicable",
      r,
      "confirmed_non_dutiable_goods",
    );
    if (s.sellerTaxRegistration === "registered") {
      if (
        s.items.some(
          (i) =>
            minor(i.unitValue, s.currency) > minor(r.threshold, s.currency),
        )
      ) {
        note("THRESHOLD_EXCEEDED");
        return finish();
      }
      if (standardTax()) {
        add(
          "sales_vat_gst",
          tax(cif, r.vatBps!),
          "checkout",
          r,
          "tax_exclusive_supply_including_freight_insurance",
          "half_up_per_consignment",
        );
        if (s.taxEvidenceConfirmed)
          add(
            "import_vat_gst",
            0n,
            "not_applicable",
            r,
            "confirmed_checkout_gst_evidence",
          );
        else note("TAX_EVIDENCE_REQUIRED");
      }
    } else if (s.sellerTaxRegistration === "not_registered") {
      if (cif <= minor(r.threshold, s.currency))
        add("import_vat_gst", 0n, "not_applicable", r, "consignment_cif");
      else if (standardTax())
        add(
          "import_vat_gst",
          tax(cif, r.vatBps!),
          "import",
          r,
          "consignment_cif_plus_confirmed_zero_duty",
          "half_up_per_consignment",
        );
      note("SELLER_TAX_REQUIRED");
    } else note("SELLER_TAX_REQUIRED");
  } else if (destinationRule === "JP_LOW_VALUE") {
    const r = rule(destinationRule);
    if (!r) return finish();
    if (s.regime !== "standard") {
      note("TRANSACTION_REVIEW");
      return finish();
    }
    if (customs === undefined || !s.customsValueConfirmed) {
      note("CUSTOMS_VALUE_REQUIRED");
      return finish();
    }
    if (customs > minor(r.threshold, s.currency)) {
      note("THRESHOLD_EXCEEDED");
      return finish();
    }
    if (!s.items.every((i) => i.japanReliefEligibility === "eligible")) {
      note("JAPAN_EXCLUSION_REVIEW");
      return finish();
    }
    add(
      "customs_duty",
      0n,
      "not_applicable",
      r,
      "confirmed_total_customs_value",
    );
    add(
      "import_vat_gst",
      0n,
      "not_applicable",
      r,
      "confirmed_eligible_low_value_goods",
    );
  } else if (destinationRule === "AU_LOW_VALUE_POST") {
    const r = rule(destinationRule);
    if (!r) return finish();
    if (s.regime !== "standard" || s.transport !== "post") {
      note("TRANSPORT_REVIEW");
      return finish();
    }
    if (customs === undefined || !s.customsValueConfirmed) {
      note("CUSTOMS_VALUE_REQUIRED");
      return finish();
    }
    if (customs > minor(r.threshold, s.currency)) {
      note("THRESHOLD_EXCEEDED");
      return finish();
    }
    add(
      "customs_duty",
      0n,
      "not_applicable",
      r,
      "confirmed_postal_customs_value",
    );
    note("AU_GST_UNRESOLVED");
  } else if (destinationRule === "NZ_LOW_VALUE") {
    const r = rule(destinationRule);
    if (!r) return finish();
    if (s.regime !== "standard") {
      note("TRANSACTION_REVIEW");
      return finish();
    }
    if (goods > minor(r.threshold, s.currency)) {
      note("THRESHOLD_EXCEEDED");
      return finish();
    }
    add(
      "customs_duty",
      0n,
      "not_applicable",
      r,
      "confirmed_aggregated_consignment_goods_value",
    );
    if (standardTax() && registered()) {
      add(
        "sales_vat_gst",
        tax(cif, r.vatBps!),
        "checkout",
        r,
        "tax_exclusive_goods_delivery_insurance",
        "half_up_per_consignment",
      );
      if (s.taxEvidenceConfirmed)
        add(
          "import_vat_gst",
          0n,
          "not_applicable",
          r,
          "confirmed_low_value_gst_handoff",
        );
      else note("TAX_EVIDENCE_REQUIRED");
    }
  } else if (s.destinationCountry === "CN") {
    cite("primary-cn-limit", "primary-cn-process");
    result.documents.push(
      "IDENTITY_VERIFIED_REFERENCE",
      "ORDER_PAYMENT_LOGISTICS_EVIDENCE",
      "POSITIVE_LIST_EVIDENCE",
    );
    if (
      s.importDate < "2019-01-01" ||
      !sourcesCurrent(
        data,
        ["primary-cn-limit", "primary-cn-process"],
        s.importDate,
        now,
      )
    ) {
      note("RULE_NOT_CURRENT");
      return finish();
    }
    if (s.regime !== "cn_9610" && s.regime !== "cn_1210")
      note("CN_REGIME_REQUIRED");
    else if (s.currency !== "CNY") note("CURRENCY_CONVERSION_REQUIRED");
    else if (
      !s.china ||
      !s.china.positiveListConfirmed ||
      !s.china.identityEvidenceConfirmed ||
      !s.china.electronicRecordsConfirmed
    )
      note("CN_EVIDENCE_REQUIRED");
    else if (
      cif > minor("5000", "CNY") ||
      cif > minor(s.china.annualRemaining, "CNY") ||
      minor(s.china.annualRemaining, "CNY") > minor("26000", "CNY")
    )
      note("CN_LIMIT_REVIEW");
    else note("CN_TAX_REVIEW");
  } else if (s.destinationCountry === "US") {
    cite("primary-us-de-minimis");
    if (s.importDate >= "2026-06-24") {
      if (s.transport !== "post") cite("primary-us-nonpostal-suspension");
      else {
        cite("primary-us-postal-suspension");
        if (s.importDate >= "2026-10-22") cite("primary-us-postal-delayed-compliance");
      }
    }
    note("US_REVIEW");
  } else note("UNSUPPORTED_JURISDICTION");
  return finish();
}
