# 都市の住宅数を一括比較する

```sh
npm run housing:export -- "temp/Bac Trang 2026-10-03-10-13.fmg" temp/housing-inputs.csv
npm run housing:batch -- temp/housing-inputs.csv temp/housing-results.csv
```

exportは削除済み都市とID 0を除く全都市を出力する。末尾に都市IDや完全一致の名前を指定すると対象を絞れる。同名都市はすべて対象になり、重複指定は除く。

```sh
npm run housing:export -- "temp/Bac Trang 2026-10-03-10-13.fmg" temp/housing-selected.csv 157 207 Crild
npm run housing:batch -- temp/housing-selected.csv temp/housing-selected-results.csv
```

CSVはUTF-8 BOM付きで、Excelでも日本語を読みやすくしている。人口・dwellings・seed・規模・範囲・城壁・港・河川数などの確認用列と、CEに渡す完全な入力である `share_json` を保存する。JSONには道路や河川の形状、地形、生成設定も含む。比較時には元のFMGを必要としない。

`max_bridge_crossing_meters` は時代設定と明示指定から解決した通常橋の横断総延長上限。複数径間を含み、単一支間の長さではない。旧列 `max_bridge_span_meters` は互換用に同じ値を出力する。上限を指定する場合は `share_json` 内の `descriptor.transport.maxBridgeCrossingMeters` を編集する。旧 `maxBridgeSpanMeters` の50m・1,000mは旧デフォルトとして時代別上限へ読み替える。

`share_json` が生成入力の正本で、通常の列は確認用。入力を変更して試す場合はJSON内の対応する値を編集する。例えばdwellingsは `descriptor.burg.dwellings`、生成seedは `seed`。burg_idとJSON内の都市IDは一致させる。source_extent_metersはFMG側の元の範囲を保持する。生成コードの補正を検証する際は、同じ入力CSVをそのまま再利用できる。

比較は都市ごとに新しい生成と建物キャッシュを使い、CEと同じ生成処理を実行する。全都市は時間がかかるので、まず対象を絞って試すことを推奨する。進捗を標準エラーに表示する。既存の出力パスは上書きされる。入力CSVと出力CSVに同じパスを指定しても動作するが、再比較のため入力を別に保存しておくと便利。

結果は入力列を残し、以下の列を追加する。

| 列 | 意味 |
| --- | --- |
| houses / houses_core / houses_outskirts | 住宅数、中心部、郊外。ランドマークや非住宅付属棟を除く |
| buildings / buildings_core / buildings_outskirts | CEの「建物」に相当する全建物数 |
| houses_minus_dwellings | 住宅数 − 入力dwellings。正なら過剰、負なら不足 |
| absolute_gap | 差の絶対値。この値の降順で出力 |
| houses_per_dwelling | 住宅数 / dwellings（小数点以下2桁） |
| relative_gap | 差 / dwellings。例: 0.5は50%過剰、-0.2は20%不足 |
| generated / generation_seed / error | 生成成功、生成seed、失敗理由 |
| failure_reasons | 各通常試行の具体的な不採用理由。セミコロン区切り |
| generation_diagnostics_json | 不採用試行と固定橋アプローチの構造化診断 |

dwellingsが0なら比率は空欄。生成失敗や不正な入力の都市はerrorに理由を残して処理を続け、差は空欄として末尾に並べる。CSV全体の形式不正やFMG読み込み失敗はコマンドを失敗させる。住宅不足の優先度はhouses_minus_dwellingsの昇順、規模に対する差はrelative_gapの絶対値で表計算ソフトから確認できる。

既存の `housing:compare` は従来通りJSONを出力する。バッチツールも既存のjsdom/Vitest実行環境を使い、CEのブラウザ依存処理を再現する。ブラウザとNodeの幾何処理差により、一部の都市で住宅数がわずかに異なる場合がある。

FMGの都市別descriptor出力に失敗した場合も、その都市を `export_error` 列に記録して、他の都市の出力を続ける。生成失敗では建物数の集計を行わず、住宅との差を空欄にする。

## 都市生成の失敗を継続的に検査する

住宅集計が不要な生成障害の検査には `ce:audit` を使う。同じ `housing:export` の入力CSVから、CEと同じ初期ドキュメント・設定・seedで通常の最大8試行を実行する。入力JSONや街道の数を補正して成功扱いにはしない。

