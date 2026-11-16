import type { Locale } from "./types.ts";
type Text = [string, string, string];
const messages: Record<string, Text> = {
  KP_COMMERCIAL_EXCLUDED: [
    "北朝鮮（KP）を発送元またはお届け先とする商用取引は提供対象外です。",
    "Veygrit excludes commercial shipments dispatched from or destined for North Korea (KP).",
    "Veygrit商业服务暂不受理从朝鲜（KP）发出或运往朝鲜的货物。",
  ],
  JP_KP_ORIGIN_OR_LOADING_EXCLUDED: [
    "北朝鮮が原産地または船積地域の日本向け貨物は、商用受付の対象外です。",
    "Japan-bound commercial shipments with North Korean product origin or loading are excluded.",
    "运往日本且原产地或装运地为朝鲜的货物不在商业受理范围内。",
  ],
  ROUTE_RELEASE_REQUIRED: [
    "出荷の有効化には、EC・運送・通関担当による経路別の確認が必要です。",
    "Merchant, carrier and declarant route approval is still required.",
    "仍须商户、承运方及申报方按线路审核。",
  ],
  TRANSIT_CUSTOMS_REVIEW: [
    "経由地、積替え、保税・輸入許可の記録を通関担当者と確認してください。",
    "Review intermediate stops, transshipment and customs-control records with the declarant.",
    "请与申报人核对经停、中转和海关监管记录。",
  ],
  TRANSIT_TRADE_REVIEW: [
    "経由地を含む取引・輸送の規制を確認してください。",
    "Review trade and transport restrictions for all locations in the itinerary.",
    "请核实含经停地在内的贸易和运输限制。",
  ],
  TRADE_BLOC_REVIEW: [
    "域内流通、原産地、関税領域と国別例外を確認してください。",
    "Verify circulation, origin, customs territory and national exceptions for the trade bloc.",
    "请核实贸易区域内的流通、原产地、关税领土及国别例外。",
  ],
  EXPORT_REVIEW: [
    "発送国の輸出規制と商品の原産地を別に確認してください。",
    "Check dispatch-country export controls separately from product origin.",
    "发货地出口管制与商品原产地须分别核对。",
  ],
  RESTRICTIONS_REVIEW: [
    "制裁・当事者審査・商品規制・配送会社の受付は未確認です。",
    "Sanctions, party screening, product controls and carrier acceptance are not assessed.",
    "制裁、交易方、商品限制与承运受理尚未核实。",
  ],
  GRANT_RECHECK_REQUIRED: [
    "住所トークンの参照だけでは配送許可を証明しません。注文・住所版・用途・期限・取消をVeygritサーバーで再確認してください。",
    "An address reference is not proof of permission. Revalidate order, address version, purpose, expiry and revocation on the Veygrit server.",
    "地址引用不代表配送授权。Veygrit服务端须复核订单、地址版本、用途、期限与撤销。",
  ],
  ZONE_UNRESOLVED: [
    "通常領域か特別税関・税領域かが未確定です。国コードだけで税額を決めません。",
    "The customs/tax territory is unresolved. A country code alone cannot select tax treatment.",
    "普通或特殊关税税务区域尚未确认，不仅凭国家代码定税。",
  ],
  ANTARCTICA_OUT_OF_SCOPE: [
    "南極はVeygritの対象外です。",
    "Antarctica is outside Veygrit scope.",
    "南极不在Veygrit服务范围。",
  ],
  INVENTORY_REVIEW: [
    "保税在庫や自由流通未確認の貨物には通常輸入・国内販売の処理を自動適用しません。",
    "Bonded or unconfirmed inventory requires a separate procedure.",
    "保税或自由流通状态未确认的库存须另审。",
  ],
  AGGREGATION_REQUIRED: [
    "同一貨物・同時発送等の合算と、税抜商品価格・別記送料を確認してください。",
    "Confirm consignment aggregation, tax-exclusive prices and separately stated freight.",
    "请核实合并货物范围、不含税货值与单列运费。",
  ],
  TRANSACTION_REVIEW: [
    "この税額計算は対象のB2C販売用です。贈答・返品・サンプル・B2Bは別審査です。",
    "This calculation is scoped to qualifying B2C sales. Gifts, returns, samples and B2B require separate review.",
    "此计算限符合条件的B2C销售；礼物、退货、样品和B2B须另审。",
  ],
  REGULATED_GOODS: [
    "通常商品以外または商品区分不明のため、許認可・物品税・危険品等を確認してください。",
    "Regulated or unknown goods require permit, excise and dangerous-goods checks.",
    "受管制或类别不明商品须核对许可、消费税及危险品规定。",
  ],
  DOMESTIC_REVIEW: [
    "同一国の通常領域として処理します。国内販売税と請求は提携EC側で確定してください。",
    "Same-country standard-territory movement: the merchant must resolve domestic tax and invoicing.",
    "同一国家普通区域流转；国内销售税与发票由商户确定。",
  ],
  EU_INTRA_REVIEW: [
    "EU通常領域の自由流通品として分類しました。域内VAT・OSS・物品規制は別に確認してください。",
    "Classified as free-circulation goods moving within ordinary EU territories. Review intra-EU VAT, OSS and product controls separately.",
    "归为欧盟普通区域内自由流通商品；另核对域内VAT、OSS与商品管制。",
  ],
  RULE_NOT_CURRENT: [
    "輸入日と現在日に対応する確認済みルールがありません。税額の計算を保留します。",
    "No revalidated rule covers both the import date and current review date. Calculation is withheld.",
    "无同时覆盖进口日与当前复核日的已核定规则，暂停计税。",
  ],
  CURRENCY_CONVERSION_REQUIRED: [
    "対象制度の通貨による課税価格が必要です。市場為替を通関為替として自動転用しません。",
    "The rule requires a value in its currency. Checkout FX is not automatically valid customs FX.",
    "须使用该制度币种的价格，不把结算汇率自动当作海关汇率。",
  ],
  THRESHOLD_EXCEEDED: [
    "少額計算の対象額を超えています。品目別税率と通常の通関方式を確認してください。",
    "The scoped low-value threshold is exceeded. Confirm commodity tariffs and the ordinary declaration procedure.",
    "超出本版低值计算门槛，须核对商品税则与正常申报方式。",
  ],
  STANDARD_TAX_REQUIRED: [
    "全明細の標準税率適用を商品台帳で確認してください。軽減・ゼロ・免税は自動で標準税率にしません。",
    "Confirm standard-rate eligibility for every line in the product catalogue. Reduced, zero and exempt categories are not coerced to standard rate.",
    "请在商品台账核实每行标准税率资格，不把减免类别自动按标准税率处理。",
  ],
  SELLER_TAX_REQUIRED: [
    "販売者または徴収主体の有効な税務登録と徴収義務を確認してください。",
    "Confirm the responsible collector’s tax registration and collection obligations.",
    "请核实征收主体的有效税务注册及义务。",
  ],
  TAX_EVIDENCE_REQUIRED: [
    "購入時徴税の電子証拠が未確認のため、輸入時税額は未確定です。",
    "Checkout-tax electronic evidence is unconfirmed; import tax remains unresolved.",
    "购买时征税电子凭证未确认，进口税额仍未定。",
  ],
  IOSS_REGISTRATION_REQUIRED: [
    "IOSSの有効な登録・利用と申告用の安全な証拠引継ぎを確認してください。",
    "Confirm valid IOSS registration/use and secure evidence handoff to the declarant.",
    "请核实有效IOSS登记、使用及安全申报凭证交接。",
  ],
  CLASSIFICATION_REQUIRED: [
    "EU少額関税の確認に使うHS6と確認済み分類が必要です。",
    "Confirmed HS6 classification is required to review the EU temporary duty.",
    "核对欧盟暂行关税须提供已核定的HS六位分类。",
  ],
  EU_PROCEDURE_REVIEW: [
    "EUの定額関税を適用する申告方式を確認してください。",
    "Confirm which declaration procedure permits the EU flat customs duty.",
    "请核实适用欧盟定额关税的申报方式。",
  ],
  EU_DECLARATION_ITEM_COUNT_REQUIRED: [
    "申告書の品目明細数と品目分類を通関担当者に確認してください。",
    "Confirm the declared item count and classification with the customs declarant.",
    "请向报关人核实申报商品项数和商品归类。",
  ],
  EU_HANDLING_FEE_REVIEW: [
    "輸入通信販売に該当する場合は、EU取扱手数料（F00）の対象と申告明細数を確認してください。",
    "For qualifying import distance sales, confirm the EU handling fee (F00) and the declared item count.",
    "若属于适用的进口远程销售，请核实欧盟处理费（F00）及申报商品项数。",
  ],
  EU_VAT_UNRESOLVED: [
    "EUの国別・商品別VATと徴収主体は別途確定してください。",
    "Resolve member-state/product VAT and the collector separately.",
    "成员国及商品VAT、征税主体须另行确定。",
  ],
  EU_PRODUCT_ID_REQUIRED: [
    "輸入日が2026年11月以降です。必要な商品識別情報と申告形式を確認してください。",
    "For imports from November 2026, confirm required product identifiers and declaration format.",
    "2026年11月起进口须核对商品识别信息与申报格式。",
  ],
  NON_DUTIABLE_REQUIRED: [
    "このシンガポール計算には、全明細の非課税関税品の確認が必要です。",
    "All lines must be confirmed non-dutiable for this Singapore calculation.",
    "此新加坡计算须确认各行不属于应征关税商品。",
  ],
  TRANSPORT_REVIEW: [
    "輸送方式が本ルールの対象外または未確定です。",
    "Transport mode is outside or unresolved for this rule.",
    "运输方式不在本规则范围或尚未确认。",
  ],
  CUSTOMS_VALUE_REQUIRED: [
    "税関の評価方法による課税価格を確認してください。商品小売価格から自動推定しません。",
    "Provide a confirmed customs value under the applicable valuation method. It is not inferred from retail price.",
    "请提供依适用估价方法核定的课税价格，不从零售价自动推定。",
  ],
  JAPAN_EXCLUSION_REVIEW: [
    "日本の少額免税は全明細の適格性が未確認、または対象外品を含みます。",
    "Japan low-value relief eligibility is unconfirmed or an excluded line is present.",
    "日本低值减免资格未完全核实或包含排除商品。",
  ],
  AU_GST_UNRESOLVED: [
    "豪州の販売時GSTはこの版の計算範囲外です。販売者の登録と税額を別途確認してください。",
    "Australian checkout GST is outside this version’s calculation scope. Confirm registration and tax separately.",
    "本版不计算澳洲销售GST，须另核实登记与税额。",
  ],
  UNSUPPORTED_JURISDICTION: [
    "国・地域は認識しました。品目別税額を出すための確認済みルールは未収録です。",
    "The jurisdiction is recognised but a reviewed commodity-tax calculation is not installed.",
    "已识别此国家或地区，但未装载已复核的商品计税规则。",
  ],
  US_REVIEW: [
    "米国向けは少額価格だけで免税にしません。現行HTSUS・原産地・追加税・申告方式を照合してください。",
    "US shipments are not exempted solely by low value. Recheck current HTSUS, origin, additional duties and entry procedure.",
    "美国货物不只因低值免税；须核实现行HTSUS、原产地、附加税及申报方式。",
  ],
  CN_REGIME_REQUIRED: [
    "中国本土は9610・1210・通常輸入・個人郵便を区別して確認してください。",
    "Distinguish China 9610, 1210, standard import and personal post procedures.",
    "请区分中国9610、1210、一般贸易与个人邮递。",
  ],
  CN_EVIDENCE_REQUIRED: [
    "中国CBECの対象リスト、本人確認、注文・決済・物流情報、年間残枠の確認が必要です。本人番号はこのAPIへ送らないでください。",
    "China CBEC needs positive-list, identity, order/payment/logistics evidence and remaining annual quota checks. Do not send identity numbers to this API.",
    "中国跨境电商须核实正面清单、身份、三单与年度余额，不向此API发送证件号码。",
  ],
  CN_LIMIT_REVIEW: [
    "CBECの基本取引枠または年間残枠を超えています。高額単品特例と通常輸入を通関担当が確認してください。",
    "A basic CBEC transaction or remaining annual limit is exceeded. A declarant must review the high-value single-item exception or standard import.",
    "超出基本单次或年度剩余额度，须由申报方审核高值单件例外或一般贸易。",
  ],
  CN_TAX_REVIEW: [
    "CBEC適格性の入力は揃っています。品目別の増値税・消費税と課税方式は別途確定してください。",
    "The supplied CBEC eligibility evidence is complete; commodity VAT, consumption tax and tax basis still require verification.",
    "已提供CBEC资格材料；商品增值税、消费税与计税方式仍须核实。",
  ],
  UNKNOWN_TOTAL: [
    "未確認の費用があるため、着地総額と支払確定額は出していません。",
    "Unresolved charges prevent a landed-cost total or a payment amount.",
    "存在未定费用，暂不出具到岸总价或应付确认额。",
  ],
  FTA_REVIEW: [
    "協定加盟・発送国だけでは特恵関税を適用しません。品目別原産地規則と証明が必要です。",
    "Agreement membership or dispatch country alone does not establish preference. Product-specific origin rules and evidence are required.",
    "不只凭协定成员或发货地适用优惠税率，须核对商品原产规则与凭证。",
  ],
  ASK_SUMMARY: [
    "出典付きの判断材料です。税額見積には貨物の構造化データを使ってください。",
    "Source-backed decision support. Use structured shipment data for numeric estimates.",
    "以下为有来源的判断材料；税额估算请使用结构化货物数据。",
  ],
  ASK_EMPTY: [
    "該当する確認済み資料が不足しています。公式税関資料と通関方式を確認してください。",
    "Relevant reviewed evidence is insufficient. Check the customs authority and declaration procedure.",
    "相关已复核资料不足，请核对官方海关资料和申报方式。",
  ],
  ASK_INPUTS: [
    "発送国・お届け先の税関領域・原産地・輸入日・商品分類・価格・輸送方式を確認してください。",
    "Confirm dispatch, destination customs territory, origin, entry date, classification, value and transport.",
    "请确认发货地、目的关税区、原产地、进口日、分类、价格和运输方式。",
  ],
};
export function message(code: string, locale: Locale): string {
  const row = messages[code];
  return row ? row[locale === "ja" ? 0 : locale === "en" ? 1 : 2] : code;
}
