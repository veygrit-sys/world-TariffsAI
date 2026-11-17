import type {
  Dataset,
  Answer,
  Evidence,
  EvidenceSelector,
  Locale,
  Card,
} from "./types.ts";
import { parseAsk, parseClassify, InputError } from "./schema.ts";
import { todayJst } from "./dataset.ts";
import { EU_COUNTRIES } from "./engine.ts";
import { message } from "./messages.ts";
import { loadTariffCatalog, type TariffCatalog } from "./tariffs.ts";

export function detectIntent(question: string): string {
  const q = question.normalize("NFKC").toLowerCase();
  if (/\bhs\b|分類|分类|classif|材質|材质/.test(q)) return "classification";
  if (/本人|身分|身份|identity|kyc/.test(q)) return "identity";
  if (/課税価格|税関評価|完税价格|估价|customs value|customs valuation|transaction value/.test(q))
    return "valuation";
  if (/原産地|原産国|原产地|原产国|country of origin|origin evidence|rules of origin/.test(q))
    return "origin";
  if (/書類|書面|文件|资料|資料|document|invoice|申告/.test(q))
    return "documents";
  if (/少額|低額|低值|免税|threshold|de minimis|いくら|以下|以内/.test(q))
    return "threshold";
  if (/関税|税|tax|vat|gst|duty|费|費/.test(q)) return "tax";
  return "framework";
}
function countryHints(question: string, data: Dataset): Set<string> {
  const q = question.normalize("NFKC"),
    lower = q.toLowerCase(),
    found = new Set<string>();
  const chinese = new Intl.DisplayNames("zh", { type: "region" });
  for (const c of [...data.countries, ...data.supplementalRegions]) {
    const names = [c.name, c.nameJa, chinese.of(c.code) ?? ""];
    if (
      names.some((n) => n.length >= 2 && lower.includes(n.toLowerCase())) ||
      new RegExp("\\b" + c.code + "\\b").test(q)
    )
      found.add(c.code);
  }
  if (/\bEU\b|欧州連合|欧盟/.test(q))
    for (const c of EU_COUNTRIES) found.add(c);
  if (/アメリカ|米国|美国|United States|\bUSA\b/i.test(q)) found.add("US");
  if (/英国|イギリス|英國|Great Britain|\bUK\b/i.test(q)) found.add("GB");
  return found;
}
function evidence(
  card: Card,
  data: Dataset,
  locale: Locale,
  importDate: string,
  now: Date,
): Evidence {
  const reviewedOn = todayJst(now);
  const expired =
    (card.validFrom !== null && importDate < card.validFrom) ||
    (card.validTo !== null && importDate >= card.validTo) ||
    card.sourceIds.some((id) => {
      const s = data.sources.find((x) => x.id === id);
      return !s || s.checkedOn > reviewedOn || reviewedOn > s.reviewBy || importDate > s.reviewBy;
    });
  return {
    id: card.id,
    title: card.title,
    text: card.text[locale],
    verification: card.verification,
    expired,
    sourceIds: [...card.sourceIds],
  };
}
export async function ask(
  input: unknown,
  data: Dataset,
  selector?: EvidenceSelector,
  now = new Date(),
  tariffs?: TariffCatalog,
): Promise<Answer> {
  const request = parseAsk(input),
    locale = request.locale ?? "ja";
  for (const code of [request.originCountry, request.destinationCountry])
    if (
      code &&
      ![...data.countries, ...data.supplementalRegions].some(
        (c) => c.code === code,
      )
    )
      throw new InputError([{ path: "/country", code: "UNKNOWN_COUNTRY" }]);
  const date = request.importDate ?? todayJst(now),
    intent = detectIntent(request.question);
  let hints = countryHints(request.question, data);
  // Jurisdiction cards describe import treatment. Do not present the dispatch country's import relief as destination law.
  if (request.destinationCountry) hints = new Set([request.destinationCountry]);
  else {
    const transition = /から|→|->|\bto\b|到/i.exec(request.question);
    if (
      transition &&
      countryHints(request.question.slice(0, transition.index), data).size > 0
    )
      hints = countryHints(
        request.question.slice(transition.index + transition[0].length),
        data,
      );
  }
  const matches = data.cards
    .map((card) => {
      const specific = card.countries.length > 0;
      const countryMatch = card.countries.some(
        (c) => c === request.destinationCountry,
      )
        ? 20
        : card.countries.some((c) => hints.has(c))
          ? 8
          : 0;
      const score =
        countryMatch +
        (specific ? 0 : 1) +
        (card.topics.includes(intent) ? 2 : 0) +
        (card.verification === "primary_rechecked" ? 2 : 0);
      return { card, score, eligible: !specific || countryMatch > 0 };
    })
    .filter((x) => x.eligible)
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id))
    .slice(0, 6);
  const local = matches.map((x) => evidence(x.card, data, locale, date, now));
  let chosen = local,
    engine: Answer["engine"] = "local_retrieval",
    modelFallback = false;
  // Neither the raw question nor any merchant, order, address or identity reference leaves this process.
  if (selector) {
    const candidates = local.filter(
      (e) => !e.expired && e.verification === "primary_rechecked",
    );
    if (candidates.length) {
      try {
        const selected = await selector.select({
          intent,
          locale,
          evidence: candidates,
        });
        const allowed = new Set(candidates.map((e) => e.id));
        if (
          !Array.isArray(selected) ||
          selected.length === 0 ||
          selected.length > candidates.length ||
          selected.some((id) => typeof id !== "string" || !allowed.has(id)) ||
          new Set(selected).size !== selected.length
        )
          throw new Error("INVALID_MODEL_EVIDENCE");
        chosen = selected.map((id) => candidates.find((e) => e.id === id)!);
        engine = "ollama_evidence_selection";
      } catch {
        modelFallback = true;
      }
    }
  }
  const sourceIds = new Set(chosen.flatMap((e) => e.sourceIds));
  const answer: Answer = {
    engine,
    locale,
    summary: message(chosen.length ? "ASK_SUMMARY" : "ASK_EMPTY", locale),
    evidence: chosen,
    sources: data.sources.filter((s) => sourceIds.has(s.id)),
    requiresReview: true,
    followUpQuestions: [message("ASK_INPUTS", locale)],
    numericQuote: null,
  };
  if (modelFallback) answer.modelFallback = true;
  const destination = request.destinationCountry ??
    (hints.size === 1 ? hints.values().next().value : undefined);
  if (destination) {
    const profile = (tariffs ??= loadTariffCatalog(data)).destinationCustomsProfile(
      destination, date, request.destinationZone, request.customsTerritory,
    );
    if (profile) answer.destinationCustomsProfile = profile;
  }
  if (request.tariffCode) {
    if (!request.destinationCountry)
      throw new InputError([
        {
          path: "/destinationCountry",
          code: "DESTINATION_REQUIRED_FOR_TARIFF",
        },
      ]);
    answer.tariffReference = (tariffs ?? loadTariffCatalog(data)).lookup({
      code: request.tariffCode,
      destinationCountry: request.destinationCountry,
      ...(request.originCountry
        ? { originCountry: request.originCountry }
        : {}),
      ...(request.importDate ? { date: request.importDate } : {}),
      ...(request.destinationZone ? { zone: request.destinationZone } : {}),
      ...(request.customsTerritory
        ? { customsTerritory: request.customsTerritory }
        : {}),
    });
  }
  return answer;
}

