import assert from "node:assert/strict";
import test from "node:test";
import { Ajv } from "ajv";
import addFormatsModule from "ajv-formats";
import { importSettlementLedgerInputSchema, importSettlementLedgerOutputSchema, reconcileImportSettlementLedger, type ImportSettlementLedgerInput } from "../src/import-settlement-ledger.ts";
import { InputError } from "../src/schema.ts";
import { ledgerFixture } from "./fixtures/import-settlement-ledger.ts";
const now = new Date("2026-11-18T00:00:00Z");
const run = (input: unknown) => reconcileImportSettlementLedger(input, now);
function reviewed(input = ledgerFixture()) {
  input.varianceReview = { ledgerDigest: run(input).ledgerDigest, evidenceId: "variance-evidence", reviewerRef: "synthetic-reviewer", reviewedOn: "2026-11-18" };
  return input;
}
const entry = (input: ImportSettlementLedgerInput, id: string) => input.entries.find(e => e.entryId === id)!;
const has = (input: ImportSettlementLedgerInput, code: string) => assert.ok(run(input).issues.some(i => i.code === code), JSON.stringify(run(input)));

test("combined multi-product multi-parcel assessment, refund and FX retains original and adjusted totals", () => {
  const input = ledgerFixture();
  const first = run(input);
  assert.equal(first.status, "needs_review");
  assert.deepEqual(first.issues.map(x => x.code), ["ESTIMATE_INVOICE_DIFFERENCE"]);
  const result = run(reviewed(input));
  assert.equal(result.status, "reconciled");
  assert.deepEqual(result.totals, { originalEstimate: "270", originalInvoiced: "270", additionalAssessments: "20", credits: "10", adjustedInvoiced: "280", customsTax: "260", carrierFees: "20", paid: "290", refunded: "10", netPaid: "280", balance: "0" });
  assert.equal(result.declarations.length, 2);
  assert.equal(result.conversions[0]?.conversion.original.value, "1.10");
  assert.equal(result.conversions[0]?.conversion.converted.value, "110");
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.shippingAuthorized, false);
});

test("canonical digest tolerates reordering and exact repeated evidence without double counting", () => {
  const original = reviewed();
  const reordered = structuredClone(original);
  reordered.entries.reverse(); reordered.items.reverse(); reordered.parcels.reverse();
  for (const e of reordered.entries) { e.parcelIds.reverse(); e.charges?.reverse(); }
  reordered.entries.push(structuredClone(reordered.entries[0]!));
  reordered.fxRates!.push(structuredClone(reordered.fxRates![0]!));
  assert.equal(run(reordered).ledgerDigest, run(original).ledgerDigest);
  assert.deepEqual(run(reordered).totals, run(original).totals);
  assert.equal(run(reordered).status, "reconciled");
});

test("a shipment can contain separately declared parcels", () => {
  const input = ledgerFixture(); input.parcels[1]!.shipmentId = input.parcels[0]!.shipmentId;
  const result = run(reviewed(input)); assert.equal(result.status, "reconciled");
  assert.equal(result.declarations.length, 2);
});

test("partial and absent carrier payments remain pending with known balance", () => {
  const input = ledgerFixture(); entry(input, "payment-2").amount = "150";
  let result = run(reviewed(input));
  assert.equal(result.status, "pending"); assert.equal(result.totals.balance, "10");
  assert.equal(result.totals.netPaid, "270"); assert.equal(result.totals.adjustedInvoiced, "280");
  input.entries = input.entries.filter(e => !["assessment-payment"].includes(e.entryId));
  result = run(reviewed(input)); assert.equal(result.status, "pending"); assert.equal(result.totals.balance, "30");
});

test("missing confirmed-zero tax and invoice categories stay pending", () => {
  for (const name of ["tax-1", "invoice-1"]) {
    const input = ledgerFixture(); entry(input, name).charges = entry(input,name).charges!.filter(c => c.category !== "excise");
    const result = run(reviewed(input)); assert.equal(result.status, "pending"); assert.equal(result.totals.customsTax, null);
  }
});

test("quantity/parcel allocation cannot omit, duplicate or invent a product unit", () => {
  for (const mutate of [
    (i: ImportSettlementLedgerInput) => { i.parcels[0]!.items[0]!.quantity = 2; },
    (i: ImportSettlementLedgerInput) => { i.parcels[0]!.items[0]!.itemId = "not-in-order"; },
    (i: ImportSettlementLedgerInput) => { i.parcels[0]!.items.push(structuredClone(i.parcels[0]!.items[0]!)); },
  ]) { const input=ledgerFixture(); mutate(input); has(input, "PARCEL_ALLOCATION_MISMATCH"); }
  const duplicate = ledgerFixture(); duplicate.parcels[1]!.parcelId = duplicate.parcels[0]!.parcelId; has(duplicate,"DUPLICATE_PARCEL_ID");
});

test("cross-merchant, billing-account, declaration or parcel evidence cannot be mixed", () => {
  for (const field of ["merchantId", "orderId", "billingAccountRef", "estimateId"] as const) {
    const input=ledgerFixture(); entry(input,"tax-1").scope[field]="another"; has(input,"SETTLEMENT_SCOPE_MISMATCH");
  }
  const input=ledgerFixture(); entry(input,"tax-1").parcelIds=["parcel-2"]; has(input,"SETTLEMENT_PARCEL_SCOPE_MISMATCH");
});

test("same document or FX ID with changed content fails closed", () => {
  const input=ledgerFixture(); const conflict=structuredClone(entry(input,"payment-2")); conflict.amount="151"; input.entries.push(conflict);
  has(input,"CONFLICTING_SETTLEMENT_DOCUMENT"); assert.equal(run(input).totals.netPaid,null);
  const rates=ledgerFixture(); rates.fxRates!.push({...rates.fxRates![0]!,numerator:"101"}); has(rates,"CONFLICTING_FX_RATE");
});

