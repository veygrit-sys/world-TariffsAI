import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import {
  existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import type { ClassificationApprovalEvent, ClassificationRevocationEvent } from "../src/classification-approvals.ts";
import { appendClassificationEvent, loadClassificationEvents } from "../src/classification-store.ts";

const now = new Date("2026-11-18T00:00:00Z");

function withStore(run: (path: string, directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "classification-store-"));
  try {
    run(join(directory, "approvals.json"), directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const env = (path: string) => ({ VEYGRIT_CLASSIFICATION_APPROVALS: path });
function approval(id = "approval-1"): ClassificationApprovalEvent {
  return {
    type: "approved", id, merchantId: "merchant", sku: "sku", revision: "v1",
    productFingerprint: "a".repeat(64), requestDigest: "b".repeat(64),
    country: "JP", direction: "import", hsEdition: "HS2022", ruleId: "rule", hs6: "691200",
    nationalCode: "691200100", tariffEdition: "JP2026", catalogDigest: "c".repeat(64),
    sourceIds: ["schedule"], validFrom: "2026-11-01", validThrough: "2026-11-25",
    reviewedOn: "2026-11-18", reviewBy: "2026-11-25", reviewerRef: "reviewer", evidenceIds: ["evidence"],
  };
}
function revocation(): ClassificationRevocationEvent {
  return { type: "revoked", id: "revoke-1", approvalId: "approval-1", revokedOn: "2026-11-18",
    reviewerRef: "reviewer", evidenceIds: ["revocation-proof"], reason: "source changed" };
}

test("an atomic initial append is private and exact retry is idempotent", () => {
  withStore((path, directory) => {
    const event = approval();
    const first = appendClassificationEvent(path, event, now);
    assert.equal(first.appended, true);
    assert.deepEqual(first.events, [event]);
    assert.deepEqual(loadClassificationEvents(env(path), now), [event]);
    if (process.platform !== "win32") assert.equal(statSync(path).mode & 0o777, 0o600);
    const saved = readFileSync(path, "utf8");
    assert.equal(appendClassificationEvent(path, event, now).appended, false);
    assert.equal(readFileSync(path, "utf8"), saved);
    assert.deepEqual(readdirSync(directory), ["approvals.json"]);
  });
});

test("revocations append history while conflicting identities cannot overwrite an event", () => {
  withStore((path, directory) => {
    const event = approval();
    appendClassificationEvent(path, event, now);
    appendClassificationEvent(path, revocation(), now);
    assert.deepEqual(loadClassificationEvents(env(path), now), [event, revocation()]);
    const saved = readFileSync(path, "utf8");
    assert.throws(() => appendClassificationEvent(path, { ...event, reviewerRef: "another-reviewer" }, now));
    assert.equal(readFileSync(path, "utf8"), saved);
    assert.throws(() => appendClassificationEvent(path, { ...revocation(), id: "bad-reference", approvalId: "missing" }, now));
    assert.equal(readFileSync(path, "utf8"), saved);
    assert.deepEqual(readdirSync(directory), ["approvals.json"]);
  });
});

test("classification store configuration is optional but configured missing or malformed records fail closed", () => {
  assert.deepEqual(loadClassificationEvents({}, now), []);
  withStore(path => {
    assert.throws(() => loadClassificationEvents(env(path), now));
    writeFileSync(path, "[]\n");
    assert.deepEqual(loadClassificationEvents(env(path), now), []);
    writeFileSync(path, "{unfinished");
    assert.throws(() => loadClassificationEvents(env(path), now), /INVALID_CLASSIFICATION_STORE_JSON/);
    writeFileSync(path, "{}\n");
    assert.throws(() => loadClassificationEvents(env(path), now));
  });
});

test("the classification store reads bounded regular files and rejects oversized or symbolic files", () => {
  withStore((path, directory) => {
    assert.throws(() => loadClassificationEvents(env(directory), now), /CLASSIFICATION_STORE_NOT_REGULAR_FILE/);
    writeFileSync(path, " ".repeat(5 * 1024 * 1024 + 1));
    assert.throws(() => loadClassificationEvents(env(path), now), /CLASSIFICATION_STORE_TOO_LARGE/);
    rmSync(path);
    const original = join(directory, "original.json");
    writeFileSync(original, "[]\n");
    symlinkSync(original, path);
    assert.throws(() => loadClassificationEvents(env(path), now));
    assert.throws(() => appendClassificationEvent(path, {}, now));
    assert.equal(readFileSync(original, "utf8"), "[]\n");
  });
});

test("invalid appends preserve the existing file and clean the owned lock", () => {
  withStore((path, directory) => {
    writeFileSync(path, "[]\n");
    assert.throws(() => appendClassificationEvent(path, {}, now));
    assert.equal(readFileSync(path, "utf8"), "[]\n");
    assert.deepEqual(readdirSync(directory), ["approvals.json"]);
    writeFileSync(path, "{unfinished");
    assert.throws(() => appendClassificationEvent(path, {}, now), /INVALID_CLASSIFICATION_STORE_JSON/);
    assert.equal(readFileSync(path, "utf8"), "{unfinished");
    assert.deepEqual(readdirSync(directory), ["approvals.json"]);
  });
});

test("another writer's lock is retained and no stale-lock takeover occurs", () => {
  withStore((path, directory) => {
    writeFileSync(path, "[]\n");
    writeFileSync(path + ".lock", "another-writer");
    assert.throws(() => appendClassificationEvent(path, {}, now), /CLASSIFICATION_STORE_LOCKED/);
    assert.equal(readFileSync(path + ".lock", "utf8"), "another-writer");
    assert.equal(readFileSync(path, "utf8"), "[]\n");
    assert.deepEqual(readdirSync(directory), ["approvals.json", "approvals.json.lock"]);
  });
});

test("an invalid first append does not create an approval registry", () => {
  withStore((path, directory) => {
    assert.throws(() => appendClassificationEvent(path, {}, now));
    assert.equal(existsSync(path), false);
    assert.deepEqual(readdirSync(directory), []);
  });
});

test("a failed atomic replacement preserves the previous snapshot and removes temporary files", () => {
  withStore((path, directory) => {
    writeFileSync(path, "[]\n");
    const originalRename = fs.renameSync;
    try {
      fs.renameSync = () => { throw new Error("SYNTHETIC_RENAME_FAILURE"); };
      syncBuiltinESMExports();
      assert.throws(() => appendClassificationEvent(path, approval(), now), /SYNTHETIC_RENAME_FAILURE/);
      assert.equal(readFileSync(path, "utf8"), "[]\n");
      assert.deepEqual(readdirSync(directory), ["approvals.json"]);
    } finally {
      fs.renameSync = originalRename;
      syncBuiltinESMExports();
    }
    assert.equal(appendClassificationEvent(path, approval(), now).appended, true);
  });
});

test("competing processes serialize or fail locked, then retry without losing either event", async () => {
  const directory = mkdtempSync(join(tmpdir(), "classification-concurrent-"));
  const path = join(directory, "approvals.json");
  const appendUrl = new URL("../src/classification-store.ts", import.meta.url).href;
  const child = `import { appendClassificationEvent } from ${JSON.stringify(appendUrl)};
try { appendClassificationEvent(process.argv[1], JSON.parse(process.argv[2]), new Date(${JSON.stringify(now.toISOString())})); }
catch(error) { if (error.message !== 'CLASSIFICATION_STORE_LOCKED') throw error; process.exitCode = 3; }`;
  const events = [approval("parallel-1"), approval("parallel-2")];
  try {
    const attempts = await Promise.allSettled(events.map(event => promisify(execFile)(process.execPath,
      ["--input-type=module", "-e", child, path, JSON.stringify(event)])));
    for (const result of attempts) {
      if (result.status === "rejected") {
        assert.ok(result.reason !== null && typeof result.reason === "object" && result.reason.code === 3,
          String(result.reason));
      }
    }
    for (const event of events) appendClassificationEvent(path, event, now);
    assert.deepEqual(loadClassificationEvents(env(path), now).map(event => event.id).sort(), ["parallel-1", "parallel-2"]);
    assert.deepEqual(readdirSync(directory), ["approvals.json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
