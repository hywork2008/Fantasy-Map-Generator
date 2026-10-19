# Map scope: Province / Islet 規模の小さな地図

2026-10-11 設計・実装。

## 1. 目的

worldConfigurator の size（mapSize）は地球に占める割合を変えるだけで、セル数は `points`（既定 10K）のまま。
したがって地図全体の処理量は変わらない。

そこで、セル数そのものを絞った地図を生成できるようにする。

- **Province**: FMG の Province 1〜数個ぶんのセル（既定 500 グリッドセル、陸と海を含む）で 1 枚の地図を作る。
- **Islet**: 1〜数セルの `type = island` が 1 つだけの地図（約 49 グリッドセル）。

狙いは次の 2 点。

- .fmg 1 枚あたりの都市数を減らし、`ce:perf` の 1 周を短くする。
- 河川港・海港を持つ都市、河川、街道の最小セットを作り、検証を短い周期で回す。

## 2. 基本方針: 密度は変えず、キャンバスだけを縮める

`points` を下げてセルを粗くすると、1 セルあたりの面積、川の流量、都市の大きさ（km）が通常地図と食い違う。
そうなると CE / RE の検証対象として意味がなくなる。

そこで **セル間隔（spacing）・km/px・セルあたりの水文を通常地図と同一に保ち**、キャンバスだけを縮める。
こうして作る地図は「通常の世界の一部を切り出したもの」になる。

- 縮小率 `factor = sqrt(targetCells / densityCells)`。`densityCells` は `points` に対応するフルキャンバスのセル数。
- `graph = canvas × factor`、`cellsDesired = targetCells` にすると、spacing は `sqrt(W·H / cellsDesired)` で元と等しくなる。
- 川・降水の補正 `cellsNumberModifier` は `points`（密度）から計算するので、値は変わらない。
- `mapSize`（地球に占める割合）にも factor を掛ける。こうすると `distanceScale`（km/px）が通常地図と一致する。
  - `mapSize` をロックしている場合は、ユーザーの値をそのまま使う。

## 3. 実装

| 項目 | 場所 |
| --- | --- |
| スコープ定義・縮小計算・数の上限 | `src/utils/mapScope.ts` |
| オプション `mapScope` / `mapScopeCells` / `isletLandCells` | `src/store/optionsState.ts`（GENERATION_OPTION_KEYS、export/import 対応） |
| キャンバス縮小 `applyMapScope()` | `src/controllers/options.ts`。`prepareGenerationStage` で `randomizeOptions()` の後に呼ぶ |
| グリッド生成（`cellsDesired` の上書きと `grid.scope`） | `src/utils/graphUtils.ts`（`ScopedGridRequest`） |
| 小島ハイトマップ | `src/generators/isletHeightmap.ts`。テンプレートの代わりに中心付近へ N セルの島を置き、周囲は距離に応じて深くする。端は常に海 |
| 小グリッド用 blob/line power | `heightmap-generator.ts`。1000 セル未満は `1/sqrt(cells)` で外挿する（既存の表の値は不変） |
| 数の上限（Province: 国家・文化・宗教 ≤2、Islet: 各 1）。居住可能セルがあれば最低 1 | cultures / burgs (capitals, frontier) / religions / tools.ts |
| 町数の自動計算を密度基準に | `gridDensityCells(grid)`。縮小グリッドの点数ではなく `densityCells` を使う |
| 緯度 | スコープ地図は緯度幅が 1〜6° しかなく、中心緯度がそのまま全体の気候になる。そのため `gauss(35,10,5,≤50)` で温帯に寄せる |
| 保存・読込 | `grid.scope` は .fmg（world 丸ごと clone）に残る。読込時に `mapWidth/Height` を元キャンバスに戻す（再生成で二重に縮むのを防ぐ） |
| 表示 | 生成後・読込後に `fitScopedMapToView()` でグラフ全体をフィットさせる |
| UI | Options → Generation の Points number の下。Map scope、Scope cells（100〜2500）、Islet land cells（Random 1–4 / 1〜6） |

`grid.scope` が無い地図（World）は、すべての分岐で従来経路を通る。
`fmg:perf --compare` で seed 100000001 / 200000002 の fingerprint が変更前と完全一致することを確認した。

### 3.1 小さな地図で表面化した既存の潜在バグ（修正済み）

- `rankCells`: 陸が 1 セルだと `median(fl) === max(fl)` になり、`normalize` が 0/0 = NaN を返す。その結果、適地度が 0 になる。`maxFlux > meanFlux` のときだけ加点するようにした。
- `Cultures.expand`: 中心セル自身には文化を設定せず、隣接セルから戻ってくるのを待っていた。海に囲まれた 1 セル島では戻れない。そこで中心を明示的に設定する（cost は未設定のままなので、通常地図では従来どおり上書きされる）。

## 4. CLI: `npm run fmg:small`

```
npm run fmg:small -- <out-dir> [--scope province|islet|world] [--count 1]
    [--seed 1,2,3 | --start-seed 1000 --tries 50] [--cells 500] [--islet-land 0..6]
    [--require burg,sea-port,river-port,river-burg,river,road,province] [--max-burgs N]
    [--local-storage settings.json] [--url http://127.0.0.1:5173/Fantasy-Map-Generator/]
```

- ヘッドレス Chromium で生成する。`--require` を満たした地図だけを `window.fmg.actions.prepareWorldArchive()` で `<scope>-<seed>.fmg` として保存する。
- 判定結果は `small-maps.jsonl` に追記する（セル数、都市ごとの seaPort / riverPort / onRiver、街道種別など）。
- `--local-storage` で設定パターンや文化セットなどをロックできる（例: `{"initialSettlementPattern":"standard"}`）。
- `--scope world` は通常の世界を作る（遠距離交易の計測用、long-distance-merchant-reach-capital.md §11.2）。密度は `--local-storage` の `points`（例 `"1"` で 2,500 セル）で決める。
- 経済を含む地図には、`--local-storage` に `fmg-extensions`（`characters`・`economy`・`nobility`・`shipbuilding` を有効）が要る。新しいブラウザの context では economy が無効のまま生成される。

実測（M 系 Mac、dev サーバー）:

- `--scope province --count 2 --require sea-port,river-port,road` は 5 シード目までに 2 枚が見つかった。1 枚あたり 2〜5 秒。
- 保存した `province-1001.fmg`（都市 6）に対する `ce:perf` は 28 秒で一巡した。
- 参考: 通常 10K 地図の生成は 16〜30 秒、Province（510 セル）のパイプラインは約 0.2 秒、Islet（45 セル）は約 0.14 秒。

## 5. 既知の制限

- Islet は都市が 1 つなので、FMG の港判定（同じ水域に港が 2 つ以上必要）により海港にならない。海港の検証には Province を使う。
- 設定パターン（Frontier など）がランダムに選ばれると、Province でも都市が 1 つになることがある。都市数が必要なら `--local-storage` でパターンをロックする。
- Submap / Transform ツールは `applyMapScope()` を通らない。スコープ地図に適用すると、キャンバスが元サイズに戻る。
- Earth region テンプレートは、縮小キャンバスに低解像度でサンプリングされる（mapSize には factor が掛かる）。
