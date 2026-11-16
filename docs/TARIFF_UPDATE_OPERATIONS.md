# 税表原本の取得、承認、切り替え

GitHub公開版には公式原本の取得先と取得・検証ツールがあります。同梱の品目別税表マニフェストは空です。以下の収録数、試験結果、候補と取得記録のパスは、過去版のデータ同梱配布物の記録です。

rc.12では、日中米の版検出に加え、各国税関・官報・地域機関が公開する公式原本のURLを登録しています。候補税表は原本・対象日・必須仕向地にひも付けて署名承認します。EC側は対象日に有効な関税根拠がそろうまで、通関費用と支払総額を保留します。

## 公式原本の定期取得

```sh
npm run tariff:acquire -- --output ./private-tariffs/evidence
```

既定の取得先は日中米です。`--sources all` は原本取得経路を登録済みの仕向地を選択します。`--sources in-scope` は北朝鮮を除く248仕向地を選択し、手動照会が必要な仕向地には公式照会リンクを返します。広域での実行時は、運用環境のネットワーク制限と配信元の負荷に合わせ、仕向地を分けて実行できます。各リクエストの既定タイムアウトは45秒です。

```sh
npm run tariff:source-coverage -- --date 2026-11-13
npm run tariff:source-coverage -- --country NF --date 2026-11-13
npm run tariff:acquire -- --sources CA,GB,KE,AU --output ./private-tariffs/evidence
npm run tariff:acquire -- --sources AU --source-ids au_abf_schedule_3_ch69 --output ./private-tariffs/evidence
```

登録済み原本の一部だけを取得するときは、仕向地に対応する取得用IDを `--source-ids` にカンマ区切りで指定できます。記録の `selectedSourceIds` に取得範囲が残ります。この指定では対象IDの取得結果を返します。日中米はそれぞれの版検出を使用します。

`tariff:source-coverage` は、取得経路の一覧と、指定日に利用できる読み込み済み税表の範囲をJSONで返します。税表原本の版と適用範囲は `data/official-tariff-sources.json` の各行に記載しています。指定日を変えると参照できる税表の集計が変わります。

### 仕向地の対応範囲

北朝鮮を除く248仕向地の集計です。

| 取得・照会経路 | 仕向地数 |
| --- | ---: |
| 税表・制度原本の自動取得先 | 197 |
| 税表の手動照会 | 51 |
| 税関当局・通関案内などの公的資料 | 9 |

自動取得のうち170仕向地は基礎税表または無関税の公的根拠に対応し、27仕向地は個別措置、過去税表または通関制度の原本を取得できます。WCO加盟187件すべてに原本取得先または税表照会先があります。各仕向地の登録内容と実取得結果は [248仕向地の試験](ALL_DESTINATION_CYCLE.md) を参照してください。

2026年11月12日の同梱版には、88仕向地の公表税表または基礎税表と23仕向地の照合用資料があります。イスラエルは当局が表示した現地日付の2品目に限定しています。11月13日の通常関税0%の確認はココス諸島、クリスマス島、ノーフォーク島の3仕向地です。島ごとの輸入規制、申告、料金と豪州本土へ移動する場合の税は別途確認します。11月13日分の品目別同梱税表は審査待ちです。

モザンビーク5,642件とイスラエル8,273件の照合用データを `candidates/` に収録しています。モザンビークは改正の影響を受ける19項目の180行を除外しています。各候補の出典、除外理由と再生成手順は 審査候補の説明（配布物の `candidates/README.md`） を参照してください。EC側は照合用税表だけで金額保留を解除しません。