/** Product triage, not a tariff ruling. No unlicensed HS nomenclature is bundled. */
export function classify(input: unknown) {
  const r = parseClassify(input),
    text = r.description.normalize("NFKC").toLowerCase(),
    locale = r.locale ?? "ja";
  const categories: [string, RegExp][] = [
    ["battery", /battery|lithium|電池|电池|リチウム/],
    ["alcohol", /alcohol|wine|whisk|ビール|酒|啤酒/],
    ["tobacco", /tobacco|vape|たばこ|タバコ|烟|煙/],
    ["food", /food|snack|食品|菓子|食料/],
    ["medicine", /medicine|drug|medication|医薬|医药|薬品|药品/],
    ["cosmetics", /cosmetic|perfume|化粧|化妆|香水/],
    ["plant", /plant|seed|植物|種子|种子/],
    ["animal", /live animal|生きた動物|活体动物/],
    ["dual_use", /dual.use|軍用|军用|weapon|武器/],
  ];
  return {
    categoryHints: categories
      .filter(([, regex]) => regex.test(text))
      .map(([id]) => id),
    hsCode: null,
    classificationConfirmed: false,
    requiresHumanReview: true,
    requiredAttributes: [
      "material",
      "composition",
      "function",
      "construction",
      "intended_use",
      "destination_tariff_edition",
    ],
    nextAction: message("ASK_INPUTS", locale),
    limitations:
      "Keyword triage can miss restrictions and cannot clear a product or establish a tariff code.",
  };
}
