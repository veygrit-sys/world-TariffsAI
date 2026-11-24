import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { previewCountryShipment, countryPreviewDestinations } from "../src/country-preview.ts";
import { EU_COUNTRIES } from "../src/engine.ts";
import { loadDataset } from "../src/dataset.ts";
import { createHandler } from "../src/http.ts";
import { captureCountryPreview } from "../src/shadow-ledger.ts";

const data = loadDataset();
const now = new Date("2026-11-25T00:00:00+09:00");
const fixture = (code: string) => JSON.parse(readFileSync(new URL("../examples/country-pilot/" + code + ".json", import.meta.url), "utf8"));
const preview = (input: unknown, date = now) => previewCountryShipment(input, data, date);
test("each of the 27 EU standard territories prices H7 items independently of retail quantity", () => {
  assert.equal(countryPreviewDestinations.length, 34);
  for (const dest of EU_COUNTRIES) {
    const input = fixture("de"); input.shipment.destinationCountry = dest;
    const result = preview(input);
    assert.equal(result.status, "partial_estimate", dest);
    assert.deepEqual(result.charges.map(c => [c.category,c.value,c.collection]), [
      ["customs_duty","3.00","import"],["customs_fee","2.00","import"]]);
    assert.ok(result.reasons.includes("EU_VAT_UNRESOLVED"));
    assert.ok(result.reasons.includes("BUYER_FEE_LIABILITY_UNCONFIRMED"));
    assert.equal(result.checkoutReady, false); assert.equal(result.landedCostTotal, null);
  }
  assert.deepEqual(preview(fixture("fr")).charges.map(c => c.value), ["6.00","4.00"]);
});
test("unverified, repeated and missing declaration lines do not price; distinct article attributes cannot be collapsed", () => {
  for (const rows of [[["line-1","line-2"]],[["line-2"],["line-2"]],[["line-1"]],[]]) {
    const input=fixture("fr"); input.evidence.declarationItems=rows;
    input.shipment.euDeclaration.itemCount=Math.max(1,rows.length); assert.equal(preview(input).charges.length,0);
  }
  const input=fixture("fr"); input.shipment.items[1].hs6=input.shipment.items[0].hs6;
  input.evidence.declarationItems=[["line-1","line-2"]]; input.shipment.euDeclaration.itemCount=1;
  assert.equal(preview(input).charges.length,0);
  for (const change of [{declarationDataset:"H1"}, {declarationIdentifiersReviewed:false}, {buyerPhone:"private"}, {f00DeclarantConfirmed:"true"}]) {
    const x=fixture("de"); Object.assign(x.evidence,change); assert.equal(preview(x).charges.length,0);
  }
  const fee=fixture("de"); fee.evidence.y126Confirmed=false;
  assert.deepEqual(preview(fee).charges.map(c=>c.category),["customs_duty"]);
});
test("source dates, currency, EUR150 boundary, intra-union and special territories are enforced", () => {
  const x=fixture("de"); x.shipment.items[0].quantity=1; x.shipment.items[0].unitValue="150.00"; assert.equal(preview(x).charges.length,2);
  x.shipment.items[0].unitValue="150.01"; assert.equal(preview(x).charges.length,0);
  for (const patch of [{destinationZone:"special"},{originCountry:"BE"},{currency:"USD"},{importDate:"2026-12-03"}]) {
    const i=fixture("de"); Object.assign(i.shipment,patch); assert.equal(preview(i).charges.length,0);
  }
  assert.equal(preview(fixture("fr"),new Date("2026-12-03T00:00:00+09:00")).charges.length,0);
});
test("Japan requires classified stationery, verified CIF and explicit aggregation", () => {
  const x=fixture("jp"); assert.deepEqual(preview(x).charges.map(c=>c.value),["0","0"]);
  for(const patch of [{hs6:"610910"},{classificationConfirmed:false},{japanReliefEligibility:"ineligible"}]) {
    const i=fixture("jp");Object.assign(i.shipment.items[0],patch);assert.equal(preview(i).charges.length,0);
  }
  for(const val of ["0","9999","10001"]) {const i=fixture("jp");i.shipment.customsValue=val;assert.equal(preview(i).charges.length,0);}
  delete x.shipment.loadingCountry;assert.deepEqual(preview(x).reasons,["JP_LOADING_COUNTRY_REQUIRED"]);
});
test("dispatch permission and trade restrictions propagate before any destination prices", () => {
  for(const [dest,origin] of [["CA","JP"],["JP","KP"],["GB","RU"],["GB","IR"],["US","CU"]]) {
    const i=fixture("gb");i.shipment.destinationCountry=dest;i.shipment.originCountry=origin;
    assert.equal(preview(i).charges.length,0);assert.equal(preview(i).shippingAuthorized,false);
  }
  const i=fixture("de");i.shipment.unknownField="private";assert.throws(()=>preview(i));
  assert.throws(()=>preview({...fixture("de"),evidence:"yes"}));assert.throws(()=>preview({...fixture("de"),usJurisdictionApplies:"no"}));
  const stale=structuredClone(data);stale.sources.find(s=>s.id==="primary-eu-union-handling-fee")!.reviewBy="2026-11-24";
  assert.equal(previewCountryShipment(fixture("de"),stale,now).charges.length,0);
});
test("all portal fixtures return source-bound amounts or an explicit hold and cannot become a priced ledger quote", () => {
  for(const code of ["de","fr","gb","sg","au","nz","cn","us","jp"]){
    const input=fixture(code), p=preview(input);
    assert.equal(p.status,code==="us" ? "needs_review" : "partial_estimate",code);
    for(const c of p.charges) assert.ok(c.sourceIds.length && c.sourceIds.every(id=>p.sources.some(s=>s.id===id)),code);
    assert.equal(captureCountryPreview(p).status,"held");assert.equal(p.productionAuthorized,false);
    assert.equal(preview(input,new Date("2027-01-31T00:00:00Z")).charges.length,0);
  }
});
test("authenticated country API serves SDK-equivalent outputs, rejects invalid requests", async () => {
  const apiKey = "synthetic-test-secret-at-least-32-bytes";
  const handler = createHandler({dataset:data,apiKey,now:()=>now});
  async function call(path:string,input:unknown,key=apiKey) {
    return handler(new Request("http://localhost/v1/worldwide/"+path,{method:"POST",headers:{authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify(input)}),{peer:"127.0.0.1"});
  }
  const x=fixture("sg"); assert.deepEqual(await (await call("country-preview",x)).json(),preview(x));
  assert.equal((await call("country-preview",x,"invalid")).status,401);
  assert.equal((await call("country-preview",{shipment:{}})).status,400);
  const doc=fixture("gb-receipt");const response=await call("country-reconcile",doc);
  assert.equal(response.status,200);assert.equal((await response.json()).status,"matched_components");
});
