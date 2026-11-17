# 出典と税制データの更新

## 優先順位

適用中の一次法令、公式の現行手続、税関・税務当局の現行ガイダンスを優先します。既存のVeygrit調査は候補出典と制度の索引として利用し、税額計算へ直接昇格させません。一般の記事や公開リポジトリに税率があることだけでは、適用条件や再配布権を確認したことにはしません。

EUの暫定関税は、確認済み分類と実際の申告明細数を使います。2026年11月以降の通常申告では、定額関税を適用する申告方式の確認が必要です。11月1日からのEU取扱手数料F00は独立した費目として案内します。 [第7回の条件](SPECIAL_CUSTOMS_PROCEDURES.md)

更新候補のハッシュ、必須仕向地、収録範囲の後退を照合するCLIと、公開時の切り戻し手順を用意しています。 [税表の更新、検証、切り戻し](TARIFF_UPDATE_OPERATIONS.md)

## 更新単位

1. 国・地域ではなく、税関領域、商品、原産地、輸入日、通関方式、徴収主体の組合せを定めます。
2. 一次資料のURL、公開・更新内容、確認日、適用開始・終了日を記録します。改正予定と施行済みを分けます。
3. 税率、基準額、計算基礎、送料・保険、除外商品、合算、本人確認、登録・徴収・申告の条件を確認します。
4. `data/sources.json` に一次出典を追加し、`verification: primary_rechecked`、`checkedOn`、`reviewBy` を設定します。
5. `data/knowledge.json` に自分の言葉で要約を追加し、出典IDを参照します。全文転載や有料HSデータの再配布はしません。
6. 対象の計算を `src/engine.ts` と `data/rules.json` に追加します。税率だけを既存の別制度へ差し替えてはいけません。
7. 少額基準の直前・一致・直後、送料の扱い、除外品、日付境界、旧制度、通貨不一致、資料期限切れをテストします。
8. レビュー担当・確認内容をPRに残してからマニフェストを更新し、チェックを通します。

```bash
npm run data:manifest
npm run openapi
npm run check:public
```

データ同梱配布物では、これに加えて `npm run check` で全テストとデータの整合性を確認します。

`data:manifest` はファイルのSHA-256を更新するだけです。資料を承認する機能でも、改変への暗号学的な署名でもありません。Gitのレビュー履歴とアクセス制御で更新者を管理します。

## 期限の扱い

`validFrom` は適用開始日、`validTo` は適用終了の翌日を示す排他的境界です。`reviewBy` は運用上の再確認期限で、その日の日本時間の終了までを上限とします。輸入日の範囲と、現在の確認期限の両方を満たす必要があります。

`npm run data:review` は再確認が必要な一次出典の一覧をJSONで出し、対象があれば終了コード2を返します。従来の `date`、`ruleSetVersion`、`primarySourcesDue`、`inheritedSourcesPendingRevalidation`、`action` は維持します。`primarySourcesDue` には当日と期限超過の両方が入り、`primarySourcesDueToday`、`primarySourcesExpired`、`primarySourcesUpcoming` で区別できます。現在有効な `data/rules.json` のルールについても同じ期限区分を出します。`validTo` は排他的境界なので、適用を終えたルールや未施行のルールは現在の期限警告に含めません。

確認日が未来の一次出典または現在有効なルールは `unobservedSources`、`unobservedActiveRules` として要確認にします。7日以内の再確認予告のみなら `status: upcoming` と終了コード0、期限当日・期限超過・未来の確認日があれば `status: due` と終了コード2、対象がなければ `status: clear` と終了コード0です。再確認期限は本実装の運用方針で、法令がその日に失効するという意味ではありません。

```bash
npm run data:review -- --warn-days 7
# 日付を固定した検証。--date を付けない本番実行は現在の日本時間の日付を使います。
npm run data:review -- --date 2026-11-18 --warn-days 7
```

## 定期監視とGitHub通知

[期限監視ワークフロー](../.github/workflows/data-review.yml) は、毎日09:17日本時間（UTC 00:17）と手動実行に対応します。スケジュールはGitHub側の混雑で遅れる場合があります。既定ブランチへ反映してGitHub Actionsを有効にすると定期実行の対象になります。ワークフローの追加は初回実行の成功を意味しません。反映後にActionsの `Review customs data deadlines` を手動実行し、要約・JSON成果物・通知Issueを確認してください。 [GitHubのスケジュール仕様](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

検査ジョブはリポジトリ読み取り権限で動き、JSON成果物を30日保存します。通知ジョブだけに `issues: write` を付与し、既定ブランチからの成功した検査結果だけを処理します。PRからは起動せず、手動で選択した他ブランチの検査はIssueを書き換えません。依存パッケージのインストールは書き込み権限を持つ通知ジョブで行いません。

7日以内の期限予告・期限到来・期限超過・未来の確認日を、目印 `veygrit:data-review-monitor:v1` を持つ単一のGitHub Issueへまとめます。同じ対象が続く日次実行は本文更新だけにし、対象や要確認状態が変わったときはコメントで知らせます。すべて解消した場合は同じIssueを閉じ、再発時は再度開きます。重複する管理IssueやGitHub APIエラーは失敗として扱います。レポートの生成・検証に失敗した場合は、既存の警告Issueを解消扱いにしません。ワークフローの成功は検査・通知処理の完了を表し、期限対象がゼロであることは `status` とIssueで確認します。

通知先はGitHub Issueです。担当者はリポジトリのIssuesを有効にし、該当Issueの購読またはWatch設定で受信方法を設定してください。メールやチャットへの独立した送信先設定は含みません。 [GitHub通知の設定](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications)

監視範囲は、リポジトリ同梱の一次出典の再確認期限と現在有効な計算ルールです。原文の更新検知・法改正の自動収集・非公開の運用税表パックの監視はこのワークフローに含まれません。確認期限の自動延長やデータの自動承認は行わず、担当者が根拠と変更範囲を確認して通常のPRで更新します。

## 既存の事前調査

この版は次のVeygrit資料を参照しました。

- `Veygrit_Japan_World_Customs_Register_2026-11-11.json`：国・地域、一次出典の索引、制度要約。
- `Veygrit_30_Countries_EC_Customs_Research_2026-11-11.pdf`：国内・越境・EU域内の区別と業務上の確認項目。

元のPDFや個人ファイルの参照IDは公開用パッケージに含めません。`data/research-provenance.json` が取り込みの範囲を説明します。資料をモデル重みに学習させたのではなく、出典付き検索データへ整理しています。

既存資料にある将来の改正予定や一国だけの特例は、この版の一般的な計算ルールにしていません。中国の一律税率、米国の旧少額免税、EUの旧免税、RCEP等の加盟だけによる特恵適用も自動設定しません。

## 拡張するデータ

国別品目税率を追加する場合は、国別の関税細分とHS版、原産地・証明、AD/CVD等の追加税、物品税、VAT/GST/地方税、丸め、許認可、特殊地域、低額制度の登録主体まで保持してください。提供元の利用規約とデータ再配布条件を確認し、鍵付きデータや契約データは公開リポジトリに含めない構成にします。
