import type { CustomsPlan } from "./customs-plan.ts";
import { sourcesCurrent } from "./dataset.ts";
import { minor } from "./money.ts";
import { tariffAdValoremPercent, type TariffCatalog, type TariffMatch } from "./tariffs.ts";
import type { CustomsPlanRequest, Dataset } from "./types.ts";

const evidenceIds = [
  "primary-jp-import-tax-calculation", "primary-jp-ordinary-duty-election", "primary-jp-relief",
  "primary-jp-duty-rate-selection", "primary-jp-import-consumption-base",
];

interface JapanImportTaxes {
  snapshotId: string;
  calculationSourceUrl: string;
  reviewBy: string;
  dutyPercent: string;
  dutyBase: bigint;
  duty: bigint;
  consumptionBase: bigint;
  national: bigint;
  local: bigint;
}

const truncate = (yen: bigint, unit: bigint) => yen - yen % unit;

// One unit is 10^-8 percentage points, the precision accepted by the duty scenario.
function percentUnits(percent: string | null): bigint | null {
  if (percent === null || !/^\d{1,5}(?:\.\d{1,8})?$/.test(percent)) return null;
  const [whole, fraction = ""] = percent.split(".");
  return BigInt(whole! + fraction.padEnd(8, "0"));
}

function rateNeedsReview(rate: TariffMatch["rates"][number], mfn: bigint): boolean {
  if (["additional_duty", "excise", "trade_remedy", "levy", "other"].includes(rate.charge)) return true;
  if (rate.charge === "import_gst") return true;
  if (rate.charge === "import_vat")
    return percentUnits(rate.adValoremPercent) !== 1_000_000_000n;
  if (rate.charge !== "customs_duty") return false;
  if (["temporary", "quota", "other"].includes(rate.treatment)) return true;
  if (rate.treatment !== "general") return false;
  const domestic = percentUnits(rate.adValoremPercent);
  return !!rate.condition || domestic === null || domestic < mfn;
}

/** Japan Customs Answer 1111. Restrict to one declaration with one tax line:
 * multi-line tax is aggregated before the final hundred-yen truncations. */
export function japanSingleLineTaxes(
  request: CustomsPlanRequest, customs: CustomsPlan, loadingCountry: string | undefined,
  data: Dataset, catalog: TariffCatalog, now: Date,
): JapanImportTaxes | { issue: string } {
  const { shipment, lines } = request;
  if (!sourcesCurrent(data, evidenceIds, shipment.importDate, now)) return { issue: "JAPAN_CALCULATION_SOURCE_REVIEW" };
  const sources = evidenceIds.map(id => data.sources.find(source => source.id === id)!);
  const reviewBy = sources.map(source => source.reviewBy).sort()[0]!;
  const item = shipment.items[0];
  const line = customs.lines[0];
  const inputLine = lines?.[0];
  if (shipment.originCountry !== "CN" || loadingCountry !== "CN" || shipment.destinationCountry !== "JP" ||
      shipment.originZone !== "standard" || shipment.destinationZone !== "standard" ||
      shipment.transitRoute?.stops.length || shipment.currency !== "JPY" ||
      !["air", "courier_unspecified"].includes(shipment.transport) ||
      shipment.regime !== "standard" || shipment.inventoryStatus !== "free_circulation" ||
      shipment.transaction !== "b2c_sale" || !shipment.consignmentScopeConfirmed || !shipment.japanDeclaration?.singleLineConfirmed ||
      shipment.importDate < "2019-10-01" || shipment.items.length !== 1 || lines?.length !== 1 ||
      !item || item.originCountry !== "CN" || item.goodsType !== "ordinary" ||
      !item.standardTaxConfirmed || !shipment.taxEvidenceConfirmed || inputLine?.preferenceAgreement)
    return { issue: "JAPAN_SINGLE_LINE_SCOPE_REVIEW" };

  if (!line?.confirmedCustomsValue || !shipment.customsValueConfirmed)
    return { issue: "JAPAN_CUSTOMS_VALUE_REVIEW" };
  const value = minor(line.confirmedCustomsValue.value, "JPY");
  // Customs Answer 1001: the importer may request the ordinary schedule for
  // the whole consignment. The election must be explicitly reviewed.
  if (value <= 10_000n || (value <= 200_000n && shipment.japanDeclaration.dutySchedule !== "ordinary_elected"))
    return { issue: "JAPAN_DUTY_SCHEDULE_REVIEW" };

  const scenario = line.dutyScenario;
  if (line.classification !== "confirmed" || !/^\d{9}$/.test(line.tariffCode ?? "") ||
      item.hs6 !== line.tariffCode?.slice(0, 6) ||
      scenario.status !== "calculated" || scenario.treatment !== "mfn" ||
      scenario.basis !== "confirmed_line_customs_value" || !scenario.snapshotId)
    return { issue: "JAPAN_EXACT_MFN_TARIFF_REQUIRED" };
  const references = line.tariffReferences;
  const dutyPercent = tariffAdValoremPercent(scenario.expression);
  const mfn = percentUnits(dutyPercent);
  if (!references || references.totalMatches !== 1 || references.snapshotId !== scenario.snapshotId || dutyPercent === null || mfn === null)
    return { issue: "JAPAN_EXACT_MFN_TARIFF_REQUIRED" };
  // The generic lookup uses snapshot ID as its last tiebreaker. The order
  // must not get a tax amount solely because one overlapping ID sorts first.
  const active = customs.tariffCoverage.datedReferences;
  const selected = active.find(s => s.id === scenario.snapshotId);
  if (!selected || selected.jurisdiction !== "JP" || active.some(s =>
    s.role === "tariff" && s.id !== selected.id && s.scope === selected.scope &&
    s.availableFrom === selected.availableFrom && s.checkedOn === selected.checkedOn &&
    catalog.lookup({ snapshotId: s.id, code: line.tariffCode!, destinationCountry: "JP",
      originCountry: item.originCountry, date: shipment.importDate, zone: "standard", limit: 1 }).totalMatches > 0))
    return { issue: "JAPAN_TARIFF_SNAPSHOT_REVIEW" };
  const rows = [...references.matches, ...references.measures.matches];
  if (references.measures.nextOffset !== null || rows.some(r => r.rates.some(rate => rateNeedsReview(rate, mfn))))
    return { issue: "JAPAN_TARIFF_OR_TAX_MEASURE_REVIEW" };
  const dutyBase = truncate(value, 1000n);
  const duty = truncate(dutyBase * mfn / 10_000_000_000n, 100n);
  const consumptionBase = truncate(value + duty, 1000n);
  const national = truncate(consumptionBase * 78n / 1000n, 100n);
  const local = truncate(national * 22n / 78n, 100n);
  return {
    snapshotId: scenario.snapshotId, calculationSourceUrl: sources[0]!.url, reviewBy,
    dutyPercent, dutyBase, duty, consumptionBase, national, local,
  };
}
