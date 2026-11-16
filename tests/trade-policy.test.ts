import assert from "node:assert/strict";
import test from "node:test";
import { assessTradePolicy, northKoreaBlockReason, PILOT_ROUTES, type TradePolicyInput } from "../src/trade-policy.ts";

const jpImport: TradePolicyInput = {
  dispatchCountry: "CN",
  destinationCountry: "JP",
  productOriginCountries: ["CN"],
  loadingCountry: "CN",
};

test("the six Japanese, mainland Chinese and U.S. directions can enter the pilot", () => {
  assert.equal(PILOT_ROUTES.length, 6);
  for (const route of PILOT_ROUTES) {
    const [dispatchCountry, destinationCountry] = route.split("-") as [string, string];
    const result = assessTradePolicy({
      dispatchCountry, destinationCountry, productOriginCountries: [dispatchCountry], loadingCountry: dispatchCountry,
    });
    assert.equal(result.pilotRoute, route);
    assert.equal(result.status, "pilot");
    assert.equal(result.reasonCode, "PILOT_ROUTE");
    assert.equal(result.shippingAuthorized, false);
  }
});

test("North Korea at either endpoint blocks commercial processing worldwide", () => {
  for (const input of [
    { ...jpImport, dispatchCountry: "KP", destinationCountry: "DE" },
    { ...jpImport, destinationCountry: " kp " },
  ]) {
    assert.equal(northKoreaBlockReason(input), "KP_COMMERCIAL_EXCLUDED");
    const result = assessTradePolicy(input);
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCode, "KP_COMMERCIAL_EXCLUDED");
    assert.equal(result.pilotRoute, null);
    assert.equal(result.shippingAuthorized, false);
  }
});

test("a third-country dispatch does not remove the Japan block for KP origin or loading", () => {
  for (const input of [
    { ...jpImport, productOriginCountries: ["CN", "KP"] },
    { ...jpImport, loadingCountry: "KP" },
  ]) {
    assert.equal(northKoreaBlockReason(input), "JP_KP_ORIGIN_OR_LOADING_EXCLUDED");
    const result = assessTradePolicy(input);
    assert.equal(result.status, "blocked");
    assert.equal(result.reasonCode, "JP_KP_ORIGIN_OR_LOADING_EXCLUDED");
    assert.equal(result.pilotRoute, "CN-JP");
    assert.equal(result.evidence[0]?.effectiveThrough, "2027-04-13");
  }
});

test("a Japanese pilot import with missing loading data requires review", () => {
  const { loadingCountry: _loadingCountry, ...input } = jpImport;
  assert.equal(northKoreaBlockReason(input), null);
  const result = assessTradePolicy(input);
  assert.equal(result.status, "review_required");
  assert.equal(result.reasonCode, "JP_LOADING_COUNTRY_REQUIRED");
  assert.equal(result.pilotRoute, "CN-JP");
});

test("a KP cargo link also triggers review on a non-Japanese pilot", () => {
  const result = assessTradePolicy({ ...jpImport, destinationCountry: "US", productOriginCountries: ["KP"] });
  assert.equal(result.status, "review_required");
  assert.equal(result.reasonCode, "KP_NEXUS_REVIEW");
  assert.equal(result.pilotRoute, "CN-US");
  assert.ok(result.evidence.some(({ jurisdiction }) => jurisdiction === "US"));
});

test("an Iran or Cuba link under known U.S. jurisdiction is held for review", () => {
  const direct = assessTradePolicy({
    dispatchCountry: "US", destinationCountry: "CU", productOriginCountries: ["US"], usJurisdictionApplies: false,
  });
  assert.equal(direct.status, "review_required");
  assert.equal(direct.reasonCode, "US_IR_CU_TRADE_REVIEW");
  assert.deepEqual(direct.evidence.map(({ sourceId }) => sourceId), ["US_OFAC_CUBA_FAQ_758"]);
  const indirect = assessTradePolicy({ ...jpImport, productOriginCountries: ["IR", "CU"], usJurisdictionApplies: true });
  assert.equal(indirect.status, "review_required");
  assert.equal(indirect.reasonCode, "US_IR_CU_TRADE_REVIEW");
  assert.deepEqual(indirect.evidence.map(({ sourceId }) => sourceId), ["US_BIS_IRAN_EXPORT_CONTROLS", "US_OFAC_CUBA_FAQ_758"]);
  const withoutUsNexus = assessTradePolicy({
    dispatchCountry: "JP", destinationCountry: "IR", productOriginCountries: ["JP"],
  });
  assert.equal(withoutUsNexus.status, "out_of_scope");
  assert.equal(withoutUsNexus.reasonCode, "ROUTE_OUT_OF_SCOPE");
});

