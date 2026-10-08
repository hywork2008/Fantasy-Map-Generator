# FMGの地図生成をCLIで計測する

`fmg:perf` は実際のChromium（Playwright）でFMGを開き、固定seedの地図生成を順次実行して、工程別の所要時間と生成結果の指紋を保存する。地図生成の高速化リファクタリングで、変更前後の時間と「同じ地図ができること」を同時に確認するために使う。AIモデルから通常のCLIコマンドとして実行できる。

初期化の流れは [地図初期化プロセス](../map-initialization-process.md) を参照。

## 実行する

```sh
# 既定: 拡張機能すべてOFF、seed 3種 × 3回、初回ロードの生成を計測
npm run fmg:perf -- temp/fmg-perf/before.jsonl

# 工程の階層表を標準エラーに表示する
npm run fmg:perf -- temp/fmg-perf/one.jsonl --seed 100000001 --repeat 1 --details

# 地図を開いた後の「新しい地図」（regenerateMap）を同じページで繰り返す
npm run fmg:perf -- temp/fmg-perf/regen.jsonl --mode regenerate --seed 100000001 --repeat 5

# 本番ビルドで計測する（一時ディレクトリへ vite build。dist は変更しない）
npm run fmg:perf -- temp/fmg-perf/prod.jsonl --server preview

# 変更前後を比較する
npm run fmg:perf -- --compare temp/fmg-perf/before.jsonl temp/fmg-perf/after.jsonl
```

| オプション | 既定 | 内容 |
| --- | --- | --- |
| `--seed a,b,c` | `100000001,200000002,300000003` | 数値seed。指定順に処理する |
| `--repeat N` | 3 | seedごとの反復回数 |
| `--mode load\|regenerate` | load | `load` は毎回新しいブラウザcontextで `?seed=` を開き、初回生成を測る。`regenerate` はseedごとに一度ロードしてから `regenerateMap({ seed })` を反復する |
| `--extensions` | none | `none`、`default`（全組込み拡張ON）、または `economy,characters,nobility,shipbuilding` の部分集合 |
| `--width` / `--height` | 1920 / 1080 | ブラウザviewportと `?width=&height=`。地図サイズが変わると生成結果も変わる |
| `--local-storage file.json` | なし | ページ起動前に設定する localStorage（`{"キー": "文字列"}`）。生成オプションの固定に使う |
| `--server dev\|preview` | dev | 空きポートで専用のVite devサーバー、または本番ビルド+previewを起動する |
| `--url URL` | なし | 起動済みサーバーを使う（例 `http://localhost:5173/Fantasy-Map-Generator/`）。HMRの編集が混ざるため比較計測には使わない |
| `--budget-ms N` | 2000 | 合計時間（totalMs）中央値の目標。結果は summary の `withinBudget` |
| `--timeout-ms N` | 180000 | 1回の生成の上限 |
| `--details` | なし | 各回と中央値の階層表を表示 |
| `--headed` | なし | ブラウザを表示して実行（目視確認用。時間比較には使わない） |

既存の出力ファイルは上書きしない。計測は常に順次実行し、他の高負荷処理と同時に走らせない。

## 測定範囲

アプリ側は localStorage `debug` に `{"generationProfile": true}` があるときだけ計測器を動かし、`window.fmg.actions.getGenerationProfile()` で結果を返す。CLIはこのフラグと拡張機能の有効状態（`fmg-extensions`）をページのスクリプトより先に設定する。新しいcontextは保存地図・IndexedDB拡張・ユーザー設定を持たないため、生成オプションは既定値とseedによる `randomizeOptions()` で決まる。

生成中の `Build map` ダイアログは、利用者と同じく `Generate entire map` を押して続行する。待ち時間は `review-wait` として記録し、すべての主要指標から差し引く。第1工程後のプレビュー描画（`review-preview`）は実際の利用者の費用なので差し引かない。

| 指標 | 意味 |
| --- | --- |
| totalMs | 計測開始から、遅延全面描画（coordinator-render）と Map Ready 完了処理（最後の全面描画を含む）の両方が終わるまで。**利用者が操作可能な地図を得るまでの時間で、2秒目標の対象** |
| generatedMs | 世界データの生成・commit・縮尺/暦の描画が終わるまで |
| drawnMs | 入口処理内の最初の `drawLayers()` が終わるまで |
| generationMs | `runGeneration()`（WorldRuntime の staging・pipeline・検証・commit） |
| pipelineMs | `world-runtime`（`dispatchWorldGenerate()`）の時間 |
| stages | `prepare` と5工程の時間 |
| entryDrawMs / coordinatorRenderMs | 入口処理の `drawLayers()` / commit後の RenderCoordinator による全面描画 |
| mapReadyWaitMs | Map Ready 開始（double rAF後）から完了処理の終わりまで |
| reviewWaitMs | 除外した `Build map` の待ち時間 |

`regenerate` は `regenerateMap()` の250 ms debounce 後から測る。ボタン押下から数えた体感時間はこれより250 ms長い。`load` は入口処理に `applyStyleOnLoad()` を含むが、ページのダウンロード・モジュール評価・React UI 初期化は含まない。

