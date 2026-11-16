import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { planCustoms, planVeygritOrder, type CustomsPlan } from "../src/customs-plan.ts";
import { coverageLedger } from "../src/coverage-ledger.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import { createHandler } from "../src/http.ts";
import { InputError } from "../src/schema.ts";
import type { BaseDutyTreatment, CustomsPlanRequest, Shipment } from "../src/types.ts";
import type { VeygritPorts } from "../src/veygrit.ts";
import { data, now, shipment } from "./helpers.ts";

const catalog = loadTariffCatalog(data);
const date = "2026-11-11";
const ledger = coverageLedger(data, catalog, date, now);
const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/duty-scenarios-2026-11-11.json", import.meta.url), "utf8",
)) as Record<string, {
  code: string; treatment: BaseDutyTreatment; currency: string;
  expected: string; grossWeightKg?: string; snapshotId: string;
}>;

function sale(destination: string, currency = "USD", code = "6912001000"): Shipment {
  const origin = destination === "JP" ? "CA" : "JP";
  return shipment({
    originCountry: origin,
    destinationCountry: destination,
    currency,
    freight: "0",
    insurance: "0",
    transaction: "b2b_sale",
    incoterm: "DAP",
    customsValue: "100",
    customsValueConfirmed: true,
    items: [{
      id: "line1", description: "Synthetic product", quantity: 1, unitValue: "100", originCountry: origin,
      goodsType: "ordinary", classificationConfirmed: true, hs6: code.slice(0, 6), nonDutiableConfirmed: true,
    }],
  });
}

function usRequest(): CustomsPlanRequest {
  return {
    shipment: sale("US"),
    lines: [{ itemId: "line1", tariffCode: "6912.00.10.00", rateTreatment: "mfn" }],
    availableDocuments: ["COMMERCIAL_INVOICE", "PACKING_LIST", "TRANSPORT_DOCUMENT"],
  };
}

test("worldwide preparation reaches all 249 destinations and preserves missing tariff data", () => {
  assert.equal(ledger.totals.withCustomsPlan, 249);
  assert.equal(ledger.totals.wcoMembers, 187);
  assert.equal(ledger.totals.outsideWcoRoster, 62);
  for (const row of ledger.destinations) {
    const code = row.destinationCountry;
    const draft = sale(code);
    const { hs6: _hs6, ...item } = draft.items[0]!;
    draft.items = [item];
    const result = planCustoms({ shipment: draft }, data, catalog, now);
    assert.equal(result.destination?.destinationCountry, code);
    assert.equal(result.destination?.membershipStatus, row.membershipStatus);
    assert.ok(result.origin?.officialSources.length, code);
    assert.ok(result.destination?.officialSources.length, code);
    if (code === "KP") {
      assert.equal(result.handoff.status, "outside_scope");
      assert.ok(result.checkout.findings.some(({ code }) => code === "KP_COMMERCIAL_EXCLUDED"));
    } else {
      assert.ok(result.handoff.documents.some(({ code }) => code === "IMPORT_DECLARATION"));
    }
    assert.equal(result.baseDutyScenario.knownSubtotal, null);
    assert.equal(result.checkout.landedCostTotal, null);
    assert.equal(result.checkout.shippingAuthorized, false);
    if (row.standardTariffStatus === "official_sources_only")
      assert.equal(result.tariffCoverage.status, "official_sources_only");
  }
});

