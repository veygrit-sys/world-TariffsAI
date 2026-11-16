import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { createHandler } from "../src/http.ts";
import type { TariffEvidence } from "../src/tariff-evidence.ts";
import { data } from "./helpers.ts";

const addFormats = addFormatsModule.default;

const key = "test-evidence-api-credential-of-32-characters";
const now = () => new Date("2026-11-13T01:30:00+09:00");
const handle = createHandler({ dataset: data, apiKey: key, now });
const get = (query: string, authenticated = true) => handle(
  new Request("http://127.0.0.1/v1/tariffs/evidence" + query, {
    headers: authenticated ? { Authorization: "Bearer " + key } : {},
  }),
  { peer: "127.0.0.1" },
);

test("tariff evidence covers real customs boundaries without inheriting a mainland rate", async () => {
  const spec = JSON.parse(readFileSync(new URL("../docs/openapi.json", import.meta.url), "utf8"));
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const schema = spec.paths["/v1/tariffs/evidence"].get.responses["200"].content["application/json"].schema;
  const validate = ajv.compile<TariffEvidence>(schema);
  for (const [country, classification] of [
    ["BV", "restricted_access"], ["HM", "restricted_access"],
    ["TF", "local_customs_ordinance"], ["UM", "island_required"], ["AQ", "scientific_logistics"],
  ]) {
    const response = await get("?country=" + country);
    assert.equal(response.status, 200, country);
    const result = await response.json();
    assert.ok(validate(result), JSON.stringify(validate.errors));
    assert.equal(result.country, country);
    assert.equal(result.referenceDate, "2026-11-13");
    assert.equal(result.evidenceBasis, "customs_scope_confirmation_required");
    assert.equal(result.customsScope?.classification, classification);
    assert.ok(result.customsScope?.sources.length);
    assert.deepEqual(result.generalDutyPolicies, []);
    assert.equal(result.shippingAuthorized, false);
  }
});

test("tariff evidence respects date windows and keeps North Korea excluded", async () => {
  const nf = await (await get("?country=NF")).json();
  assert.equal(nf.evidenceBasis, "general_zero_duty_on_date");
  assert.equal(nf.generalDutyPolicies[0].treatment, "general_zero");
  const expired = await (await get("?country=NF&date=2026-11-14")).json();
  assert.notEqual(expired.evidenceBasis, "general_zero_duty_on_date");
  const past = await (await get("?country=IL&date=2026-11-12")).json();
  assert.equal(past.evidenceBasis, "published_tariff_on_date");
  assert.deepEqual(past.publishedTariffSnapshotIds, ["il-customs-book-selected-general-duty-2026-11-12"]);
  const zm = await (await get("?country=ZM")).json();
  assert.equal(zm.evidenceBasis, "applied_tariff_confirmation_required");
  assert.deepEqual(zm.publishedTariffSnapshotIds, []);
  assert.ok(zm.customsScope.sources.some(({ id }: { id: string }) => id.includes("8702409000")));
  const kp = await (await get("?country=KP")).json();
  assert.equal(kp.evidenceBasis, "excluded");
  assert.deepEqual(kp.directDownloads, []);
  assert.deepEqual(kp.references, []);
  assert.equal(kp.shippingAuthorized, false);
});

test("tariff evidence enforces auth, registry codes and unambiguous query parameters", async () => {
  assert.equal((await get("?country=JP", false)).status, 401);
  for (const query of ["", "?country=ZZ", "?country=jp", "?country=JP&country=US",
    "?country=JP&date=2026-02-30", "?country=JP&extra=1"])
    assert.equal((await get(query)).status, 400, query);
});