## 結果ファイル

| ファイル | 内容 |
| --- | --- |
| report.jsonl | 1回ごとの指標、marks、階層内訳 `breakdown`、生成結果の指紋 `world`、ページ例外 `pageErrors`。完了ごとに追記 |
| report.jsonl.summary.json | 全体・seed別の各指標の最小・中央値・平均・p95・最大、path別内訳の統計、seed内の指紋一致 `deterministic`、`withinBudget` |
| report.jsonl.meta.json | git HEAD・未コミット変更の有無・コードのSHA-256、Node/Chromium/CPU/OS、実行条件 |

`status` は `generated` / `failed`（生成エラー）/ `timeout` / `error`（CLI・ページ操作の失敗）。統計は `generated` の回だけを使う。少数反復のp95はほぼ最大値なので中央値を見る。

### 階層内訳

`breakdown` の各行は ce:perf と同じ形式（`path` / `parent` / `depth` / `calls` / `elapsedMs` / `selfMs`）。`elapsedMs` は子を含む時間、`selfMs` は計測した子を除いた時間で、一つの根の全行の `selfMs` 合計は根の `elapsedMs` に一致する。親子の時間を足し合わせない。

根は次の4つ。

| 根 | 内容 |
| --- | --- |
| `load` / `regenerate` | 入口処理。`generation/world-runtime/<工程名>/<generator>` が生成本体 |
| `coordinator-render` | fullReplace commit を受けた次フレームの全面描画 |
| `generateExtensionEvent` | Map Ready 開始時の互換イベント |
| `map-ready-completed` | `fmg:map-ready-tasks-completed` の処理（初期土地利用、最後の全面描画） |

`Routes.generate` と `ensureConvergingWorldRiverRoads` は内部工程も記録する（`coastal-route-neighbours`、`crossing-candidates` など。意味は [CE計測](ce-performance.md) の FMG工程表と同じ）。`drawLayers` の下は SVG renderer 単位。計測点を増やすときは、同期処理を `measureGenerationStep(label, fn)`、awaitする工程を `measureGenerationStepAsync(label, fn)` で包み、`ProcessingProfiler` を受け取るサービスには `activeGenerationProfiler()` を渡す（`src/generators/generationProfiler.ts`）。非同期工程は同時に一つだけ進む前提で、await 中に開始した無関係な計測はその工程の子として記録される。

## 比較とリファクタリングの確認

`--compare before.jsonl after.jsonl` は、主要指標・工程・内訳（既定は深さ3まで、`--depth N` で変更）の中央値と差を表示し、seedごとの指紋を照合する。指紋は高さ・地形feature・気候・河川・バイオーム・人口・文化・都市・国家・道路・宗教・州・マーカー・ゾーンの各部分のSHA-256で、変わった部分の名前を表示する。指紋が変わったseedがあれば終了コード2。性能改善を目的とする変更では、すべてのseedが `identical` になることを確認する。条件（mode・拡張・server・viewport）が異なる場合は警告する。

比較は同じseed・反復数・mode・server・マシンで行う。計測器自体の費用を含むため、`TIME` のconsole出力や過去の別方式の値と比べない。2026-10-08の確認では、同じ条件の反復差は約1%、dev と preview の差は約2%（previewが速い）だった。

## 基準値（2026-10-08）

条件: 拡張機能すべてOFF、`load`、dev、1920×1080、既定オプション（約1万grid cell）、各2回。Apple M4 / Chromium headless。入植パターンは seed により marches / standard / frontier。

| seed | pack cells / 都市 / 道路 | totalMs | generationMs | 描画（入口+遅延+最終） | Map Ready 完了処理 |
| --- | --- | ---: | ---: | ---: | ---: |
| 100000001 | 4,605 / 55 / 48 | 6,018 | 3,826 | 383+386+391 | 1,330 |
| 200000002 | 4,688 / 314 / 339 | 10,903 | 6,995 | 845+913+922 | 2,025 |
| 300000003 | 5,980 / 103 / 77 | 7,937 | 4,422 | 752+741+737 | 1,927 |

工程別（seed 100000001）: climate-and-waterways 564、cultures-and-settlements 281、realms-and-routes 1,548、finish-the-world 1,306 ms。

self時間の大きい処理（seedにより順位は変わる）:

- `coastal-route-neighbours`（道路収束内）: 1.2〜2.5秒。`ensureConvergingWorldRiverRoads` は standard で2回、それ以外で3回呼ばれ、3 seedとも Finish the world 末尾の呼出しがキャッシュを使わず再計算している（1.3〜2.3秒）
- `RoutesRenderer`: 1回350〜800 ms。全面描画が入口・遅延描画・Map Ready完了の**3回**行われる
- `initializeSettlementLandUse`（Map Ready完了処理）: 0.9〜1.2秒
- `crossing-candidates` / `converge-road-legs`: 0.6〜2秒
- `OceanCurrents.generate`: 約0.5秒、`Burgs.shiftAsync`: 0.2〜0.5秒

2秒目標に対して、生成本体の短縮だけでなく重複描画の削除が必要であることを示す値。改善後は同じseedで再計測し、この表を更新する。
