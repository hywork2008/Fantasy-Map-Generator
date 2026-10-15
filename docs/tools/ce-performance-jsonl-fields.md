# ce:perf JSONL 1行の項目説明

`npm run ce:perf` が出力する `report.jsonl` の1行は、1都市の1回の計測結果（都市 × 反復）を表す。
時間はすべてms。コマンドの使い方は [ce-performance.md](ce-performance.md)、集計は [ce-performance-query.md](ce-performance-query.md) を参照。

生成元：

- `scripts/benchmarkFmgCities.mjs`：親プロセス。Worker結果に `schemaVersion` `burgId` `name` `run` `fmgTimings` `exportTimings` `fmgBreakdown` と、親側で測る `processMs` `bootstrapMs` `taskWallMs` を足す。
- `src/city-editor/services/analysis/cityGenerationPerformance.ts`（`measureCityPerformance`）：Workerで実際に測る本体。

## 1. 共通項目（status によらず出る）

| 項目 | 型 | 意味 |
| --- | --- | --- |
| schemaVersion | number | JSONL形式の版。現在 1 |
| burgId | number | FMGの都市ID（入力CSVの `burg_id`） |
| name | string | 都市名 |
| run | number | 反復番号。`--repeat N` のとき 1〜N |
| status | string | 結果の状態（§2） |
| generated | boolean \| null | CE生成結果（都市）が得られたか。timeout・worker-exit・interrupted・boo tstrap-timeout では `null` |
| processMs | number | 親から見た、子プロセス起動から終了までの時間。jsdom・Vite初期化を含むCLI側の費用で、CEタブの起動時間ではない |
| bootstrapMs | number | Worker内の jsdom・Vite実行環境・生成モジュールの初期化時間 |
| taskWallMs | number | 親から見た、計測要求を送ってから結果が返るまでの時間。`ready` 受信前に終わると出ない |
| phases | array | CE既存タイマーによる工程サンプルの一覧（§5） |
| generationBreakdown | array \| null | CE生成の階層付き内訳（§6）。取れなければ `null` |
| fmgBreakdown | array \| null | FMG側descriptor作成の階層付き内訳（§6）。古いCSV由来なら `null` |
| fmgTimings | object \| null | FMG側の時間（§4） |
| job | number | 計測したWorkerの番号（`--jobs N` で 1〜N） |
| warmRun | number | `--warm` のとき、そのWorkerで何回目の生成か（暖機の回を含む） |
| fabricBuilds | object | 生成中の `buildBlockFabric` 呼び出し回数。キーは呼び出し時の工程パス（`attempt-N` は `attempt-*`）、値は `{ built, cached }`（`cached` は文書ごとのキャッシュが答えた回）。港の船の計画（`buildHarborPlan`）での構築も含む |
| exportTimings | object \| null | descriptor→共有入力の変換時間（§4） |

## 2. status の値

| 値 | 意味 |
| --- | --- |
| generated | 生成成功。集計（summary.json）の対象はこの回だけ |
| rejected | 通常の再試行（最大8案）がすべて不採用で、都市が得られなかった |
| error | 不正入力・例外など。`error` に理由が入る |
| render-error | 生成は成功したが、`--render` のSVG処理で失敗（`generated: true`） |
| timeout | `--timeout-ms` 超過で強制終了。`lastSample` が残ることがある |
| bootstrap-timeout | Worker初期化が60秒以内に終わらなかった |
| worker-exit | Workerが異常終了 |
| interrupted | Ctrl-Cで中断 |

## 3. 生成成功時（generated / rejected）に出る入力・結果項目

| 項目 | 型 | 意味 |
| --- | --- | --- |
| seed | string | 都市の生成seed（`share.seed`＝FMG burg の seed）。固定されるので再現可能 |
| generationSeed | string \| null | 生成結果が実際に採用した seed。不採用なら `null` |
| grid | string | 初期グリッド種別（例：`evolution`）。FMG由来の入力では通常 `evolution` |
| size | string | 地図サイズのプリセット（表示枠の大きさ）。`extentMeters` や人口から選ばれる |
| population | number | FMG側の都市人口 |
| dwellings | number | 目標住宅数（FMGのdwellings）。CEはこれに合わせて住宅数を調整する。人口＝建物数ではない |
| faces | number | 生成前（初期グリッド）のメッシュ面数 |
| generatedFaces | number \| null | 生成後のメッシュ面数。不採用なら `null` |
| attempts | number | 使った試行の最大 attempt 番号（`render.` 以外の phases から算出）。最大8 |
| svgNodes | number \| null | `--render` 時のSVG要素数。`--render` なしは `null` |
| spatialMetrics | object \| null | 面積指標（下表）。生成結果がなければ `null`。`--render` なしでも測る |
| housingFit | object \| null | 住宅数の調整結果（`HousingFitStats`）。`dwellings` が目標、`finalHouses` が最終の住宅数 |
| quality | object \| null | 完成した都市の品質指標（下表）。生成時間の外で測り、`timings.qualityMs` に時間が入る |

### quality

| 項目 | 意味 |
| --- | --- |
| buildings | エディタが描く建物数（`buildBlockFabric` の結果） |
| buildingFootprintMeters2 | 建物の延べ面積 m² |
| lanes | 路地の本数 |
| crossingIssues | 完成した都市で `explainGeneratedCrossingFailures` を再実行した違反数。0であるべき |
| overSkewedBridges | 時代・技術の斜角上限（`bridgeSkewPolicy.ts`）を超える橋の数。0であるべき |
| drawnHousing / targetDwellings | エディタが描く区画で、住宅数の調整と同じ数え方（住戸の収容数）で数えた住宅数と、目標住宅数。`housingCapacity` のある都市のみ。`housingFit.finalHouses` は調整側の値で、S2 以降は見積りのため描画と少しずれることがある |
| ships / shipsNearPier | 生成された船の数と、そのうちエディタが描く桟橋から 15 m 以内にある数。船のない都市では出ない |
| roadGroups / gates | 道路グループ数・門の数 |

