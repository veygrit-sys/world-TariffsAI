import assert from "node:assert/strict";
import { test } from "node:test";
import { Ajv } from "ajv";
import {
  invoiceEstimateChargeCategories,
  invoiceReconciliationOutputSchema,
  reconcileInvoice,
  type InvoiceReconciliationInput,
} from "../src/invoice-reconciliation.ts";
import { InputError } from "../src/schema.ts";

function fixture(): InvoiceReconciliationInput {
  const charges = invoiceEstimateChargeCategories.map((category, index) => ({
    category,
    amount: index < 2 ? "10" : "0",
  }));
  return {
    estimate: {
      estimateId: "estimate-1",
      orderId: "order-1",
      issuedOn: "2026-11-12",
      currency: "USD",
      charges,
    },
    invoice: {
      invoiceId: "invoice-1",
      estimateId: "estimate-1",
      orderId: "order-1",
      issuedOn: "2026-11-13",
      currency: "USD",
      charges: charges.map((charge) => ({ ...charge })).reverse(),
    },
  };
}

test("reconciles a complete invoice in stable category order and preserves explicit zero", () => {
  const result = reconcileInvoice(fixture());
  assert.equal(result.status, "matched");
  assert.equal(result.estimatedTotal, "20.00");
  assert.equal(result.actualTotal, "20.00");
  assert.equal(result.differenceTotal, "0.00");
  assert.deepEqual(result.lines.map((line) => line.category), invoiceEstimateChargeCategories);
  assert.deepEqual(result.lines.find((line) => line.category === "carrier_fee"), {
    category: "carrier_fee", estimate: "0.00", actual: "0.00", difference: "0.00", status: "matched",
  });
});

test("reports line discrepancies even when their signed differences cancel", () => {
  const request = fixture();
  const duty = request.invoice.charges.find((charge) => charge.category === "customs_duty")!;
  const vat = request.invoice.charges.find((charge) => charge.category === "import_vat_gst")!;
  duty.amount = "9.99";
  vat.amount = "10.01";
  const result = reconcileInvoice(request);
  assert.equal(result.status, "differences");
  assert.equal(result.differenceTotal, "0.00");
  assert.deepEqual(result.lines.slice(0, 2).map((line) => line.difference), ["-0.01", "0.01"]);
  assert.ok(result.lines.slice(0, 2).every((line) => line.status === "difference"));
});

test("unknown, omitted and unexpected amounts remain distinct from zero", () => {
  const request = fixture();
  request.estimate.charges.find((charge) => charge.category === "excise")!.amount = null;
  request.estimate.charges.find((charge) => charge.category === "customs_fee")!.amount = null;
  request.invoice.charges = request.invoice.charges.filter((charge) =>
    charge.category !== "customs_fee" && charge.category !== "carrier_fee",
  );
  request.invoice.charges.push({ category: "other", amount: "3.50" });
  const result = reconcileInvoice(request);
  assert.equal(result.status, "needs_review");
  assert.equal(result.estimatedTotal, null);
  assert.equal(result.actualTotal, null);
  assert.equal(result.differenceTotal, null);
  assert.deepEqual(result.lines.slice(3), [
    { category: "excise", estimate: null, actual: "0.00", difference: null, status: "estimate_missing" },
    { category: "customs_fee", estimate: null, actual: null, difference: null, status: "amounts_missing" },
    { category: "carrier_fee", estimate: "0.00", actual: null, difference: null, status: "invoice_missing" },
    { category: "other", estimate: null, actual: "3.50", difference: null, status: "estimate_missing" },
  ]);
});

test("keeps a fully reported actual total available when the estimate misses an unexpected fee", () => {
  const request = fixture();
  request.invoice.charges.push({ category: "other", amount: "3.50" });
  const result = reconcileInvoice(request);
  assert.equal(result.status, "needs_review");
  assert.equal(result.actualTotal, "23.50");
  assert.equal(result.estimatedTotal, null);
  assert.equal(result.differenceTotal, null);
});

test("validates document binding, dates, currencies, duplicate categories and PII fields", () => {
  const scenarios: { mutate: (input: InvoiceReconciliationInput) => void; code: string }[] = [
    { mutate: (input) => { input.invoice.estimateId = "estimate-previous"; }, code: "ESTIMATE_ID_MISMATCH" },
    { mutate: (input) => { input.invoice.orderId = "order-other"; }, code: "ORDER_ID_MISMATCH" },
    { mutate: (input) => { input.invoice.invoiceId = "missing id"; }, code: "pattern" },
    { mutate: (input) => { input.invoice.issuedOn = "2026-02-30"; }, code: "format" },
    { mutate: (input) => { input.invoice.issuedOn = "2026-11-11"; }, code: "INVOICE_PREDATES_ESTIMATE" },
    { mutate: (input) => { input.invoice.currency = "CAD"; }, code: "CURRENCY_MISMATCH" },
    { mutate: (input) => { input.invoice.currency = "ZZZ"; }, code: "UNSUPPORTED_CURRENCY" },
    { mutate: (input) => { input.invoice.charges.push({ category: "customs_duty", amount: "1" }); }, code: "DUPLICATE_CHARGE_CATEGORY" },
    { mutate: (input) => { input.estimate.charges.pop(); }, code: "minItems" },
    { mutate: (input) => { Object.assign(input.invoice, { recipientName: "raw name" }); }, code: "additionalProperties" },
  ];
  for (const { mutate, code } of scenarios) {
    const request = fixture();
    mutate(request);
    assert.throws(() => reconcileInvoice(request), (error) =>
      error instanceof InputError && error.issues.some((issue) => issue.code === code),
    code);
  }
});

test("rejects fractional amounts in a zero-decimal currency", () => {
  const request = fixture();
  request.invoice.currency = request.estimate.currency = "JPY";
  request.invoice.charges[0]!.amount = "0.5";
  assert.throws(() => reconcileInvoice(request), (error) =>
    error instanceof InputError && error.issues[0]?.code === "CURRENCY_PRECISION",
  );
});

test("returns validated reason and evidence references for charge discrepancies", () => {
  const request = fixture();
  const duty = request.invoice.charges.find((charge) => charge.category === "customs_duty")!;
  duty.amount = "11";
  duty.explanation = { reason: "tariff_rate", evidenceId: "assessment-2" };
  request.invoice.charges.find((charge) => charge.category === "import_vat_gst")!.explanation = {
    reason: "tax_treatment", evidenceId: "assessment-3",
  };
  request.invoice.charges.push({
    category: "other", amount: "3", explanation: { reason: "fee", evidenceId: "carrier-item-8" },
  });

  const result = reconcileInvoice(request);
  const validate = new Ajv({ strict: true }).compile(invoiceReconciliationOutputSchema);
  assert.ok(validate(result), JSON.stringify(validate.errors));
  assert.deepEqual(result.lines[0]?.explanation, duty.explanation);
  assert.equal(result.lines[0]?.difference, "1.00");
  assert.equal(result.lines[1]?.explanation, undefined);
  assert.deepEqual(result.lines.at(-1)?.explanation, { reason: "fee", evidenceId: "carrier-item-8" });
  assert.equal(result.status, "needs_review");

  Object.assign(duty.explanation, { reason: "manual note", evidenceId: "raw address" });
  assert.throws(() => reconcileInvoice(request), (error) =>
    error instanceof InputError && error.issues.some((issue) => issue.path.endsWith("/explanation/reason"))
    && error.issues.some((issue) => issue.path.endsWith("/explanation/evidenceId")),
  );
});
