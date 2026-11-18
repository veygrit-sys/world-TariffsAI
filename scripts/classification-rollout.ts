import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { classificationRollout } from "../src/classification-rollout.ts";
import { loadClassificationCatalog } from "../src/classification-catalog.ts";
import { loadDataset } from "../src/dataset.ts";

const { values } = parseArgs({ options: {
  date: { type: "string" }, now: { type: "string" }, edition: { type: "string" }, write: { type: "boolean", default: false },
}, strict: true });
try {
  const now = values.now !== undefined ? new Date(values.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_REFERENCE_TIME");
  const data = loadDataset(), catalog = loadClassificationCatalog(process.env, data);
  const report = classificationRollout({ ...(values.date !== undefined ? { date: values.date } : {}),
    hsEdition: values.edition ?? "all", limit: 250 }, catalog, data, now);
  if (!values.write) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else {
    const labels = {
      candidate_references: "限定商品の候補あり", source_review_required: "出典の再確認待ち",
      official_evidence_pending: "公式分類の確認待ち", excluded: "商用対象外",
    };
    const actions = {
      expand_product_examples_and_review_national_codes: "商品群拡充・国内税番の確認",
      recheck_scoped_sources: "出典・版・適用日の再照合",
      verify_official_edition_and_product_conditions: "公式本文・HS版・商品条件の確認",
      excluded_from_commercial_classification: "台帳のみ維持",
    };
    const escape = (text: string) => text.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
    const counts = report.totals.byStatus;
    const editionSummary = report.editionTotals.map(row => `| ${row.hsEdition} | ${row.destinations} | ${row.activeRuleCount} |`).join("\n");
    const markets = [...new Set(report.destinations.map(row => row.market).filter(value => value !== null))];
    const lines = [
      "# HS分類の全仕向地・商品群展開台帳", "",
      `基準日 ${report.referenceDate}、確認日 ${report.reviewedOn}。カタログ \`${catalog.version}\`、ダイジェスト \`${catalog.digest}\`。`, "",
      `分類版の絞り込み: \`${report.hsEdition}\`。allは確認した版ごとの参照を集計し、HS2022への変換を意味しません。国別公表版・旧HS版・WTO譲許表の参照は、現在の適用税表と区別します。`, "",
      `ISOの249仕向地と補助地域コソボ（XK）を含む${report.totals.destinations}件を追跡します。分類調査の対象は${report.totals.eligibleDestinations}件（取引の受付可否は別途確認）、限定商品の候補ありは${counts.candidate_references}件、出典再確認は${counts.source_review_required}件、公式分類の確認待ちは${counts.official_evidence_pending}件、商用対象外は${counts.excluded}件です。`, "",
      "候補がある国も商品全体を網羅していません。照会先リンクの存在・加盟国一覧・共通のHS6だけでは分類確認済みにしません。国内細分、税率、原産地資格、取引の適格性、配送受付、運用者の承認はそれぞれ別に確認します。", "",
      "## 分類版ごとの参照範囲", "",
      "版をまたいでコードを変換・統合しません。同じ国が複数の版に含まれる場合、下表の国・地域数には重複があります。WTO譲許表や協定附属書は品目記述の参照であり、現在の適用税表・税率を確認したことを意味しません。", "",
      "| 分類版 | 国・地域数 | 有効な国別ルール数 |", "| --- | ---: | ---: |", editionSummary, "",
      "## 分割して進める作業", "",
      "| 段階 | 作業 | 完了条件 |", "| --- | --- | --- |",
      "| 1 | 国・地域別の公式分類根拠 | 本文・HS版・適用地域を照合し、商品属性と保留条件を記録 |",
      "| 2 | 商品群と仕様境界 | 各章の実用品を追加し、材料・加工・用途・複合品・組物等の違いを検証 |",
      "| 3 | 国内細分・税表版・確認済み割当 | 日付の合う国内税番と税表出典、商品仕様、記録された承認を結合 |",
      "| 4 | 輸出区分と国際取引 | 輸入用の国内税番を流用せず、輸出分類と原産地・経由・各規制を別に検証 |",
      "| 5 | EC接続と継続運用 | 商品台帳接続、通関計画への引継ぎ、取消・期限切れ・根拠改訂を実運用で検証 |", "",
      "各段階は国・商品群ごとに進めます。後続段階が未完了の国を一括で完成扱いにしません。", "",
      "## 地理別の分割状況", "",
      "| 作業グループ | 仕向地数 | 候補あり | 出典再確認 | 公式分類待ち | 対象外 |", "| --- | ---: | ---: | ---: | ---: | ---: |",
    ];
    for (const market of markets) {
      const rows = report.destinations.filter(row => row.market === market);
      lines.push(`| ${market} | ${rows.length} | ${rows.filter(row => row.status === "candidate_references").length} | ${rows.filter(row => row.status === "source_review_required").length} | ${rows.filter(row => row.status === "official_evidence_pending").length} | ${rows.filter(row => row.status === "excluded").length} |`);
    }
    lines.push("", "AQは地理別作業グループに含めず、全仕向地表に対象外として残します。", "",
      "## 全仕向地の次の作業", "",
      "公式照会リンクは調査開始点であり、掲載商品の分類が検証済みという意味ではありません。", "",
      "| コード | 国・地域 | 状態 | 分類版 | 根拠の種別 | 有効HS6数 | 次の作業 | 公式照会先 |", "| --- | --- | --- | --- | --- | ---: | --- | --- |");
    for (const row of report.destinations) {
      const link = row.discoveryReferences[0];
      lines.push(`| ${row.country} | ${escape(row.nameJa)} | ${labels[row.status]} | ${row.hsEditions.join(", ") || "—"} | ${row.referenceBases.join(", ") || "—"} | ${row.hs6Count} | ${actions[row.nextAction]} | ${link ? `[照会先](<${new URL(link.url).href}>)` : "—"} |`);
    }
    lines.push("", "## 商品群の展開台帳", "",
      "HSの01〜97類を調査単位として追跡し、77類は予約類として扱います。98・99類など各国固有の区分は国内税番の段階で別に検証します。[77類の予約はカナダ税関の公式表でも確認できます](https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/01-99/ch77-2026-eng.pdf)。", "",
      "下表はカタログへ登録した候補の件数です。類全体の網羅を示さず、期限切れ等の利用可否は上の国別状態を確認します。", "",
      "| 類 | 収録したHS6数 | 国別ルール数 | 次の作業 |", "| --- | ---: | ---: | --- |");
    for (let number = 1; number <= 97; number++) {
      const chapter = String(number).padStart(2, "0"), rules = catalog.rules.filter(rule => rule.hs6.startsWith(chapter));
      lines.push(`| ${chapter} | ${new Set(rules.map(rule => rule.hs6)).size} | ${rules.length} | ${number === 77 ? "予約類（自動補完しない）" : rules.length ? "限定例の拡充・他商品との境界確認" : "公式資料と代表商品の属性を調査"} |`);
    }
    lines.push("", "## 再開・更新", "", "```sh",
      "npm run classification:rollout -- --date " + report.referenceDate,
      "npm run classification:rollout -- --date " + report.referenceDate + " --edition HS2022",
      "npm run classification:rollout -- --date " + report.referenceDate + " --write",
      "npm run cli -- classification-rollout " + report.referenceDate,
      "```", "",
      "`GET /v1/classification/rollout?hsEdition=all` はサービス認証のもとで同じ台帳を返します。APIの版指定省略時は従来どおりHS2022です。`market`、`status`、`country`、`date`、`direction`、`hsEdition`、`offset`、`limit`で分割できます。集計は全台帳、`total`と`nextOffset`は絞り込んだページに対応します。分類提案には国別表に示す版を明示し、allを分類版として渡しません。", "",
      "カタログ追加後はこのファイルとJSONを生成し直します。日時を再現する場合は`--now`にISO時刻を指定します。JSONの出典照会リンクは分類の根拠へ自動昇格しません。", "");
    writeFileSync(new URL("../docs/HS_CLASSIFICATION_ROLLOUT.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
    writeFileSync(new URL("../docs/HS_CLASSIFICATION_ROLLOUT.md", import.meta.url), lines.join("\n"));
    process.stdout.write("Generated classification rollout JSON and Markdown.\n");
  }
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : "CLASSIFICATION_ROLLOUT_FAILED") + "\n");
  process.exitCode = 1;
}
