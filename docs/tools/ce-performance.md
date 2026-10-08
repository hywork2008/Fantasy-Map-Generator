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
