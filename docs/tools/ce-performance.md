# 保存したFMGの都市をCLIで計測する

`ce:perf` は保存済み `.fmg` からCE用入力を取得し、都市を順次生成して工程別の所要時間を保存する。都市ID・完全一致の名前での絞り込み、入力一覧CSV、同じ入力の反復計測に対応する。AIモデルから通常のCLIコマンドとして実行できる。

## FMGを直接指定する

```sh
# 指定した都市を、それぞれ3回生成する
npm run ce:perf -- "temp/world.fmg" temp/ce-performance.jsonl --burg 13,26 --repeat 3

# 一都市を計測し、建物を含むSVG構築時間も記録する
npm run ce:perf -- "temp/world.fmg" temp/ce-one.jsonl --burg 13 --render

# 都市名でも指定可能。同名の都市はすべて選択される
npm run ce:perf -- "temp/world.fmg" temp/ce-named.jsonl --name "都市名"

# 初めの5都市だけ試す。対象指定を省くと全都市を順次処理する
npm run ce:perf -- "temp/world.fmg" temp/ce-first-five.jsonl --limit 5
```

ID 0・削除済み都市を除き、重複指定は除く。不明なID・名前はコマンドを失敗させる。FMGの都市ごとのdescriptor作成に失敗した場合は、その都市のエラーを保存して他都市を続ける。都市の位置、川、道路や橋の入力を変更して成功扱いにする処理は行わない。

## 都市一覧を保存してから計測する

```sh
# CEの完全な入力と都市ID・名前・人口・seed・規模をCSVに保存
npm run ce:perf -- "temp/world.fmg" temp/ce-inputs.csv --list

# 一覧から一都市を選ぶ
npm run ce:perf -- temp/ce-inputs.csv temp/ce-selected.jsonl --burg 13 --repeat 3

# 一覧の全都市を順次計測
npm run ce:perf -- temp/ce-inputs.csv temp/ce-all.jsonl --timeout-ms 120000

# housing:exportで保存した既存の一覧も利用できる
npm run ce:perf -- temp/housing-inputs.csv temp/ce-housing-inputs.jsonl --burg 13,26
```

CSVの `share_json` が生成入力の正本。入力CSVは生成設定を固定して性能改善の前後比較に再利用できる。列を編集して都市を除く場合はCSV形式を保つ。`--burg` と `--name` は合併して選択し、`--limit` はその選択結果に適用する。CSVは一覧順、FMGで明示した対象は指定順（同名都市内はFMG順）に処理し、同じ都市の反復を終えてから次へ進む。

FMG直接指定では再現用に `<report.jsonl>.inputs.csv` も保存する。`--list` のCSVにはdescriptor作成・JSON化・共有入力への変換時間も含む。既存housing用CSVにはこれらの時間がないため、FMG側の時間が必要なら `.fmg` から再取得する。

FMGデータ作成コードを変更したときは、新しいFMG入力一覧を出力する。CE生成処理だけの変更では同じCSVをそのまま使う。

## 結果と測定範囲

| ファイル | 内容 |
| --- | --- |
| report.jsonl | 都市・反復ごとの時間、工程、試行番号、失敗理由。完了ごとに即時追記 |
| report.jsonl.summary.json | 状態別件数、都市別の成功回数と各時間の最小・中央値・平均・p95・最大 |
| report.jsonl.meta.json | 入力とコードのSHA-256、Node・CPU・OS、実行条件、FMG読み込み時間 |
| report.jsonl.inputs.csv | FMG直接指定時の再現用一覧 |

`--list` は指定CSVとその `.meta.json` を保存する。既存の出力ファイルは上書きしない。修正前後や再計測では別の出力名を指定する。

JSONLの時間はすべてms。

| 項目 | 意味 |
| --- | --- |
| fmgTimings.fmg_descriptor_ms | FMG側の都市・地形・周辺地域descriptorの作成 |
| fmgTimings.fmg_serialize_ms | descriptorのJSON化 |
| exportTimings.export_share_parse_ms | descriptor解析・検証とCE共有入力への変換 |
| exportTimings.export_share_serialize_ms | 再利用する共有入力JSONの保存用シリアライズ |
| timings.incomingParseMs | 保存したshare_jsonの解析・入力検証 |
| timings.gridMs | CEと同じ初期グリッドの作成 |
| timings.settingsMs | CEと同じ生成設定・descriptorの適用 |
| timings.generationMs | CEの完全生成処理。通常の最大8案の再試行と結果準備を含む |
| timings.svgBuildMs | `--render` 時の、建物を含む詳細表示SVGの初回構築 |
| timings.rendererImportMs | `--render` 時の描画モジュール読込 |
| totalMs | Worker内の入力解析から計測処理完了まで。描画指定時は描画モジュール読込とノード数集計も含む |
| bootstrapMs | Worker内のjsdom・Vite実行環境・生成モジュールの初期化 |
| taskWallMs / processMs | 親側で見た要求送信以降／プロセス起動以降の経過時間 |
| phases | 既存CEタイマーの工程別時間・attempt・件数・不採用理由。描画工程はrender.接頭辞 |

