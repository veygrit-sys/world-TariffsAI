import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import { reconcileImportSettlementLedger } from "../src/import-settlement-ledger.ts";
import { reviewImportSettlementPlan } from "../src/import-settlement-plan.ts";
import { ledgerFixture } from "./fixtures/import-settlement-ledger.ts";
import { ledgerContractCases, planContractCases, ledgerContractTime, planContractTime, type RefactorCase } from "./fixtures/import-settlement-refactor.ts";
import { openSettlementFixture } from "./fixtures/import-settlement-worldwide.ts";
import { data } from "./helpers.ts";

interface ExpectedCase {
  name: string;
  kind: "ledger" | "plan";
  approvalDigest?: string;
  outcomeSha256: string;
  outcomeKind: "result" | "error";
  status?: string;
  ledgerDigest?: string;
  scopeDigest?: string;
  issues?: unknown;
  errorName?: string;
  errorMessage?: string;
}
const contract = JSON.parse(readFileSync(new URL("./fixtures/import-settlement-refactor-contract.json", import.meta.url), "utf8")) as {
  baselineCommit: string;
  ledgerTime: string;
  planTime: string;
  canonicalLedgerDigest: string;
  cases: ExpectedCase[];
};
const fixture = openSettlementFixture();
after(fixture.close);

// Objects are unordered JSON records; evidence, conversion and diagnostic array order is preserved.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, canonical(record[key])]));
  }
  return value;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function outcome(run: () => unknown) {
  try {
    return { kind: "result" as const, value: run() as Record<string, unknown> };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return { kind: "error" as const, name: error.name, message: error.message,
      ...("issues" in error && Array.isArray(error.issues) ? { issues: error.issues as unknown[] } : {}) };
  }
}
function approve(probe: RefactorCase, expected: ExpectedCase) {
  if (!probe.approval) return;
  assert.ok(expected.approvalDigest, probe.name);
  const input = probe.input as Record<string, unknown>;
  if (probe.kind === "ledger") {
    input.varianceReview = {
      ledgerDigest: expected.approvalDigest,
      evidenceId: "refactor-contract-variance-evidence",
      reviewerRef: "refactor-contract-reviewer",
      reviewedOn: probe.approval === "past" ? "2026-11-13" : probe.approval === "future" ? "2026-11-19" : "2026-11-18",
    };
  } else {
    input.carrierAcceptance = {
      scopeDigest: expected.approvalDigest, billTo: structuredClone(input.requestedBillTo),
      evidenceRef: "refactor-contract-carrier-acceptance",
      acceptedAt: probe.approval === "future" ? "2026-11-13T01:00:00.000Z" : "2026-11-12T16:45:00.000Z",
      expiresAt: "2026-11-12T17:15:00.000Z",
    };
  }
}

test("the rc.24 canonical ledger digest remains compatible with saved approvals", () => {
  assert.equal(contract.baselineCommit, "f1c67ed9fb1b3fb6d853925192f88021b0a951b9");
  assert.equal(contract.ledgerTime, ledgerContractTime);
  assert.equal(contract.planTime, planContractTime);
  assert.equal(contract.canonicalLedgerDigest, "58bd82809666dad0fe6f686accde3689353619f9b442bc7f1f5b8d7c3cdc30c2");
  assert.equal(reconcileImportSettlementLedger(ledgerFixture(), new Date(ledgerContractTime), data).ledgerDigest,
    contract.canonicalLedgerDigest);
});

test("settlement refactoring preserves complete results, diagnostics, conversions and errors", async t => {
  const probes = [...ledgerContractCases(), ...planContractCases()];
  assert.equal(probes.length, 70);
  assert.equal(contract.cases.length, probes.length);
  const expectedByName = new Map(contract.cases.map(value => [value.kind + ":" + value.name, value]));
  assert.equal(expectedByName.size, probes.length);
  for (const probe of probes) {
    await t.test(probe.kind + ": " + probe.name, () => {
      const expected = expectedByName.get(probe.kind + ":" + probe.name);
      assert.ok(expected, probe.name);
      approve(probe, expected);
      const originalInput = structuredClone(probe.input);
      const actual = outcome(() => probe.kind === "ledger"
        ? reconcileImportSettlementLedger(probe.input, new Date(ledgerContractTime), data)
        : reviewImportSettlementPlan(probe.input, data, fixture.tariffs, new Date(planContractTime)));
      assert.deepEqual(probe.input, originalInput, "caller-owned input must remain unchanged");
      assert.equal(actual.kind, expected.outcomeKind);
      if (actual.kind === "result") {
        assert.equal(actual.value.status, expected.status);
        assert.deepEqual(actual.value.issues ?? actual.value.findings, expected.issues);
        if (expected.ledgerDigest) assert.equal(actual.value.ledgerDigest, expected.ledgerDigest);
        if (expected.scopeDigest) assert.equal(actual.value.scopeDigest, expected.scopeDigest);
      } else {
        assert.equal(actual.name, expected.errorName);
        assert.equal(actual.message, expected.errorMessage);
        assert.deepEqual(actual.issues, expected.issues);
      }
      assert.equal(hash(actual), expected.outcomeSha256, "every result/error field must preserve rc.24 semantics");
    });
  }
});