| 取得先 | 原本 |
| --- | --- |
| 日本税関 | 公開一覧で対象となる最新版を見つけ、実行関税率表の96章を取得。 [日本税関の実行関税率表](https://www.customs.go.jp/tariff/index.htm) |
| 中国財政部 | 年次の進出口税則PDF、公告、掲載一覧の主な関税関連通知を取得。 [年次税則の公式一覧](https://gss.mof.gov.cn/gszhs/falvlagui/202105/t20210519_3704655.htm) ・ [関税司の政策公告](https://gss.mof.gov.cn/gzdt/zhengcefabu/) |
| 米国USITC | HTS公式アーカイブの当年最新版JSONを取得。改訂版では第99章PDFも取得します。 [USITCアーカイブ](https://www.usitc.gov/harmonized_tariff_information/hts/archive/list) |

公式原本は登録済みのHTTPS URLから取得します。共有税表は1回の取得で複数仕向地にひも付けます。ダウンローダーはリダイレクト、想定外の形式やサイズ、通常の取得に対する部分応答を拒否します。オマーンとモーリシャスの登録済みPDFは、通常取得が途切れた場合に同じURLから分割取得できます。強いETag、バイト範囲、サイズ、形式がすべて一致した原本を保管します。原本はSHA-256をファイル名にして保管し、繰り返し取得した同一原本は再利用します。取得日時、公式URL、サイズ、仕向地ごとの結果は `evidence/runs/` に残ります。終了コード0は取得済みで審査待ち、2は取得失敗または手動照会、1は入力または処理の失敗です。失敗した仕向地は個別に再実行できます。

EUの年次共通税率表、EAC・ECOWAS・SACU・EAEU・CARICOM・中米の共通税表は、国別の適用日、例外、追加税、輸入税、特恵と照合します。日中米の版検出以外は登録URLの取得です。版を含むURLは、新版公開時に公表元と対象範囲を確認して更新し、`npm run data:manifest` と `npm run data:check` で整合性を検証します。北朝鮮は取得運用の対象外です。

WTOの [Tariff & Trade Data](https://ttd.wto.org/en) と [IDBの提出状況](https://ttd.wto.org/en/resources/data-availability/tariffs-and-import-notifications) は、加盟国の申告データや公表年を照合する補助資料です。適用税率と譲許税率を区別し、対象日の見積もりには各仕向地の法令と税表を確認します。

取得日時と法令の適用日は別項目です。公告・附則・経過措置、品目、原産地、追加税、輸入方式を担当者が確認し、適用が確認できる期間を `availableFrom`・`availableThrough` に記録します。中国の政策公告の取得は掲載一覧の一部です。個別の取引に必要な措置は、担当者が適用範囲と添付原本を確認します。

### 仕向地の確認手順を照会

`GET /v1/tariffs/evidence?country=UM&date=2026-11-13` は、指定日の同梱根拠、登録済みの原本・照会先、現地制度や当局の確認事項を返します。輸入日を省略すると日本時間の当日になります。

| 仕向地 | 先に確認する事項 |
| --- | --- |
| ブーベ島・ハード島とマクドナルド諸島 | 搬入の許可、荷受け先、経由港の手続 |
| 英領インド洋地域 | 入域・貨物許可、個別の免除条件、荷受け権限 |
| ピトケアン諸島・フランス領南方・南極地域 | 現地条例、貨物・検疫条件、適用される税と費用 |
| 米領小離島 | 仕向島、所管機関、島ごとの搬入条件 |
| アフガニスタン・ジブチ・エリトリア | 輸入日に有効な品目別の実行税率、改正と現地課税 |
| ニジェール・トンガ・ザンビア | 国内基礎税表、改正資料と公式照会結果の整合性 |

南極（AQ）の観測基地への補給も同じAPIで確認手順を照会できます。所管当局、活動許可、事前通報と経由港の手続を確認します。南極は商用仕向地の集計に含まれません。

確認日と輸入日は別に管理します。原本を取得した場合も、資料の適用日と対象品目が確認できるまで通関費用を保留します。

### rc.20の取得と更新候補

2026年11月14日（日本時間）に日本、中国本土、米国、英国、EUの登録原本を再取得し、イスラエルの税関当局の品目別照会画面を確認しました。日本2税番、EUの標準関税領域27か国に共通する4税番、イスラエル1税番を、11月14日の通常関税の更新候補として検証しました。米国の1税番は、取得時に米国東部が11月13日だったため、その日の参照として記録しました。

いずれも署名前の記録です。税表の公表欄に加えて、追加関税・原産地・輸入条件・配送業者の手数料の確認が必要です。これらの候補は通常起動時の税表に含まれません。 審査候補の一覧（配布物の `candidates/README.md`） ・ 原本の取得記録（配布物の `qa/tariff-source-refresh-rc20.json`） ・ 署名前の検証結果（配布物の `qa/tariff-candidate-review-rc20.json`）

## 更新候補の作成と承認

1. 公式原本を税表形式に整形します。 `source.json` の `inputFiles[].sha256` と原本のハッシュを一致させます。
2. `tariff:import` で独立した候補ディレクトリを作成します。同梱版と既存追加版で使用済みのIDは、新しい版に再利用しません。
3. 承認準備を実行し、日付、対象国、収録差分、候補の税率、対象原本を確認します。運用中の追加版を引き継ぐ場合は、そのディレクトリも候補に含め、読み込み順を維持します。

```sh
npm run tariff:import -- source.json lines.json ./private-tariffs/new-edition

npm run tariff:verify-update -- --date 2026-11-12 \
  --require JP,CN,US \
  --candidate ./private-tariffs/new-edition \
  --evidence ./private-tariffs/evidence \
  --prepare-review
```

運用中の追加版を明示するには `--active DIR` を加えます。承認準備では `approvalDraft` を出力します。担当者はそのオブジェクトを別ファイルに保存し、`keyId`、`reviewer`、一次出典と判断を追跡できるHTTPSの `referenceUrl` を記入します。対象日・必須仕向地・順序付きマニフェストハッシュは準備結果の値を使います。承認準備で稼働設定は変わりません。

承認担当者はEd25519秘密鍵で署名します。運用担当者は対応する公開鍵を別に登録します。公開鍵ファイルは `{"reviewer-key-id":"-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n"}` 形式です。秘密鍵は承認担当者の管理下に置きます。

```sh
npm run tariff:sign-review -- --draft ./private-tariffs/review-draft.json \
  --private-key /secure/reviewer-ed25519.pem --out ./private-tariffs/approval.json

npm run tariff:verify-update -- --date 2026-11-12 \
  --require JP,CN,US \
  --candidate ./private-tariffs/new-edition \
  --evidence ./private-tariffs/evidence \
  --review ./private-tariffs/approval.json \
  --trusted-keys /secure/tariff-reviewer-public-keys.json
```

署名後に対象日、対象国、マニフェストの内容・順序が変わった場合は再審査します。公開前に検証した候補ディレクトリと承認ファイルを読み取り専用で保持します。

## 切り替えと切り戻し

`verified` の候補で `activation.proposedValue` を `VEYGRIT_TARIFF_DIR` に設定します。 `VEYGRIT_TARIFF_APPROVAL` にその候補の署名承認ファイル、 `VEYGRIT_TARIFF_TRUSTED_KEYS` に登録済み公開鍵ファイルのパスを設定し、サービスを再起動します。サーバー、CLI、Next.js連携例は追加税表の署名とマニフェストを照合してから読み込みます。

切り替え後に対象日の代表品目、EC側の金額表示、日付違いでの保留を確認します。障害時は `rollbackValue` とその構成に対応する承認ファイルに戻します。同梱版だけへ戻す場合は `VEYGRIT_TARIFF_DIR` を空にします。対象日の根拠が切り戻し先にもない場合はECで金額を保留します。

| 検証CLIの終了コード | 意味 |
| ---: | --- |
| 0 | 構造・収録範囲の検証に合格。承認準備の場合は署名待ち |
| 1 | 入力、署名、対象範囲またはファイル検証に失敗 |
| 2 | 未確認日、必須資料不足、収録範囲の後退により保留 |

[税制データの確認と更新](DATA_UPDATES.md) ・ [ECでの金額保留](EC_CUSTOMS_AMOUNT_HOLD.md)

248仕向地の取得・照会と、EC表示、保留、照合を再実行できます。 [248仕向地の試験](ALL_DESTINATION_CYCLE.md) ・ [日中米の試験](PILOT_CYCLE.md) ・ [追加11仕向地の往復試験](WORLDWIDE_CYCLE.md)
