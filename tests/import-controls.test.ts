import assert from "node:assert/strict";
import test from "node:test";
import { planCustoms } from "../src/customs-plan.ts";
import { loadTariffCatalog } from "../src/tariffs.ts";
import type { CustomsDocumentCode, Shipment } from "../src/types.ts";
import { worldDirection } from "../src/world-directions.ts";
import { data, shipment } from "./helpers.ts";

const day = "2026-11-12";
const now = new Date(day + "T00:00:00Z");
const catalog = loadTariffCatalog(data);

function direction(originCountry: string, destinationCountry: string, date = day) {
  return worldDirection({ originCountry, destinationCountry, date }, data, catalog, now);
}

function plan(change: Partial<Shipment>, code?: string, availableDocuments: CustomsDocumentCode[] = []) {
  const request = shipment({ importDate: day, ...change });
  return planCustoms({ shipment: request, availableDocuments,
    ...(code ? { lines: [{ itemId: request.items[0]!.id, tariffCode: code }] } : {}),
  }, data, catalog, now);
}

test("South African exact permit controls distinguish missing, declared and classification review", () => {
  const request = shipment({ destinationCountry: "ZA", currency: "ZAR", importDate: day });
  request.items[0] = { ...request.items[0]!, hs6: "271019", classificationConfirmed: true };
  const control = (result: ReturnType<typeof plan>) => result.importIntake.find(
    ({ reference }) => reference.id === "za_itac_petroleum");
  const exact = plan(request, "27101907", ["PERMIT_OR_CERTIFICATE"]);
  assert.equal(control(exact)?.status, "documents_needed");
  assert.ok(exact.handoff.missingInputs.includes("GATHER_IMPORT_CONTROL_DOCUMENTS"));
  const declared = plan(request, "27101907", ["IMPORT_PERMIT"]);
  assert.equal(control(declared)?.status, "documents_reported");
  assert.equal(control(declared)?.acceptanceConfirmed, false);
  assert.ok(!declared.handoff.missingInputs.includes("GATHER_IMPORT_CONTROL_DOCUMENTS"));
  assert.equal(control(plan(request))?.status, "verify_classification");
  assert.equal(control(plan(request, "2710190700"))?.status, "verify_classification");
  assert.equal(control(plan(request, "27101999")), undefined);
  assert.equal(declared.checkout.shippingAuthorized, false);
});

test("Australian and New Zealand documents follow the declared transport", () => {
  const ids = (result: ReturnType<typeof plan>) => result.importIntake.map(({ reference }) => reference.id);
  assert.ok(ids(plan({ destinationCountry: "AU", currency: "AUD", transport: "sea" })).includes("au_sea_packing"));
  assert.ok(!ids(plan({ destinationCountry: "AU", currency: "AUD", transport: "air" })).includes("au_sea_packing"));
  const marine = plan({ destinationCountry: "NZ", currency: "NZD", transport: "sea" }, undefined, ["QUARANTINE_DECLARATION"]);
  const bacc = marine.importIntake.find(({ reference }) => reference.id === "nz_sea_container_bacc");
  assert.equal(bacc?.status, "check_with_authority");
  assert.equal(bacc?.documents.find(({ code }) => code === "QUARANTINE_DECLARATION")?.status, "reported_present");
  assert.equal(bacc?.acceptanceConfirmed, false);
  assert.ok(!ids(plan({ destinationCountry: "NZ", currency: "NZD", transport: "post" })).includes("nz_sea_container_bacc"));
});

test("customs unions and external islands retain territory review and local submission guidance", () => {
  for (const [origin, destination] of [["SA", "AE"], ["ZA", "NA"], ["AU", "CC"], ["AU", "NF"], ["FR", "YT"]] as const) {
    assert.equal(direction(origin, destination).territoryReviewRequired, true);
    assert.equal(plan({ originCountry: origin, destinationCountry: destination }).handoff.status, "route_review");
  }
  assert.ok(direction("AU", "NF").destinationImportControls.some(({ id }) => id === "au_norfolk_conditions"));
  assert.ok(direction("JP", "HM").destinationImportControls.some(({ id }) => id === "au_himi_access"));
  assert.deepEqual(direction("JP", "AU", "2026-11-13").destinationImportControls, []);
  assert.deepEqual(direction("KP", "AU").destinationImportControls, []);
});

test("EAC published stays apply to the destination and retain their separate rates", () => {
  for (const [destinationCountry, expected] of [["KE", "25"], ["UG", "10"]] as const) {
    const result = catalog.lookup({ destinationCountry, originCountry: "JP", code: "85171300", date: day });
    assert.equal(result.status, "schedule_reference");
    assert.equal(result.snapshot?.scope, "compiled_reference");
    assert.equal(result.matches[0]?.rates[0]?.adValoremPercent, expected);
    assert.equal(result.applicableRate, null);
  }
});
