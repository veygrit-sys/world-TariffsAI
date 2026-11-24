import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mergedCatalog } from "../scripts/jp-stationery-intake.ts";
import { classificationBatchFromCsv } from "../src/classification-batch.ts";
import { ClassificationCatalog, loadClassificationCatalog } from "../src/classification-catalog.ts";
import { proposeClassification } from "../src/classification.ts";
import { createClassificationApproval } from "../src/classification-approvals.ts";
import { applyClassificationAssignments } from "../src/classification-plan.ts";
import { reconcileInvoice } from "../src/invoice-reconciliation.ts";
import { pilotQuoteShipmentDigest, quotePilotShipment, type PilotQuoteRequest } from "../src/pilot-quote.ts";
import { signTariffReview } from "../src/tariff-review.ts";
import { loadOperationalTariffCatalog } from "../src/tariffs.ts";
import { data } from "./helpers.ts";

const root = new URL("../", import.meta.url);
const file = (path: string) => fileURLToPath(new URL(path, root));
const read = (path: string) => readFileSync(file(path), "utf8");

test("synthetic CN–JP marker: SKU review, test-signed Japan Customs pack, statutory quote and independent invoice", t => {
  const dir = mkdtempSync(join(tmpdir(), "jp-marker-cycle-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pack = join(dir, "rates");
  const prefix = "examples/jp-stationery/";
  execFileSync(process.execPath, [file("scripts/tariffs/import.ts"),
    file(prefix + "tariff-source.json"), file(prefix + "tariff-lines.json"), pack]);

  const date = "2026-11-25", now = new Date(date + "T03:00:00Z");
  // This temporary signing key models an isolated deployment; it is never saved.
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const manifests = [file("data/tariffs/manifest.json"), join(pack, "manifest.json")];
  const approval = signTariffReview({ keyId: "test-marker", reviewer: "Synthetic reviewer",
    reviewedOn: date, referenceDate: date, requiredDestinations: ["JP"], referenceUrl: "https://example.test/synthetic",
    manifestSha256: manifests.map(path => createHash("sha256").update(readFileSync(path)).digest("hex")),
  }, privateKey);
  const trustPath = join(dir, "test-trust.json"), approvalPath = join(dir, "test-review.json");
  writeFileSync(trustPath, JSON.stringify({ "test-marker": publicKey }));
  writeFileSync(approvalPath, JSON.stringify(approval));
  const rates = loadOperationalTariffCatalog(data, { VEYGRIT_TARIFF_DIR: pack, VEYGRIT_TARIFF_APPROVAL: approvalPath,
    VEYGRIT_TARIFF_TRUSTED_KEYS: trustPath }, now);

  const batch = classificationBatchFromCsv(read(prefix + "skus.csv"), JSON.parse(read(prefix + "context.json")));
  const product = batch.products[0]!, context = batch.context;
  const catalog = new ClassificationCatalog(mergedCatalog(loadClassificationCatalog({})));
  const request = { context, product };
  const proposal = proposeClassification(request, catalog, data, now);
  const review = createClassificationApproval({ id: "synthetic-marker-classification", request,
    requestDigest: proposal.requestDigest, ruleId: "jp-pilot-porous-marker", validFrom: date,
    validThrough: date, reviewedOn: date, reviewBy: date, reviewerRef: "synthetic-reviewer",
    evidenceIds: ["synthetic-marker-product-review"] }, catalog, data, now);

  const draft: PilotQuoteRequest = JSON.parse(read("examples/pilot-quote-cn-jp-standard.json"));
  const item = draft.plan.shipment.items[0]!;
  item.description = product.description;
  item.productIdentifier = product.sku;
  delete item.hs6;
  item.classificationConfirmed = false;
  draft.plan.shipment.veygrit = { merchantId: product.merchantId, orderId: draft.orderId, cartVersion: "version-1",
    addressTokenRef: "synthetic-marker-address", addressVersion: "version-1", grantRef: "synthetic-marker-grant" };
  delete draft.plan.lines; // The national code must originate in the reviewed SKU assignment.
  const bindings = { authenticatedMerchantId: product.merchantId, context, bindings: [{ itemId: item.id, product }] };
  assert.equal(applyClassificationAssignments(draft.plan, bindings, catalog, [], data, now).status, "review_required");
  const assigned = applyClassificationAssignments(draft.plan, bindings, catalog, [review], data, now);
  assert.equal(assigned.status, "classified");
  draft.plan = assigned.plan;
  const line = draft.plan.lines![0]!;
  assert.equal(line.tariffCode, "960820000");
  line.rateTreatment = "mfn"; // Synthetic independent review of the applicable rate column.
  draft.reviewedShipmentDigest = pilotQuoteShipmentDigest(draft.plan, draft.orderId, draft.loadingCountry);
  const quote = quotePilotShipment(draft, data, rates, now);
  assert.equal(quote.status, "estimated", JSON.stringify(quote.findings));
  assert.equal(quote.importChargesTotal?.value, "3150");
  assert.equal(quote.productionAuthorized, false);
  const duty = quote.charges.find(charge => charge.category === "customs_duty")!;
  assert.equal(duty.calculation?.tariffSnapshotId, "jp-stationery-20261125");
  assert.equal(duty.calculation?.ratePercent, "3.9");
  const invoice = { invoiceId: "synthetic-marker-invoice", orderId: draft.orderId, estimateId: draft.estimateId,
    issuedOn: date, currency: "JPY", charges: Object.entries({
      customs_duty: "700", import_vat_gst: "1900", additional_duty: "0", excise: "0", customs_fee: "0", carrier_fee: "550",
    }).map(([category, value]) => ({ category, amount: value })) };
  assert.equal(reconcileInvoice({ estimate: quote.estimate, invoice }).status, "matched");
  invoice.charges.find(charge => charge.category === "carrier_fee")!.amount = "575";
  assert.equal(reconcileInvoice({ estimate: quote.estimate, invoice }).status, "differences");
});