test("one exact rate scenario reconciles to its published source for every dated tariff destination", () => {
  assert.deepEqual(Object.keys(fixture).sort(), ledger.destinations
    .filter(({ publishedStandardTariffSnapshotIdsOnDate }) => publishedStandardTariffSnapshotIdsOnDate.length > 0)
    .map(({ destinationCountry }) => destinationCountry).sort());
  const snapshots = new Map(catalog.coverage().snapshots.map((snapshot) => [snapshot.id, snapshot]));
  for (const [destination, item] of Object.entries(fixture)) {
    const snapshot = snapshots.get(item.snapshotId);
    assert.ok(snapshot, item.snapshotId);
    // Reproduce the import-day rate from the date when that edition was actually verified.
    const asOf = snapshot.checkedOn > date ? new Date(snapshot.checkedOn + "T00:00:00+09:00") : now;
    const result = planCustoms({
      shipment: sale(destination, item.currency, item.code),
      lines: [{ itemId: "line1", tariffCode: item.code, rateTreatment: item.treatment,
        ...(item.grossWeightKg ? { grossWeightKg: item.grossWeightKg } : {}) }],
    }, data, catalog, asOf);
    const scenario = result.lines[0]!.dutyScenario;
    assert.equal(scenario.status, "calculated", destination + " " + JSON.stringify(scenario));
    assert.deepEqual(result.baseDutyScenario.knownSubtotal,
      { value: item.expected, currency: item.currency }, destination);
    assert.equal(scenario.snapshotId, item.snapshotId, destination);
    assert.ok(scenario.sourceUrls.length > 0, destination);
    assert.ok(result.checkout.importTaxAndDuty.unresolvedCharges.includes("import_vat_gst"), destination);
  }
});

test("zero ordinary duty still requires item eligibility and the right customs territory", () => {
  for (const policy of catalog.territoryCoverage(date).generalDutyPolicies) {
    const result = planCustoms({
      shipment: {
        ...sale(policy.destinationCountry),
        destinationZone: policy.customsTerritory ? "special" : "standard",
      },
      ...(policy.customsTerritory ? { customsTerritory: policy.customsTerritory } : {}),
      lines: [{ itemId: "line1", rateTreatment: "zero_duty_policy" }],
    }, data, catalog, now);
    assert.deepEqual(result.baseDutyScenario.knownSubtotal, { value: "0.00", currency: "USD" }, policy.destinationCountry);
    assert.equal(result.checkout.landedCostTotal, null);
    assert.ok(result.checkout.importTaxAndDuty.unresolvedCharges.includes("excise"));
  }
  const missingTerritory = planCustoms({
    shipment: { ...sale("SJ"), destinationZone: "special" },
    lines: [{ itemId: "line1", rateTreatment: "zero_duty_policy" }],
  }, data, catalog, now);
  assert.equal(missingTerritory.tariffCoverage.status, "territory_review");
  assert.equal(missingTerritory.baseDutyScenario.knownSubtotal, null);
  const ineligible = sale("HK");
  ineligible.items[0]!.nonDutiableConfirmed = false;
  const unknown = planCustoms({
    shipment: ineligible, lines: [{ itemId: "line1", rateTreatment: "zero_duty_policy" }],
  }, data, catalog, now);
  assert.deepEqual(unknown.lines[0]!.dutyScenario,
    { status: "review_required", reason: "ZERO_DUTY_ELIGIBILITY_REQUIRED" });
});

test("dated reference, HS6 ambiguity, special procedures and compound rates stay unresolved", () => {
  const dated = usRequest();
  dated.shipment.importDate = "2030-01-01";
  assert.equal(planCustoms(dated, data, catalog, now).baseDutyScenario.knownSubtotal, null);
  const hs6 = usRequest();
  hs6.lines![0]!.tariffCode = "691200";
  const hs6Line = planCustoms(hs6, data, catalog, now).lines[0]!;
  assert.equal(hs6Line.classification, "candidate");
  assert.deepEqual(hs6Line.dutyScenario,
    { status: "review_required", reason: "EXACT_TARIFF_LINE_REQUIRED" });
  const cbec = sale("CN", "CNY", "69120010");
  cbec.regime = "cn_9610";
  const blocked = planCustoms({
    shipment: cbec, lines: [{ itemId: "line1", tariffCode: "69120010", rateTreatment: "mfn" }],
  }, data, catalog, now);
  assert.deepEqual(blocked.lines[0]!.dutyScenario,
    { status: "review_required", reason: "IMPORT_PROCEDURE_REVIEW" });
  const compound = planCustoms({
    shipment: sale("LK", "LKR", "69120010"),
    lines: [{ itemId: "line1", tariffCode: "69120010", rateTreatment: "general" }],
  }, data, catalog, now);
  assert.deepEqual(compound.lines[0]!.dutyScenario,
    { status: "review_required", reason: "RATE_EXPRESSION_REVIEW" });
  const historical = sale("AE", "USD", "010121100001");
  historical.importDate = "2025-12-31";
  const referenceOnly = planCustoms({
    shipment: historical,
    lines: [{ itemId: "line1", tariffCode: "010121100001", rateTreatment: "general" }],
  }, data, catalog, now);
  assert.equal(referenceOnly.tariffCoverage.status, "reference_for_date");
  assert.deepEqual(referenceOnly.lines[0]!.dutyScenario,
    { status: "review_required", reason: "DATED_PUBLISHED_TARIFF_REQUIRED" });
});

