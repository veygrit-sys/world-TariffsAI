import { spawnSync } from "node:child_process";

// These suites use public reference data or create their own synthetic tariff packs.
const tests = [
  "tests/acquire-tariff-sources.test.ts",
  "tests/assistant.test.ts",
  "tests/data.test.ts",
  "tests/data-review.test.ts",
  "tests/engine.test.ts",
  "tests/http.test.ts",
  "tests/import-settlement-worldwide.test.ts",
  "tests/import-settlement.test.ts",
  "tests/import-settlement-ledger.test.ts",
  "tests/import-settlement-ledger-api.test.ts",
  "tests/invoice-reconciliation.test.ts",
  "tests/live-validation.test.ts",
  "tests/live-validation-api.test.ts",
  "tests/money.test.ts",
  "tests/native-server.test.ts",
  "tests/quote-charge-consistency.test.ts",
  "tests/pilot-cycle.test.ts",
  "tests/public-catalog.test.ts",
  "tests/rollout-market.test.ts",
  "tests/review-notification.test.ts",
  "tests/settlement-fx.test.ts",
  "tests/special-territories.test.ts",
  "tests/tariff-update.test.ts",
  "tests/trade-policy.test.ts",
];

const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: new URL("../", import.meta.url),
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