FMG側の時間は入力一覧の作成時に一度だけ測る。各反復の `fmgTimings` / `exportTimings` はその値の参照であり、反復ごとに再取得した時間ではない。CSVから実行すると、これらは以前の出力時の時間または `null`。FMG全体の読込は `.meta.json` の `archiveReadMs` に保存し、都市ごとの時間に加算しない。

CSV計測は正規化済み共有入力から開始する。実際のFMG→CEでは生descriptorからの共有入力変換も必要となるため、その費用は `export_share_parse_ms` を参照する。保存用の `export_share_serialize_ms` はCLI再現用の追加処理である。複数の工程は包含関係があるため、`generationMs` とその内訳 `phases` を足し合わせない。

`status` は `generated` / `rejected` / `error` / `render-error` / `timeout` / `bootstrap-timeout` / `worker-exit` / `interrupted`。`rejected` は通常の再試行ですべて不採用、`render-error` は生成後のSVG処理失敗。タイムアウト・プロセス終了・中断の `generated` は `null`。不正入力などの `error` は生成失敗と区別する。集計統計は `status: generated` の回だけを使用し、成功回がなければ `null`。少数反復のp95はほぼ最大値なので、中央値と生の結果も確認する。

## 再現性と中断

都市ごと・反復ごとに新しい子プロセスを使い、他都市の建物キャッシュやメモリを引き継がない。計測は常に順次実行する。ブラウザのCEと同じ `cityEditorDocument` / `cityEditorSettings` / `generateCityOnDocument` を使用し、seedも固定する。ウォームアップ済みの同一プロセスを反復する方式ではないため、各反復のJIT初期費用を含む。

`--timeout-ms` は都市の計測要求送信後の上限（既定120000、1000以上）。`--render` を指定した場合はSVG構築もこの上限に含む。CPUループが停止しても親側でプロセスを強制終了して、残った都市・反復を処理する。進捗工程を受信できていれば `phases` / `lastSample` を結果に残す。環境初期化には別途60秒の上限、FMG読込と一覧準備全体には `--prepare-timeout-ms`（既定600000）の上限がある。

Ctrl-Cは実行中の都市を `interrupted` として保存し、終了コード130で停止する。完了済みJSONLは残る。再開の自動機能はないため、未完了都市を `--burg` で選択して別の出力へ実行する。都市単位の失敗は結果を保存して継続し、コマンドは終了コード0。CLI引数・一覧形式・FMG読込などの全体エラーは終了コード1。

比較は同じCSV・反復数・描画指定・Nodeバージョン・マシンで行い、他の高負荷処理と同時実行しない。Node/jsdomの幾何処理やDOM費用は実ブラウザと異なる可能性がある。このツールはタブ起動、sessionStorage、新規Workerへの都市ドキュメント転送、CE UI・履歴・索引構築、画面レイアウトやGPU描画を測定しない。`processMs` はCLI実行環境の費用であり、CEタブの起動時間ではない。ブラウザの起動計測と、生成コードの性能比較に使う本ツールの時間を混同しない。

## FMGデータ作成とCE生成の内部時間

内部の計測結果は通常実行でもJSONLに保存する。`--details` を付けると、FMGとCEそれぞれの階層表を標準エラーにも表示する。

```sh
npm run ce:perf -- "temp/000.savdata/Conland 2026-10-08-06-04.fmg" temp/ce-feltashbrid-detail.jsonl --burg 27 --details

# 一覧作成時のFMG側の内訳だけを確認する
npm run ce:perf -- "temp/world.fmg" temp/ce-detail-inputs.csv --list --burg 13 --details

# 同じ入力でCE内部の各工程を3回計測する
npm run ce:perf -- temp/ce-detail-inputs.csv temp/ce-detail-results.jsonl --repeat 3 --details
```

JSONLの `fmgBreakdown` はdescriptor作成、`generationBreakdown` はCE完全生成処理の内訳。FMG入力一覧には `fmg_breakdown_json` として保存し、CSVからの計測でも引き継ぐ。古いCSVにこの列がなければ `fmgBreakdown` は `null`。FMG側の内訳を新たに測る場合は `.fmg` から一覧を再取得する。

