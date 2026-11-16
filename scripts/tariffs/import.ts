import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { loadDataset } from "../../src/dataset.ts";
import { tariffStatistics, validateTariffImport } from "../../src/tariffs.ts";

const [sourcePath, linesPath, outputPath] = process.argv.slice(2);
if (!sourcePath || !linesPath || !outputPath) {
  console.error(
    "Usage: npm run tariff:import -- source.json lines.json ./private-tariffs",
  );
  process.exit(2);
}
const destination = resolve(outputPath);
if (existsSync(destination)) throw new Error("TARIFF_OUTPUT_ALREADY_EXISTS");
const { source, lines } = validateTariffImport(
  JSON.parse(readFileSync(sourcePath, "utf8")),
  JSON.parse(readFileSync(linesPath, "utf8")),
  loadDataset(),
);
lines.sort((a, b) => a.code.localeCompare(b.code));
const bytes = gzipSync(JSON.stringify({ id: source.id, lines }), { level: 9 });
const snapshot = {
  ...source,
  file: `${source.id}.json.gz`,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  statistics: tariffStatistics(lines),
};
mkdirSync(dirname(destination), { recursive: true });
const stage = mkdtempSync(join(dirname(destination), ".tariff-pack-"));
try {
  writeFileSync(join(stage, snapshot.file), bytes, { flag: "wx" });
  writeFileSync(
    join(stage, "manifest.json"),
    JSON.stringify({ version: 1, snapshots: [snapshot] }, null, 2) + "\n",
    { flag: "wx" },
  );
  renameSync(stage, destination);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    id: snapshot.id,
    countries: snapshot.countries,
    statistics: snapshot.statistics,
  }),
);
