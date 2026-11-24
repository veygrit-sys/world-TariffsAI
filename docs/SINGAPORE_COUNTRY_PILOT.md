# シンガポール向け少額貨物のGST試算

日本からシンガポールの消費者へ、税抜単価210シンガポールドル（SGD）のペンを2本、航空便で直販する例を用意した。売主請求の送料は20 SGD、保険は0 SGD。見積入力は [sg.json](../examples/country-pilot/sg.json) で再現できる。

| 確認できた販売・通関条件 | 購入時のGST | 輸入時のGST |
| --- | ---: | ---: |
| GST登録済み販売者。各品の販売価格を使い、支払済み情報を通関時に提示 | 39.60 SGD | 0.00 SGD |
| GST未登録の販売者。購入時の徴収なし。追加調整のないCIF 440 SGD、申告は1行 | 0.00 SGD | 39.60 SGD |
| 登録済み販売者。購入時の試算条件を満たすが通関時に提示した情報が不明 | 39.60 SGD（試算） | 要確認 |

それぞれ同じ合計金額になっても、請求書を照合する相手とタイミングは異なる。上記は合成例で、運送会社や通関代理人の手数料は別途照合が必要。

## 確認する証拠

- 販売確認書から、注文確定時の商品が国外にあり、シンガポールのGST未登録の買主への直販であることを確認する。売主・買主間の単一の売買、航空便または郵便、通常地域・手続、SGD建てを対象とする。HS6、通常税率、関税・物品税の課税対象外であること（non-dutiable goods）を明細ごとに確認する。
- 税抜商品価額、値引き、売主請求の運賃・保険およびその他の対価を請求書で照合する。この試算は追加対価がなく、運賃・保険を別建てで確認できる場合を扱う。品物の単価が400 SGDちょうどまでを対象とし、セット品は販売上の取引単位を確認する。
- 登録済み販売者では、少額品の判定に通常の販売価格を用いることを確認する。IRASに輸入価額方式の選択を届けた販売者は要確認。購入時GSTは売主請求の運賃・保険を含む総額の9%。請求書全体に適用してセント単位に四捨五入する販売者の方式を対象とする。
- 登録番号と各品のGST支払状況を、運送手段に対応する通関書面・データで確認できた場合に `paid_and_transmitted` とする。領収書だけで通関への伝達が不明なら `unverified` とする。二重徴収は `charged_twice` とし、輸入時の領収書等を用いて販売者への返金請求を別途確認する。
- 未登録の販売者では商品・運賃・保険を含む輸入時の課税価格（CIF）を確認する。航空貨物では同一荷送人から同一荷受人へ同一便で届くものを確認し、分割された送り状も合算範囲に反映する。追加調整のないCIFが400 SGD以下なら輸入GSTは0。超過時はCIF全額の9%を計算する。本試算は通関申告が1行で、税額に1セント未満の端数が出ない場合を扱う。
- 外貨建て、登録状況不明、規制対象品、複数売買や価格調整は保留。手数料や運送会社の立替費用も資料で確認する。この試算から配送許可や決済額を決定することはできない。

## 一次資料と試験

資料確認は2026年11月25日（日本時間）。試算日と輸入日を2026年12月2日までの確認期間で制限している。運用再開時は有効な規則と各資料を再確認する。

- [Singapore Customs の少額貨物GST](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/gst-on-low-value-goods/)と[IRASのOVRガイド](https://www.iras.gov.sg/media/docs/default-source/e-tax/gst-e-tax-guide_taxing-imported-low-value-goods-by-way-of-the-overseas-vendor-registration-regime_%281st-ed%29.pdf)。ガイドの5.2–5.4節が対象商品・選択制、8.3–8.4節が支払情報の伝達と二重徴収の扱いを説明している。
- [航空貨物の合算に関するSingapore Customs通達](https://www.customs.gov.sg/files/circular%2021_2023.pdf)、[IRASの輸入時GST](https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/claiming-gst-%28input-tax%29/importing-of-goods)、[TradeNet申告欄の説明](https://www.customs.gov.sg/files/businesses/PSB/TN%20Team/Module_5_-_important_permit_fields_table.pdf)。
- [IRASの帳簿・請求書ガイド](https://www.iras.gov.sg/media/docs/default-source/e-tax/record-keeping-guide-for-gst-registered-businesses.pdf) 5.1.10–11節と[Singapore Customsの返金案内](https://www.customs.gov.sg/personal-shipment/buying-from-overseas/refund-of-taxes/)。

模擬請求書では、販売時にGSTを払った貨物について輸入GSTが39.60 SGD、別途運送会社手数料が5.00 SGD請求された場合を照合する。輸入GST明細の差額は39.60 SGD。手数料は見積情報不足として残る。

この照合と、境界値、情報伝達、未登録販売者の輸入価格、通貨、対象期間、取引条件の自動試験は `node --test tests/singapore-pilot.test.ts` で再実行できる。
