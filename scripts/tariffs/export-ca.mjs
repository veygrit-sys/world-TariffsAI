import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const [databasePath, outputPath, toolPath = ".tariff-tools"] =
  process.argv.slice(2);
if (!databasePath || !outputPath)
  throw new Error(
    "Usage: node scripts/tariffs/export-ca.mjs file.accdb output.json .tariff-tools",
  );
const require = createRequire(resolve(toolPath, "package.json"));
const { default: MDBReader } = await import(require.resolve("mdb-reader"));
const reader = new MDBReader(readFileSync(databasePath));
writeFileSync(outputPath, JSON.stringify(reader.getTable("TPHS").getData()), {
  flag: "wx",
});