### spatialMetrics

| 項目 | 意味 |
| --- | --- |
| frameExtentMeters | 表示枠の一辺（m） |
| frameAreaMeters2 | 表示枠全体の面積（m²） |
| meshAreaMeters2 | 生成後の編集メッシュ面積（m²、水面・郊外含む） |
| coreAreaMeters2 | 陸地の `core` 区画の面積 |
| outskirtsAreaMeters2 | 陸地の `outskirts` 区画の面積 |
| urbanAreaMeters2 | 市街地面積＝core＋outskirts。建物面積ではなく広場・公園も含む |
| backgroundAreaMeters2 | 表示枠面積－市街地面積。水面・農地・メッシュ外の周辺描画を含む |
| urbanFrameRatio / backgroundFrameRatio | 表示枠に対する市街地／背景の割合（0〜1） |
| urbanMeshRatio / backgroundMeshRatio | 編集メッシュに対する市街地／非市街地の割合（0〜1。メッシュ面積0なら `null`） |
| meshFrameRatio | 表示枠に対する編集メッシュの割合（0〜1） |

サイズ調整では `size`・`dwellings` と `urbanMeshRatio` を見比べると、メッシュ内の余白を判断できる。

## 4. 時間項目

### timings（Worker内で都市ごとに測る）

| 項目 | 意味 |
| --- | --- |
| incomingParseMs | 保存済み `share_json` の解析・入力検証 |
| gridMs | CEと同じ初期グリッドの作成 |
| settingsMs | CEと同じ生成設定・descriptorの適用 |
| generationMs | CEの完全生成処理。最大8案の再試行と結果準備を含む。**性能比較の主指標** |
| spatialMetricsMs | `spatialMetrics` の計算時間。`generationMs` には含まれない |
| rendererImportMs | `--render` 時の描画モジュール読込（`svgBuildMs` には含まれない） |
| svgBuildMs | `--render` 時の、建物を含む詳細SVGの初回構築 |

エラー時は、そこまでに終わった工程だけが入る。

### totalMs

Worker内の入力解析から計測完了まで。`--render` 時は描画モジュール読込・ノード数集計も含む。`bootstrapMs` は含まない。

### fmgTimings / exportTimings（入力一覧作成時に一度だけ測った値）

各反復で再測定した値ではなく、入力CSVに保存された値の参照。CSV（housing用など）に列がなければ `null`。

| 項目 | 意味 |
| --- | --- |
| fmgTimings.fmg_descriptor_ms | FMG側の都市・地形・周辺地域descriptorの作成 |
| fmgTimings.fmg_serialize_ms | descriptorのJSON化 |
| exportTimings.export_share_parse_ms | descriptorの解析・検証とCE共有入力への変換 |
| exportTimings.export_share_serialize_ms | 共有入力JSONの保存用シリアライズ（CLI再現用の追加処理） |

FMG全体の読込時間は各行ではなく `.meta.json` の `archiveReadMs`。

## 5. phases

CE既存タイマーによる工程サンプルの配列。1要素は次の形。

| 項目 | 意味 |
| --- | --- |
| phase | 工程名。`--render` の描画工程は `render.` 接頭辞 |
| elapsedMs | その工程の時間 |
| attempt | 何案目か（1〜8） |
| counts | 件数など（任意） |
| failure | 不採用時のみ。`reason` / `message` / `details` |

区間計測と親工程の総時間が混在するため、**足し合わせない**。内部時間の比較には `generationBreakdown` を使う。timeout・interrupted では、最後に受け取ったサンプルが `lastSample` として付く。

## 6. generationBreakdown / fmgBreakdown

階層付きの工程内訳。1要素は次の形。

| 項目 | 意味 |
| --- | --- |
| path | `/` 区切りの工程パス（例：`generation/attempt-1/fit-housing`） |
| parent | 親のpath |
| depth | 階層の深さ |
| calls | 同じ親の下での呼出し回数。同じ `path` に集約される |
| elapsedMs | 子工程を含む総時間（inclusive） |
| selfMs | 計測済みの直接の子を引いた時間（self）。未計測処理・計測器の管理費用も含む |

- 親の `elapsedMs` と子を足さない。1つの木の全行の `selfMs` 合計は根の `elapsedMs` に一致する（丸め差を除く）。
- 1回平均は `elapsedMs / calls`。
- `fmgBreakdown` は一覧作成時の1回分で、反復ごとの再測定ではない。
- 強制終了・タイムアウトでは新しい内訳を回収できない場合がある。

## 7. 失敗時のみの項目

| 項目 | 意味 |
| --- | --- |
| error | 失敗理由（`error` / `render-error`、またはprepare由来のメッセージ）。スタックまたはメッセージ文字列 |
| lastSample | timeout / interrupted / bootstrap-timeout で、最後に受け取った工程サンプル |

失敗行には `seed` `size` `faces` `attempts` `svgNodes` などは出ない。

## 8. 読み方の注意

- 反復ごとに新しい子プロセスを使うため、JIT初期費用を含む。ウォームアップ済みの値ではない。
- 比較は同じCSV・反復数・描画指定・Nodeバージョン・マシンで行う。
- 少数反復のp95はほぼ最大値になる。中央値と生の行も確認する。
- jsdom/Node上の値であり、実ブラウザ・UI・GPU描画の時間とは異なる。
