# ECでの通関金額の保留

`POST /v1/checkout/preview` と通関計画の `checkout` に、商品小計 `goodsSubtotal` と `customsAmountHold` を返します。通関費用が確認中でも、商品小計を購入者に表示できます。

| 状態 | ECでの扱い |
| --- | --- |
| `DATED_TARIFF_REFERENCE_REQUIRED` | 対象日の有効な関税根拠が不足。通関費用を確認中と表示 |
| `REQUOTE_REQUIRED` | 見積期限を過ぎたか、再見積もりが必要。以前の通関金額を保留 |
| `CUSTOMS_ROUTE_REVIEW_REQUIRED` | 取引・配送経路の確認が必要。通関金額を保留 |
| `IMPORT_CHARGES_UNRESOLVED` | 税・手数料に未確定費目が残る。支払総額の確定を保留 |

`customsAmountHold.required` が真の間は、商品小計を表示し、通関費用と支払総額は「確認中」と表示します。 `null` は未確定を表します。Next.js連携例では、この値を表示用データに引き継ぎます。 [Next.jsの表示例](../integrations/nextjs/checkout-display.ts.example)

`POST /v1/pilot/quote` と `POST /v1/worldwide/quote` では、対象日・品目の有効な根拠がない場合、`DATED_TARIFF_REFERENCE_REQUIRED` の指摘を付けて見積もりを保留します。保留中の関税・税・手数料と購入者総額は未確定です。審査用の見積もりは `status`、`expiresAt`、`checkoutReady` を確認して取り扱います。決済と配送の確定は加盟店側の承認と運用に従います。

加盟店の確認画面では、`GET /v1/tariffs/evidence?country=UM&date=2026-11-13` で、仕向島や受入れ条件などを確認できます。照会に出る公的資料は、個々の注文の通関費用と配送可否の確認に使います。

[OpenAPI](openapi.json) ・ [税表の取得・署名承認](TARIFF_UPDATE_OPERATIONS.md)
