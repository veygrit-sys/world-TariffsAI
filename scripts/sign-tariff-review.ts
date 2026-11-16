import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { signTariffReview } from "../src/tariff-review.ts";

function main() {
  const { values } = parseArgs({
    options: {
      draft: { type: "string" },
      "private-key": { type: "string" },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log("Usage: npm run tariff:sign-review -- --draft FILE --private-key ED25519_PEM --out NEW_FILE");
    return;
  }
  if (!values.draft || !values["private-key"] || !values.out)
    throw new Error("TARIFF_REVIEW_SIGNING_ARGUMENT_REQUIRED");
  const output = resolve(values.out);
  const draft: unknown = JSON.parse(readFileSync(values.draft, "utf8"));
  const signed = signTariffReview(draft, readFileSync(values["private-key"]));
  const staging = mkdtempSync(join(dirname(output), ".tariff-review-"));
  try {
    const file = join(staging, "approval.json");
    writeFileSync(file, JSON.stringify(signed, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    linkSync(file, output);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ status: "signed", output, keyId: signed.keyId }));
}

try {
  main();
} catch (error: unknown) {
  console.error(JSON.stringify({ status: "invalid", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
