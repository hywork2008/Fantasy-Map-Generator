# 耕地面積の観測と近似APIの検証

設計・項目定義は [farmland-area-estimation.md](../plan/farmland-area-estimation.md)。各工程は独立して実行できる。

## 1. 経済有効の地図を生成し、年次観測を保存する

```sh
node --import tsx scripts/observe.mts run experiments/farmland-pilot.json --out temp/farmland-research/runs
```

既存のFMG生成器で世界全体を生成し、専用の `sim:server` へ登録する。準備期間2年の後、10年間を年1回観測する。`run.json` の各チャンネルに `error` がなく、`samples:10` になったことを確認する。経済にはCharactersが必要で、実験定義では通常の4拡張を明示している。失敗したチャンネルの途中観測を正常完了のデータと混ぜない。

生成された `.fmg` は `<run-dir>/maps/`、年次入力は `<run-dir>/samples/*.ndjson`。サーバーの最終地図は `<run-dir>/channels/<channel-id>/current.fmg`。生成・学習・検証に使うseedを変えるときは実験定義をコピーして別名で保存する。

既存サーバーを利用する場合は `--server http://127.0.0.1:8788` を付ける。書き込み認証が有効なら `FMG_SIM_TOKEN` を使う。観測だけなら以下を使う。

```sh
curl http://127.0.0.1:8788/api/sim/channels/world-1/observe/farmland
curl 'http://127.0.0.1:8788/api/sim/channels/world-1/observe/sample?detail=farmland'
```

これらのGETは時間を進めない。定期観測は `ops` の `sampleEvery:{months:12}` と `sampleDetail:"farmland"` を指定する。既定の交易観測には耕地の全セル情報を含めない。

## 2. 数年単位の統計を作る

```sh
node --import tsx scripts/farmlandResearch.mts summarize <run-dir> --period-years 5 --out temp/farmland-summary.json
```

世界別の5年窓と、バイオーム・時代・集落パターン・人口帯別の面積統計を出力する。世界全体の面積は年ごとの合計の平均であり、5年分の面積の合算ではない。観測年不足や欠測は `complete` / `missingCellYears` を参照する。

## 3. 学習用の世界だけからモデルを作る

`worldId` は集計結果の `result.worldIds` または `run.json` のchannel値を使う。

```sh
node --import tsx scripts/farmlandResearch.mts fit <run-dir> --train-worlds <channel-1>,<channel-2> --out temp/farmland-model.json
```

既定で同じ層に10セル・2seed以上が必要。支持不足ならその層はモデルに入らない。`--minimum-worlds 1` は調査用に限る。地図を増やさず年数だけを増やしても独立世界の条件は満たさない。

## 4. 未使用の世界で評価する

```sh
node --import tsx scripts/farmlandResearch.mts evaluate <run-dir> --model temp/farmland-model.json --test-worlds <channel-3> --out temp/farmland-evaluation.json
```

学習worldIdまたはseedが重なる場合は失敗する。全セルだけでなく `burgCells` と `urbanAllocation` を比較する。`calibratedCellYears` が少ないモデルを広い条件に有効と解釈しない。

## 5. 経済を読み込まずに推論する

```ts
import { readFarmlandFeatures } from "./src/services/farmlandObservation";
import { estimateFarmland } from "./src/services/farmlandCalibration";

const features = readFarmlandFeatures(world, currentYear);
const nearTown = features.find(row => row.cellId === burg.cell);
const estimate = nearTown ? estimateFarmland(nearTown, model) : null;
// estimate.urbanAllocatedAreaHa is the drawing budget in hectares.
```

CLIで保存したモデルはJSONの `result` がモデル本体。`source` が `static-baseline` なら対象条件に校正を適用できず、既存の静的推定を返している。研究モデルはCEへ自動適用されない。authoritativeな面積がある場合は既存の正本を優先する。
