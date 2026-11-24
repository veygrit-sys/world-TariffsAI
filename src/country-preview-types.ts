import type { PilotChargeCategory } from "./pilot-quote.ts";

/** A dated, attributable part of a cross-border estimate. Unknown charges are omitted. */
export interface CountryPreview {
  procedure: string;
  charges: {
    category: PilotChargeCategory;
    value: string;
    currency: string;
    collection: "checkout" | "import" | "not_applicable";
    sourceIds: string[];
  }[];
  reasons: string[];
  sources: { id: string; url: string; reviewBy: string }[];
}