```sh
npm run housing:export -- "temp/000.savdata/Vilealand 2026-10-04-15-32.fmg" temp/vilealand-ce-inputs.csv
npm run ce:audit -- temp/vilealand-ce-inputs.csv temp/ce-before.jsonl --workers 4

# 同じコード・入力で中断箇所から再開する
npm run ce:audit -- temp/vilealand-ce-inputs.csv temp/ce-before.jsonl --resume

# 修正後、以前の失敗都市だけを新しい結果ファイルに再検査する
npm run ce:audit -- temp/vilealand-ce-inputs.csv temp/ce-after.jsonl --failed-from temp/ce-before.jsonl

# 指定都市の通常試行がすべて失敗した場合に、別の再実行で最初の不採用案も保存する
npm run ce:audit -- temp/vilealand-ce-inputs.csv temp/ce-selected.jsonl --burg 13,26 --debug-dir temp/ce-debug
```

出力JSONLは都市ごとに即時追記する。`status` は `generated` / `rejected` / `error` / `timeout` / `worker-exit` / `interrupted`。タイムアウトや中断の `generated` は `null` であり、通常8試行の生成失敗とは分けて扱う。`failures` は試行番号、工程、理由、数値、詳細を保持し、`routing` には失敗した道路探索の頂点・到達数・禁止辺とその理由を保存する。成功までの途中で不採用になった理由も残るため、失敗都市の判定には `status` を使う。`completeFixedApproaches` は最終試行の固定橋アプローチがすべて採用されたかを表す。

`inputRoads` は街道のsourceIndex・routeId・実際の都市メッシュ端での入口座標と、道路幅を含めた測量済み水面との重なりを記録する。`surveyedEndpointTouchesWater` は入口、`surveyedPathTouchesWater` は元の予定経路全体を対象とする。測量済みの固定水面がない入力では `null`。水面との重なりだけで入力不正や生成失敗とは判定しない。登録済みの直角橋を通る経路でも重なりは発生するため、道路探索と橋の診断を併せて確認する。

併せて `.meta.json` に入力CSV・生成コードのハッシュ、Nodeバージョン、タイムアウトを保存し、`.summary.json` に状態別件数と失敗理由の件数を保存する。理由が複数ある都市は理由別集計で重複する。既存出力は上書きせず、`--resume` では入力・コード・実行条件の一致を確認する。コードを修正した場合は新しい出力先にする。`--failed-from` では入力ハッシュの一致だけを要求し、修正コードでの比較を可能にする。

`--workers` は1〜16（既定4）、`--timeout-ms` は都市ごとの上限（既定120000）、`--limit` は今回処理する未完了都市数。CPU処理が止まったワーカーは終了させ、次の都市を別ワーカーで処理する。Ctrl-Cで中断した都市は再開時に再検査する。壊れたチェックポイントはエラーにして停止する。CSVと結果は別のパスに保存する。

生成結果と失敗案プレビューは別物である。`--debug-dir` の再実行は通常試行の成否を変更せず、プレビューを成功として集計しない。この検査はjsdomとViteのモジュール実行環境を使い、実ブラウザでの描画確認までは行わない。

Vilealandでの修正前後の全都市検査と未解決ケースは [2026-10-04の診断](../diagnostics/ce-fmg-generation-vilealand-2026-10-04.md) を参照。

FMG側の道路生成・河川横断・都市配置を変更した場合は、保存されたFMGから `housing:export` を新しいCSVへ再実行する。現在のexportは、実測水面と乾いた両岸アプローチを検証できる複数の街道をFMG側で共通橋へ収束させてから、CEの入口・固定橋・対岸分岐を出力する。以前のCSVの再検査だけではFMG側の修正を検証できない。CSVが変わるため、旧結果からの `--failed-from` は使わず、全都市か `--burg` で対象を指定する。

共通橋では `descriptor.roads` の入口数が元の街道数より少なくなる。`sharedRouteIds` と `sharedBranches`、`nextBurgs` を併せて確認し、道路や行き先の欠落と混同しない。また、`status: generated` と `completeFixedApproaches: true` は別の検査結果である。[Vilealandの共通橋の検証](../diagnostics/fmg-shared-river-roads-vilealand-2026-10-04.md)を参照。
