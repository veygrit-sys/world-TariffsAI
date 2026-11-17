import { readFileSync, writeFileSync } from "node:fs";
import { classificationBatchFromCsv } from "../src/classification-batch.ts";
import { InputError } from "../src/schema.ts";

try {
  const [csvPath, contextPath, outputPath, ...extra] = process.argv.slice(2);
  if (!csvPath || !contextPath || extra.length)
    throw new Error("USAGE: classification-import INPUT.csv CONTEXT.json [NEW_OUTPUT.json]");
  const batch = classificationBatchFromCsv(readFileSync(csvPath, "utf8"), JSON.parse(readFileSync(contextPath, "utf8")));
  const output = JSON.stringify(batch, null, 2) + "\n";
  if (outputPath) writeFileSync(outputPath, output, { flag: "wx", mode: 0o600 });
  else process.stdout.write(output);
} catch (error) {
  process.stderr.write(JSON.stringify(error instanceof InputError
    ? { error: error.message, issues: error.issues }
    : { error: error instanceof Error && error.message.startsWith("USAGE:") ? error.message : "CLASSIFICATION_IMPORT_FAILED" }) + "\n");
  process.exitCode = 1;
}
