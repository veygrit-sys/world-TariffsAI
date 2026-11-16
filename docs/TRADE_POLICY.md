# v1.0の商用対象と取引確認

商用の検証対象は日中米の6方向です。国・地域台帳は公的な通関情報の照会にも使います。パイロット判定は見積もり処理の入口です。実際の発送可否は、商品・取引相手・経路を担当者が確認します。

| 判定コード | v1.0での扱い |
| --- | --- |
| `KP_COMMERCIAL_EXCLUDED` | 北朝鮮（KP）が発送元かお届け先の場合、商用受付を停止します。 |
| `JP_KP_ORIGIN_OR_LOADING_EXCLUDED` | 日本向け貨物で北朝鮮が商品の原産地か船積地域の場合、商用受付を停止します。 [経済産業省の措置](https://www.meti.go.jp/press/2025/04/20250408002/20250408002.html) |
| `KP_NEXUS_REVIEW` | その他のルートで北朝鮮が原産地か船積地域の場合、担当者が確認します。 [米国財務省の北朝鮮制裁](https://ofac.treasury.gov/sanctions-programs-and-country-information/north-korea-sanctions) |
| `US_IR_CU_TRADE_REVIEW` | 米国への発送、米国からの発送、米国での船積み、または米国規制の適用が確認された取引で、イランまたはキューバが関わる場合、許可や例外の適用を確認します。 [米国商務省のイラン輸出管理](https://www.bis.gov/licensing/country-guidance/iran-export-controls) ・ [米国財務省のキューバFAQ](https://ofac.treasury.gov/faqs/758) |
| `US_JURISDICTION_REVIEW_REQUIRED` | イランまたはキューバが関わる検証ルートで米国規制の適用有無が未確認の場合、確認に回します。 |
| `RU_BY_TRADE_REVIEW` | ロシアまたはベラルーシが関わる場合、品目・相手先・経路を確認します。 [経済産業省の対ロシア等制裁関連](https://www.meti.go.jp/policy/external_economy/trade_control/01_seido/04_seisai/crimea.html) |
| `JP_LOADING_COUNTRY_REQUIRED` | 日本向けの検証ルートは船積地域が確認できるまで保留します。 |
| `PILOT_ROUTE` | 6方向のうち該当する方向で見積もりの検証に進めます。 |
| `ROUTE_OUT_OF_SCOPE` | 商用検証の対象外です。 |

発送元、船積地域、各明細の原産地は注文と物流の記録から取得します。日本の対北朝鮮措置の掲載期間は2025年4月14日から2027年4月13日までです。法令の適用期間とVeygritの提供対象はそれぞれ運用側で管理します。 [経済産業省の措置](https://www.meti.go.jp/press/2025/04/20250408002/20250408002.html)
