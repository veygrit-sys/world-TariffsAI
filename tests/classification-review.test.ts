import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assignClassification } from "../src/classification-approvals.ts";
import { loadClassificationEvents } from "../src/classification-store.ts";
import {
  classificationFixtureApprovalInput, classificationFixtureCatalog, classificationFixtureDocument,
  classificationFixtureNow as now, classificationFixtureRequest,
} from "./fixtures/classification.ts";
import { data } from "./helpers.ts";

const script = fileURLToPath(new URL("../scripts/classification-review.ts", import.meta.url));

function setup(run: (paths: { directory: string; catalog: string; request: string; store: string }) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "classification-review-cli-"));
  const paths = { directory, catalog: join(directory, "catalog.json"), request: join(directory, "request.json"),
    store: join(directory, "approvals.json") };
  try {
    writeFileSync(paths.catalog, JSON.stringify(classificationFixtureDocument()));
    writeFileSync(paths.request, JSON.stringify(classificationFixtureApprovalInput()));
    run(paths);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function command(args: string[], catalog?: string) {
  const env = { ...process.env };
  delete env.VEYGRIT_CLASSIFICATION_APPROVALS;
  delete env.VEYGRIT_CLASSIFICATION_CATALOG;
  if (catalog !== undefined) env.VEYGRIT_CLASSIFICATION_CATALOG = catalog;
  const output = spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8", timeout: 20_000 });
  if (output.error) throw output.error;
  return { status: output.status, stdout: output.stdout, stderr: output.stderr };
}

test("the operator CLI approves a reviewed synthetic request privately and repeats without another event", () => {
  setup(paths => {
    const args = ["approve", paths.request, paths.store, now.toISOString()];
    const first = command(args, paths.catalog);
    assert.equal(first.status, 0, first.stderr);
    assert.deepEqual(JSON.parse(first.stdout), {
      eventId: "synthetic-approval-1", eventType: "approved", appended: true, eventCount: 1,
    });
    if (process.platform !== "win32") assert.equal(statSync(paths.store).mode & 0o777, 0o600);
    const history = loadClassificationEvents({ VEYGRIT_CLASSIFICATION_APPROVALS: paths.store }, now);
    const result = assignClassification(classificationFixtureRequest(), classificationFixtureCatalog(), history, data, now);
    assert.equal(result.status, "approved");
    assert.equal(result.classificationConfirmed, true);
    assert.equal(result.nationalCode, "691200100");
    const stored = readFileSync(paths.store, "utf8");
    const retry = command(args, paths.catalog);
    assert.equal(retry.status, 0, retry.stderr);
    assert.deepEqual(JSON.parse(retry.stdout), {
      eventId: "synthetic-approval-1", eventType: "approved", appended: false, eventCount: 1,
    });
    assert.equal(readFileSync(paths.store, "utf8"), stored);
    assert.deepEqual(readdirSync(paths.directory).sort(), ["approvals.json", "catalog.json", "request.json"]);
  });
});

test("the operator CLI appends a revocation and subsequent assignment stops confirming the code", () => {
  setup(paths => {
    assert.equal(command(["approve", paths.request, paths.store, now.toISOString()], paths.catalog).status, 0);
    const revokePath = join(paths.directory, "revoke.json");
    writeFileSync(revokePath, JSON.stringify({
      type: "revoked", id: "synthetic-revocation-1", approvalId: "synthetic-approval-1",
      revokedOn: "2026-11-18", reviewerRef: "synthetic-reviewer", evidenceIds: ["synthetic-withdrawal-proof"],
      reason: "Synthetic reviewed withdrawal",
    }));
    const revoked = command(["revoke", revokePath, paths.store, now.toISOString()], paths.catalog);
    assert.equal(revoked.status, 0, revoked.stderr);
    assert.deepEqual(JSON.parse(revoked.stdout), {
      eventId: "synthetic-revocation-1", eventType: "revoked", appended: true, eventCount: 2,
    });
    const events = loadClassificationEvents({ VEYGRIT_CLASSIFICATION_APPROVALS: paths.store }, now);
    assert.equal(events[0]?.type, "approved");
    assert.equal(events[1]?.type, "revoked");
    const result = assignClassification(classificationFixtureRequest(), classificationFixtureCatalog(), events, data, now);
    assert.equal(result.classificationConfirmed, false);
    assert.ok(result.assignmentIssues.includes("CLASSIFICATION_APPROVAL_REVOKED"));
    const retry = command(["revoke", revokePath, paths.store, now.toISOString()], paths.catalog);
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal(JSON.parse(retry.stdout).appended, false);
    assert.equal(loadClassificationEvents({ VEYGRIT_CLASSIFICATION_APPROVALS: paths.store }, now).length, 2);
  });
});

test("a stale approval request digest is rejected without changing the existing operator history", () => {
  setup(paths => {
    assert.equal(command(["approve", paths.request, paths.store, now.toISOString()], paths.catalog).status, 0);
    const stored = readFileSync(paths.store, "utf8");
    const input = classificationFixtureApprovalInput();
    input.id = "synthetic-stale-approval";
    input.request.product.attributes.material = "steel";
    writeFileSync(paths.request, JSON.stringify(input));
    const stale = command(["approve", paths.request, paths.store, now.toISOString()], paths.catalog);
    assert.equal(stale.status, 1);
    assert.equal(stale.stdout, "");
    assert.ok(JSON.parse(stale.stderr).issues.some((issue: { code: string }) => issue.code === "CLASSIFICATION_REVIEW_SCOPE_MISMATCH"));
    assert.equal(readFileSync(paths.store, "utf8"), stored);
    assert.ok(!readdirSync(paths.directory).some(name => name.endsWith(".lock") || name.includes(".tmp-")));
  });
});

test("malformed operator arguments and future review dates cannot create approval records", () => {
  setup(paths => {
    for (const args of [[], ["accept", paths.request, paths.store], ["approve", paths.request],
      ["approve", paths.request, paths.store, now.toISOString(), "unexpected"],
      ["approve", paths.request, paths.store, "invalid-time"]]) {
      const rejected = command(args, paths.catalog);
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stdout, "");
      assert.equal(existsSync(paths.store), false);
    }
    const future = classificationFixtureApprovalInput();
    future.reviewedOn = "2026-11-19";
    writeFileSync(paths.request, JSON.stringify(future));
    const rejected = command(["approve", paths.request, paths.store, now.toISOString()], paths.catalog);
    assert.equal(rejected.status, 1);
    assert.ok(JSON.parse(rejected.stderr).issues.some((issue: { code: string }) => issue.code === "CLASSIFICATION_REVIEW_NOT_OBSERVED"));
    assert.equal(existsSync(paths.store), false);
  });
});

test("a missing configured catalog or bundled reference catalog cannot approve a synthetic national code", () => {
  setup(paths => {
    const args = ["approve", paths.request, paths.store, now.toISOString()];
    for (const catalog of [join(paths.directory, "missing-catalog.json"), undefined]) {
      const rejected = command(args, catalog);
      assert.equal(rejected.status, 1);
      assert.equal(rejected.stdout, "");
      assert.equal(existsSync(paths.store), false);
    }
  });
});