test("import-day tariff stays a reference until its verification date", () => {
  const request = usRequest();
  const beforeVerification = planCustoms(request, data, catalog, new Date("2026-11-10T14:59:59.999Z"));
  const onVerificationDate = planCustoms(request, data, catalog, new Date("2026-11-10T15:00:00Z"));
  assert.equal(beforeVerification.lines[0]!.tariffReferences?.snapshotId, "us-hts-2026-r23");
  assert.deepEqual(beforeVerification.lines[0]!.dutyScenario, {
    status: "review_required", reason: "DATED_PUBLISHED_TARIFF_REQUIRED",
  });
  assert.equal(beforeVerification.baseDutyScenario.knownSubtotal, null);
  assert.ok(beforeVerification.checkout.customsAmountHold.reasons.includes("DATED_TARIFF_REFERENCE_REQUIRED"));
  assert.deepEqual(onVerificationDate.baseDutyScenario.knownSubtotal, { currency: "USD", value: "0.70" });
});

test("Swiss weight-based rate uses only the confirmed gross quantity and CHF", () => {
  const input: CustomsPlanRequest = {
    shipment: sale("CH", "CHF", "35011010"),
    lines: [{ itemId: "line1", tariffCode: "35011010", rateTreatment: "general", grossWeightKg: "50.125" }],
  };
  assert.deepEqual(planCustoms(input, data, catalog, now).baseDutyScenario.knownSubtotal,
    { currency: "CHF", value: "2.01" });
  delete input.lines![0]!.grossWeightKg;
  assert.deepEqual(planCustoms(input, data, catalog, now).lines[0]!.dutyScenario,
    { status: "review_required", reason: "CHF_AND_GROSS_WEIGHT_REQUIRED" });
  input.lines![0]!.grossWeightKg = "50.125";
  input.shipment.currency = "USD";
  assert.equal(planCustoms(input, data, catalog, now).baseDutyScenario.knownSubtotal, null);
});

test("duty subtotal includes only calculated lines and allocations must reconcile", () => {
  const input = usRequest();
  input.shipment.items.push({ ...input.shipment.items[0]!, id: "line2", originCountry: "CA" });
  input.lines![0]!.customsValue = "40";
  input.lines!.push({ itemId: "line2", customsValue: "60" });
  const result = planCustoms(input, data, catalog, now);
  assert.deepEqual(result.baseDutyScenario, {
    status: "partial", knownSubtotal: { value: "0.28", currency: "USD" }, unresolvedItemIds: ["line2"],
  });
  assert.equal(result.lines[1]!.originCountry, "CA");
  input.lines![1]!.customsValue = "61";
  assert.throws(() => planCustoms(input, data, catalog, now),
    (error) => error instanceof InputError && error.issues[0]?.code === "CUSTOMS_VALUE_TOTAL_MISMATCH");
});

