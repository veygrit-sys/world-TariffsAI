import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = new URL("../data/", import.meta.url);
const names = [
  "countries.json",
  "wco-members.json",
  "wco-tariff-sources.json",
  "territory-customs.json",
  "supplemental-regions.json",
  "sources.json",
  "research-cards.json",
  "research-provenance.json",
  "knowledge.json",
  "rules.json",
  "customs-asia.json",
  "customs-europe.json",
  "customs-americas.json",
  "customs-fees.json",
  "customs-western-asia-africa.json",
  "customs-oceania.json",
  "import-controls.json",
  "special-procedures.json",
  "trade-blocs.json",
  "special-territory-references.json",
  "official-tariff-sources.json",
  "destination-customs-scope.json",
];
const files = Object.fromEntries(
  names.map((name) => [
    name,
    createHash("sha256")
      .update(readFileSync(new URL(name, dir)))
      .digest("hex"),
  ]),
);
writeFileSync(
  new URL("integrity-manifest.json", dir),
  JSON.stringify(
    { version: "2026-11-25.v13", algorithm: "sha256", files },
    null,
    2,
  ) + "\n",
);
console.log(
  "Data integrity manifest updated; this does not approve or revalidate any source.",
);
