import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { loadDataset } from "../src/dataset.ts";
import {
  loadSpecialTerritoryReferences, reviewSpecialTerritories, specialTerritoryReviewSchema, type SpecialTerritoryRoute,
} from "../src/special-territories.ts";

const baseline = loadDataset();
const referenceDate = "2026-11-12";
const raw = JSON.parse(readFileSync(new URL("../data/special-territory-references.json", import.meta.url), "utf8"));
const data = { specialTerritoryReferences: loadSpecialTerritoryReferences(baseline, raw) };
const review = (route: SpecialTerritoryRoute, date = referenceDate) => reviewSpecialTerritories(data, route, date);

test("special territory data has unambiguous registry and parent selectors", () => {
  assert.equal(data.specialTerritoryReferences.length, 25);
  for (const mutate of [
    (profiles: typeof raw) => { profiles[1].selectors = profiles[0].selectors; },
    (profiles: typeof raw) => { profiles[0].selectors[0].country = "ZZ"; },
    (profiles: typeof raw) => { profiles[0].referenceThrough = "2026-11-11"; },
  ]) {
    const invalid = structuredClone(raw);
    mutate(invalid);
    assert.throws(() => loadSpecialTerritoryReferences(baseline, invalid), /INVALID_SPECIAL_TERRITORY_REFERENCE/);
  }
});

test("Windsor notices follow direction even with GB at both endpoints", () => {
  const inbound = review({ originCountry: "GB", destinationCountry: "GB", customsTerritory: "XI" });
  assert.equal(inbound.requiresRouteReview, true);
  assert.equal(inbound.destination.territoryId, "northern_ireland");
  assert.match(inbound.notices[0]!.guidanceJa, /IMMI/);
  const outbound = review({ originCountry: "GB", destinationCountry: "GB", originCustomsTerritory: "NORTHERN_IRELAND" });
  assert.equal(outbound.requiresRouteReview, true);
  assert.equal(outbound.origin.territoryId, "northern_ireland");
  assert.match(outbound.notices[0]!.guidanceJa, /適格な北アイルランド貨物/);
  assert.match(review({ originCountry: "JP", destinationCountry: "GB", customsTerritory: "XI" })
    .notices[0]!.guidanceJa, /UK\/EU税率/);
});

test("EU fiscal and customs boundaries, dated scope, and unrelated selector protection", () => {
  const aland = review({ originCountry: "FI", destinationCountry: "AX" });
  assert.equal(aland.requiresRouteReview, true);
  assert.match(aland.notices[0]!.guidanceJa, /国内税境界申告/);
  const canary = review({ originCountry: "ES", destinationCountry: "ES", customsTerritory: "CANARY_ISLANDS" });
  assert.match(canary.notices[0]!.customsAreaJa, /領域内/);
  assert.match(canary.notices[0]!.guidanceJa, /IGIC/);
  const ceuta = review({ originCountry: "ES", destinationCountry: "ES", customsTerritory: "CEUTA" });
  assert.match(ceuta.notices[0]!.customsAreaJa, /領域外/);
  assert.match(ceuta.notices[0]!.fiscalAreaJa, /IPSI/);
  assert.equal(review({ originCountry: "ES", destinationCountry: "ES", customsTerritory: "XL" })
    .destination.territoryId, "melilla");
  const gibraltar = review({ originCountry: "JP", destinationCountry: "GI" });
  assert.equal(gibraltar.requiresRouteReview, true);
  assert.match(gibraltar.notices[0]!.guidanceJa, /指定スペイン税関.*陸路/);
  const unknown = review({ originCountry: "JP", destinationCountry: "ES", customsTerritory: "XI" });
  assert.equal(unknown.destination.status, "unresolved");
  assert.equal(unknown.requiresRouteReview, true);
  assert.deepEqual(unknown.notices, []);
  const expired = review({ originCountry: "FI", destinationCountry: "AX" }, "2026-11-13");
  assert.equal(expired.requiresRouteReview, true);
  assert.deepEqual(expired.notices, []);
  assert.equal(review({ originCountry: "ES", destinationCountry: "ES" }).requiresRouteReview, false);
});

test("French DROM and U.S. territory reviews preserve directional and local differences", () => {
  const drom = review({ originCountry: "GP", destinationCountry: "MQ" });
  assert.equal(drom.notices.length, 2);
  assert.ok(drom.notices.every(({ guidanceJa }) => guidanceJa.includes("単一課税領域")));
  assert.match(review({ originCountry: "FR", destinationCountry: "GF" }).notices[0]!.fiscalAreaJa, /暫定的に/);
  const prDomestic = review({ originCountry: "US", destinationCountry: "PR" });
  assert.equal(prDomestic.requiresRouteReview, true);
  assert.match(prDomestic.notices[0]!.guidanceJa, /SURI/);
  const prFederal = review({ originCountry: "JP", destinationCountry: "PR" });
  assert.equal(prFederal.requiresRouteReview, false);
  assert.match(prFederal.notices[0]!.guidanceJa, /連邦CBP/);
  const gu = review({ originCountry: "GU", destinationCountry: "US" });
  assert.equal(gu.requiresRouteReview, true);
  assert.match(gu.notices[0]!.guidanceJa, /連邦輸入/);
  const ajv = new Ajv({ strict: true });
  (addFormatsModule as unknown as (instance: Ajv) => void)(ajv);
  assert.ok(ajv.compile(specialTerritoryReviewSchema)(prDomestic));
});