test("preparation covers postal returns, domestic, intra-EU and excluded destinations", () => {
  const returned = sale("CA");
  returned.transaction = "return";
  returned.transport = "post";
  const result = planCustoms({ shipment: returned }, data, catalog, now);
  const docs = result.handoff.documents.map(({ code }) => code);
  assert.ok(docs.includes("POSTAL_CUSTOMS_DECLARATION") && docs.includes("RETURN_EVIDENCE") && docs.includes("VALUE_EVIDENCE"));
  assert.ok(!docs.includes("COMMERCIAL_INVOICE"));
  const domestic = planCustoms({ shipment: { ...sale("US"), originCountry: "US" } }, data, catalog, now);
  assert.equal(domestic.handoff.status, "domestic_review");
  assert.deepEqual(domestic.handoff.documents, []);
  const intra = planCustoms({ shipment: { ...sale("DE"), originCountry: "FR" } }, data, catalog, now);
  assert.equal(intra.checkout.route, "eu_intra_union");
  assert.ok(!intra.handoff.documents.some(({ code }) => code === "IMPORT_DECLARATION"));
  const excluded = planCustoms({ shipment: sale("AQ") }, data, catalog, now);
  assert.equal(excluded.handoff.status, "outside_scope");
  assert.equal(excluded.destination, null);
});

test("a qualifying procedure-specific estimate supersedes a basic duty scenario", () => {
  const gb = shipment({ incoterm: "DAP", customsValue: "110", customsValueConfirmed: true });
  const result = planCustoms({
    shipment: gb, lines: [{ itemId: "line1", tariffCode: "6912002100", rateTreatment: "mfn" }],
  }, data, catalog, now);
  assert.equal(result.checkout.status, "partial_estimate");
  assert.deepEqual(result.lines[0]!.dutyScenario, {
    status: "review_required", reason: "SPECIALISED_ESTIMATE_AVAILABLE",
  });
  assert.equal(result.baseDutyScenario.knownSubtotal, null);
});

test("HTTP validates the contract and a review packet never includes internal references", async () => {
  const apiKey = "synthetic-global-customs-service-secret";
  const handle = createHandler({ dataset: data, tariffs: catalog, apiKey, now: () => now });
  const send = (input: unknown, key = apiKey) => handle(new Request("http://localhost/v1/customs/plan", {
    method: "POST",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
  }), { peer: "127.0.0.1" });
  assert.equal((await send(usRequest(), "wrong")).status, 401);
  const invalid = await send({ ...usRequest(), recipientAddress: "private-sentinel" });
  assert.equal(invalid.status, 400);
  assert.ok(!(await invalid.text()).includes("private-sentinel"));
  const response = await send(usRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const output = await response.json();
  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ strict: true, allowUnionTypes: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  const validate = ajv.compile<CustomsPlan>(spec.components.schemas.CustomsPlan);
  assert.ok(validate(output), JSON.stringify(validate.errors));
  assert.equal(output.handoff.status, "available_for_review");
  assert.equal(output.checkout.checkoutReady, false);
  assert.ok(!JSON.stringify(output).includes("Synthetic product"));
});

test("verified order handoff is bound to the grant and refuses a changed snapshot", async () => {
  const request = usRequest();
  const input = { authenticatedMerchantId: "shop", orderId: "order", expectedCartVersion: "1" };
  const ports: VeygritPorts = {
    loadOrder: async () => ({
      merchantId: "shop", orderId: "order", cartVersion: "1", addressTokenRef: "private-address-token",
      addressVersion: "1", grantRef: "private-grant", shipment: request.shipment,
      customs: { lines: request.lines!, availableDocuments: request.availableDocuments! },
    }),
    verifyGrant: async () => ({
      allowed: true, revoked: false, purpose: "shipment", expiresAt: "2026-11-11T00:01:00Z",
      merchantId: "shop", orderId: "order", addressTokenRef: "private-address-token", addressVersion: "1",
    }),
    resolveCustomsScope: async () => ({ country: "US", zone: "standard" }),
    snapshotIsCurrent: async () => true,
  };
  const verified = await planVeygritOrder(input, ports, data, catalog, now);
  assert.equal(verified.checkout.context, "verified_order_preview");
  assert.equal(verified.checkout.expiresAt, "2026-11-11T00:01:00.000Z");
  assert.ok(!JSON.stringify(verified).includes("private-address-token"));
  assert.ok(!JSON.stringify(verified).includes("private-grant"));
  await assert.rejects(() => planVeygritOrder(
    input, { ...ports, snapshotIsCurrent: async () => false }, data, catalog, now,
  ), /ORDER_CHANGED_REQUOTE_REQUIRED/);
});