test("Russia and Belarus trigger manual review without a worldwide endpoint ban", () => {
  for (const input of [
    { ...jpImport, dispatchCountry: "RU" },
    { ...jpImport, loadingCountry: "BY" },
    { ...jpImport, productOriginCountries: ["BY"] },
  ]) {
    const result = assessTradePolicy(input);
    assert.equal(result.status, "review_required");
    assert.equal(result.reasonCode, "RU_BY_TRADE_REVIEW");
    assert.equal(result.shippingAuthorized, false);
  }
});

test("a pilot with an Iranian or Cuban cargo link requires a confirmed U.S. jurisdiction decision", () => {
  const input = { ...jpImport, productOriginCountries: ["IR"] };
  const pending = assessTradePolicy(input);
  assert.equal(pending.status, "review_required");
  assert.equal(pending.reasonCode, "US_JURISDICTION_REVIEW_REQUIRED");
  assert.equal(assessTradePolicy({ ...input, usJurisdictionApplies: false }).status, "pilot");
});

test("other destinations and domestic routes remain outside the commercial pilot", () => {
  for (const destinationCountry of ["AU", "GB", "CN"]) {
    const result = assessTradePolicy({ ...jpImport, destinationCountry });
    assert.equal(result.status, "out_of_scope");
    assert.equal(result.reasonCode, "ROUTE_OUT_OF_SCOPE");
    assert.equal(result.pilotRoute, null);
    assert.equal(result.shippingAuthorized, false);
  }
});

test("worldwide mode evaluates both directions and keeps existing pilot and domestic statuses", () => {
  for (const [dispatchCountry, destinationCountry] of [["DE", "BR"], ["BR", "DE"]] as const) {
    const input = {
      dispatchCountry, destinationCountry, productOriginCountries: [dispatchCountry],
    };
    assert.equal(assessTradePolicy(input).status, "out_of_scope");
    assert.deepEqual(assessTradePolicy(input, "worldwide"), {
      status: "eligible_for_review",
      pilotRoute: null,
      reasonCode: "WORLDWIDE_ROUTE_REVIEW",
      evidence: [],
      shippingAuthorized: false,
    });
  }
  assert.equal(assessTradePolicy(jpImport, "worldwide").status, "pilot");
  assert.equal(assessTradePolicy({ ...jpImport, destinationCountry: "CN" }, "worldwide").status, "out_of_scope");
});

test("worldwide mode applies the North Korea, Japanese loading, and Russia or Belarus holds", () => {
  const destinationJP = {
    dispatchCountry: "DE", destinationCountry: "JP", productOriginCountries: ["DE"],
  };
  const cases = [
    [{ ...destinationJP, destinationCountry: "KP" }, "blocked", "KP_COMMERCIAL_EXCLUDED"],
    [{ ...destinationJP, loadingCountry: "KP" }, "blocked", "JP_KP_ORIGIN_OR_LOADING_EXCLUDED"],
    [{ ...destinationJP, productOriginCountries: ["KP"], loadingCountry: "DE" }, "blocked", "JP_KP_ORIGIN_OR_LOADING_EXCLUDED"],
    [destinationJP, "review_required", "JP_LOADING_COUNTRY_REQUIRED"],
    [{ ...destinationJP, destinationCountry: "CA", productOriginCountries: ["KP"] }, "review_required", "KP_NEXUS_REVIEW"],
    [{ ...destinationJP, dispatchCountry: "RU" }, "review_required", "RU_BY_TRADE_REVIEW"],
    [{ ...destinationJP, loadingCountry: "BY" }, "review_required", "RU_BY_TRADE_REVIEW"],
  ] as const;
  for (const [input, status, reasonCode] of cases) {
    const result = assessTradePolicy(input, "worldwide");
    assert.equal(result.status, status);
    assert.equal(result.reasonCode, reasonCode);
    assert.equal(result.shippingAuthorized, false);
  }
});

test("worldwide Iranian and Cuban nexus checks require a known U.S. jurisdiction decision", () => {
  for (const destinationCountry of ["IR", "CU"]) {
    const input = {
      dispatchCountry: "DE", destinationCountry, productOriginCountries: ["DE"],
    };
    const pending = assessTradePolicy(input, "worldwide");
    assert.equal(pending.status, "review_required");
    assert.equal(pending.reasonCode, "US_JURISDICTION_REVIEW_REQUIRED");
    const applies = assessTradePolicy({ ...input, usJurisdictionApplies: true }, "worldwide");
    assert.equal(applies.reasonCode, "US_IR_CU_TRADE_REVIEW");
    const confirmedNoNexus = assessTradePolicy({ ...input, usJurisdictionApplies: false }, "worldwide");
    assert.equal(confirmedNoNexus.status, "eligible_for_review");
    const directUs = assessTradePolicy({ ...input, dispatchCountry: "US", usJurisdictionApplies: false }, "worldwide");
    assert.equal(directUs.reasonCode, "US_IR_CU_TRADE_REVIEW");
  }
});