test("missing, future or expired reviewed FX leaves amounts unresolved", () => {
  const input=ledgerFixture(); input.fxRates=[]; has(input,"SETTLEMENT_FX_REQUIRED");
  const expired=ledgerFixture(); expired.fxRates![0]!.reviewBy="2026-11-17"; assert.notEqual(run(expired).status,"reconciled");
  const future=ledgerFixture(); future.fxRates![0]!.reviewedOn="2026-11-19"; assert.notEqual(run(future).status,"reconciled");
});

test("refund and assessment references must exist, match kind/declaration, and precede adjustment", () => {
  for (const target of ["missing", "payment-2", "tax-1"]) {
    const input=ledgerFixture(); entry(input,"invoice-credit").adjustment!.referenceEntryId=target; has(input,"SETTLEMENT_REFERENCE_INVALID");
  }
  const input=ledgerFixture(); entry(input,"tax-refund").occurredOn="2026-11-13"; has(input,"SETTLEMENT_REFERENCE_INVALID");
  const cycle=ledgerFixture(); entry(cycle,"tax-1").adjustment={kind:"additional_assessment",referenceEntryId:"assessment-tax",evidenceId:"cycle-evidence"};
  entry(cycle,"tax-1").occurredOn="2026-11-15"; has(cycle,"SETTLEMENT_REFERENCE_CYCLE");
});

test("refund caps are category-specific, cumulative and linked to original paid receipt", () => {
  const tax=ledgerFixture(); entry(tax,"tax-refund").charges=[{category:"import_vat_gst",amount:"1"}]; has(tax,"REFUND_EXCEEDS_REFERENCED_AMOUNT");
  const credit=ledgerFixture(); entry(credit,"invoice-credit").charges=[{category:"customs_duty",amount:"151"}]; has(credit,"REFUND_EXCEEDS_REFERENCED_AMOUNT");
  const duplicate=ledgerFixture(); const second=structuredClone(entry(duplicate,"tax-refund")); second.entryId="tax-refund-2"; second.charges![0]!.amount="145"; duplicate.entries.push(second); has(duplicate,"REFUND_EXCEEDS_ORIGINAL_AMOUNT");
  const cash=ledgerFixture(); entry(cash,"payment-refund").amount="161"; has(cash,"REFUND_EXCEEDS_REFERENCED_AMOUNT");
  const uncredited=ledgerFixture(); entry(uncredited,"payment-refund").amount="11"; has(uncredited,"CARRIER_REFUND_EXCEEDS_CREDIT");
});

test("refund cannot use changed FX to hide excessive original currency", () => {
  const input=ledgerFixture(); const payment=entry(input,"payment-2"); payment.currency="USD"; payment.fxRateId="synthetic-usdjpy"; payment.amount="1.60";
  const refund=entry(input,"payment-refund"); refund.currency="USD"; refund.fxRateId="refund-rate"; refund.amount="2.00";
  input.fxRates!.push({...input.fxRates![0]!,id:"refund-rate",numerator:"1"});
  has(input,"REFUND_EXCEEDS_ORIGINAL_AMOUNT");
});

test("variance approval cannot precede documents or survive changed amounts", () => {
  const input=reviewed(); input.varianceReview!.reviewedOn="2026-11-13"; has(input,"VARIANCE_REVIEW_INVALID");
  input.varianceReview!.reviewedOn="2026-11-18"; entry(input,"payment-2").amount="150"; has(input,"VARIANCE_REVIEW_INVALID");
  const fx = ledgerFixture(); fx.fxRates![0]!.reviewedOn="2026-11-18";
  reviewed(fx); fx.varianceReview!.reviewedOn="2026-11-16"; has(fx,"VARIANCE_REVIEW_INVALID");
});

test("structural errors and tax-payment mismatches survive a variance acknowledgment", () => {
  const input=ledgerFixture(); entry(input,"tax-1").charges![0]!.amount="99";
  has(reviewed(input),"CARRIER_TAX_REMITTANCE_MISMATCH");
  const overpaid=ledgerFixture(); entry(overpaid,"payment-2").amount="161"; has(reviewed(overpaid),"CARRIER_PAYMENT_EXCEEDS_INVOICE");
});

test("future dates and unsupported routes remain review-required", () => {
  const input=ledgerFixture(); entry(input,"payment-2").occurredOn="2026-11-19"; has(input,"SETTLEMENT_DATE_OUT_OF_RANGE");
  const route=ledgerFixture(); route.scope.destinationCountry="KP"; for(const e of route.entries)e.scope.destinationCountry="KP"; has(route,"SETTLEMENT_ROUTE_OUT_OF_SCOPE");
});

test("strict input and output schemas cover combined and pending results", () => {
  const ajv=new Ajv({strict:true}); (addFormatsModule as unknown as (a:Ajv)=>void)(ajv);
  const validIn=ajv.compile(importSettlementLedgerInputSchema); const validOut=ajv.compile(importSettlementLedgerOutputSchema);
  const input=reviewed(); assert.ok(validIn(input),JSON.stringify(validIn.errors)); assert.ok(validOut(run(input)),JSON.stringify(validOut.errors));
  entry(input,"payment-2").amount="150"; reviewed(input); assert.ok(validOut(run(input)),JSON.stringify(validOut.errors));
  assert.throws(()=>run({...input,rawAddress:"unexpected"}),InputError);
  const invalid=ledgerFixture(); delete (invalid.entries[0] as Partial<typeof invalid.entries[0]>)?.evidenceId; assert.throws(()=>run(invalid),InputError);
});