各行は次の形式を持つ。

```json
{
  "path": "generation/attempt-1/fit-housing/sample-house-count/block-fabric",
  "parent": "generation/attempt-1/fit-housing/sample-house-count",
  "depth": 4,
  "calls": 2,
  "elapsedMs": 900,
  "selfMs": 5
}
```

`elapsedMs` は子工程を含む総時間、`selfMs` は計測した直接の子工程を差し引いた時間。`calls` は同じ親の下での呼出し回数。繰り返しの建物生成・橋候補検証などは、同じ `path` に所要時間と回数を集約する。1回平均は `elapsedMs / calls` で計算できる。`selfMs` はその関数全体の純粋なCPU時間ではなく、まだ個別計測していない処理、呼出し準備、計測器の管理費用なども含む。

親の `elapsedMs` と子の時間は足し合わせない。一つの木の全行の `selfMs` 合計は、根の `elapsedMs` に一致する（浮動小数点の丸め差を除く）。CLIの表は `inclusive(ms) / self(ms) / calls` の順。所要時間はms、小数点以下3桁で表示する。名前は階層に従って字下げする。

FMGの主な工程：

| path末尾 | 対象 |
| --- | --- |
| world-road-convergence | 世界全体の街道と共通河川横断の準備 |
| coastal-route-neighbours | 海岸付近の道路隣接点の再配置 |
| crossing-candidates / converge-road-legs | 橋候補の作成・検証、複数の街道の共通橋への収束 |
| river-geometry / water-index / terrain-query | 実測河川形状、水面索引、支持地盤 |
| canonical-frontage / display-frontage / canonical-water | 河岸、表示枠、固定水面の取得 |
| roads / route-legs / route-render-points | 都市に接続する街道、経路の描画形状 |
| rivers / coastline / terrain | 河川、海岸線、標高・傾斜・高さサンプル |
| nearby-settlements / regional-context / assemble-descriptor | 周辺集落、地域情報、連携データの組立て |

世界全体の準備は都市の局所処理と異なり、同じ一覧作成プロセスでキャッシュを共有する。最初の都市が初期費用を負担し、後続都市はキャッシュが使える場合がある。都市ごとの `world-road-convergence` とその子工程を確認して比較する。

CEの主な工程：

| path末尾 | 対象 |
| --- | --- |
| attempt-N | 通常の第N案。失敗した案も別々に保存 |
| prepare / plan / apply-plan | 準備、都市計画、メッシュへの適用 |
| finish-geometry / rectify-hex / rectify-voronoi | 道路・街区の幾何形状の仕上げ |
| fabric-plan | 道路で区切った地区計画 |
| fit-housing | FMGのdwellingsに合わせる住宅数調整 |
| initial-house-count / sample-house-count | 調整前と占有率候補ごとの住宅数算出 |
| block-fabric / legacy-fabric / local-fabric | 街区の建物・路地・区画の再構築 |
| districts / district-mesh / finish-fabric | 地区分割・統合メッシュ・土地利用の仕上げ |
| coastal-reservations / harbor-fabric | 海岸・水面・固定道路・堀などとの建物干渉判定、港湾空間 |
| harbor-ships / ship-plan | 港湾船の計画・配置。その中で必要になる建物再構築も子工程で区別 |
| cemetery-sync / cemetery-layouts / roadside-fields | 墓地と沿道の農地 |
| fixed-crossing-approaches / scene-regions | 固定橋への接続、周辺地域との連携 |
| recipe-input-clone / recipe-settings-clone | 再現用の入力・設定のコピー |

既存の `phases` も引き続き保存する。そちらのタイマーは区間計測と親工程の総時間が混在するため、内部時間の比較は新しい階層付きの内訳を使う。`.summary.json` の都市別 `generationBreakdown` に各pathの総時間・self時間・呼出し回数の統計を追加する。未実行の工程は0msの測定として扱わず、統計の件数は実際にその工程を通った成功回数になる。都市別の `fmgBreakdown` は一覧作成時の一回分を保持し、CEの反復回数だけFMGを再測定したものとは扱わない。

計測器はCLIが明示的に渡したときだけ内部タイマーを動かす。時間計測には追加費用があるため、以前の計測値との差だけで性能の改善・悪化を判断しない。同じ計測コード・入力・環境で反復比較する。エラー終了時も、終了した同期呼出しの内訳を記録する。強制終了・タイムアウトでは新しい内訳を回収できない場合があり、その場合は従来の `phases` / `lastSample` を参照する。
