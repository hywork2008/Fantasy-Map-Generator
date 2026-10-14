# 骨格先行生成 Phase S0: 調査と基準

実施日: 2026-10-14
対象: [骨格先行生成 設計書](../plan/skeleton-first-generation.md) §7 Phase S0

## 1. 後段工程の契約

### 1.1 runPlan の工程境界

`generators/generation/pipeline.ts` の `runPlan` は次の順に工程を呼ぶ。後段の工程は `Plan` だけでなく、前段の中間値も直接受け取る。

| 工程 | 主な出力（`Plan` に無い中間値は太字） |
| --- | --- |
| `planCoast` | `sea`, `ocean`, `coastPath`, `waterPolygon`, **`coast`, `coasts`, `classified`, `coastalWater`, `appliedChannels`** |
| `planRivers` | `rivers`（`RoutedRiver`）, **`urbanRadius`, `urbanBearings`, `plannedUrban`, `plannedCore`, `burgCell`** など |
| `planUrban` | `urban`, `outskirts`, `builtUp`, `urbanStages`, メッシュ差し替え（`currentMesh`/`currentCells`/`currentFaceIdOf`）, **`residentialOutskirts`** |
| `planDefenses` | `borderLoops`, `gates`, `precincts`, `citadelOutline`, 城, `innerWall`, **`genBorders`, `canPlaceTownGate`, `streetHub`** |
| `planRoads` | `roads`, `streets`, 経路済みの `gates`, **`streetResult`, `streetGeo`, `gateStreets`** |
| `planWards` | `wards`, `wardOrder`, `templeHarbor`, `fmgElevations` |

### 1.2 アダプタの境界（決定）

設計書§4.7の「`Plan` へ変換して wards 以降を再利用する」は、そのままでは成り立たない。`planWards` は `genBorders`、`coastalWater`、`classified`、`streetResult` などの中間値を受け取るためである。

境界を次のように決めた。

- 骨格先行は `planCoast`〜`planDefenses` の4工程を置き換える。上表の出力（中間値を含む）と同じ契約を骨格から作る。
- `planRoads` と `planWards` は現行の関数をそのまま呼ぶ。
- 文書への反映は現行の `applyPlan` を使う。壁は `plan.borderLoops`（メッシュ辺の参照）、川は `polylineToVertexPath` による最寄り頂点への吸着で反映される。骨格の線がメッシュの頂点上にあれば、どちらもそのまま正確に反映できる。

### 1.3 骨格先行で外す処理

`assembly/gates.ts` の `applyGates` は、門を置く前に次の処理を行う。

1. `finishCityGeometry(next, "boundaries")` で壁の輪郭を平滑化する（`smooth-boundaries`）
2. `clipSurveyedRiverWalls`
3. `openWallRiverMouths`
4. `repairRiverWalls`。失敗すると `wall-river-routing-failed` で不採用になる

1 は四角や星型の頂点を丸めてしまう。3 と 4 は骨格では交差が確定済みなので不要になる。`applyPlan` に骨格先行用の分岐を設け、1・3・4 を呼ばないようにする。2 はFMGの測量済みの岸を扱うため残し、何も変えないことを診断で確認する。完成後の `finishCityGeometry`（全体）は、壁の頂点を一時的に固定して呼ぶ。`gates.ts` が内側の壁に対して既に使っている方法と同じである。

### 1.4 gridKind（設計変更）

`gridKind === "evolution"` は、粗いメッシュ（1区画≒1セル）を表す実質的なモードになっている。生成と描画の約15箇所がこの値で分岐する。

- `generateCity.ts`：`coarse` 判定による `shortcutMajorRoads` と `createFabricPlan`（街区・建物）
- `finishCityGeometry.ts`：平滑化の強さ
- `passages.ts`：通路の作り方
- `assembly/crossings.ts`：広い川の橋
- `assembly/finalize.ts`：到達性の検査
- `assembly/terrain.ts`、`buildingLots.ts`、`fabricDistricts.ts`、`settlementExtent.ts`、`renderers/townFacts.ts`

新しい `"skeleton"` を足すと、これら全ての分岐を更新する必要がある。そこで骨格先行は evolution と同等の粗いメッシュを作り、`gridKind: "evolution"` のままとする。生成方法は recipe（`fabric.generation`）に記録する。これにより保存形式の変更（`documentCodec.ts` の許可リスト）も不要になる。FMG連携の入力も全て evolution である（Triviers 596都市）。

## 2. 比較入力セット

### 2.1 FMG連携

- 入力: `temp/000.savdata/Triviers_2026-10-12-18-47.fmg` から `npm run ce:perf -- … --list` で出力した596都市。2026-10-13の urban morphology 追加以前のCSVは使わない。
- 全596都市は1都市あたり約10秒（起動を含む）かかり、1時間40分を超える。そこで層別に96都市を抽出した。

| 層 | 都市数 |
| --- | ---: |
| small・城壁あり・城なし（全数） | 58 |
| medium / large（全数） | 11 |
| 城あり（v1範囲外、参考） | 6 |
| 城壁なし（川0/1/2 × 港の有無、各最大4） | 21 |

内訳の母数: 城壁なし505、城壁ありで城なし59、城あり24・城壁なし91（重複あり）。時代は全て `ageOfExploration`。

### 2.2 単独生成

`scripts/city-editor/skeleton/standaloneBaseline.ts` を追加した。12条件 × 12 seed の計144都市を生成する。

- 条件: small voronoi と tiny evolution のそれぞれに、既定（川1本 through）、川なし、川2本、湾、岬、地形ランダムの6通り。地形ランダムでは城を外して v1 の範囲に合わせる。
- 格子 seed は `ce-s0-20261014-mesh`、生成 seed は `ce-s0-20261014:<i>`。
- 1都市ごとに、成否、試行数、所要時間、失敗試行に費やした時間、工程別の時間、不採用理由をJSONLに記録する。
- `--settings` で追加の設定を渡せる。Phase S3では `{"generationMethod":"skeleton-first"}` を渡して同じ条件で比較する。

## 3. 基準結果（現行方式）

計測環境: Apple M4、Node v22.23.1。単独生成は FMG の計測が終わってから単独で実行した。

### 3.1 FMG連携（96都市）

- 96都市すべてが1回目の試行で成功した（不採用0）。
- 生成時間: 中央値516 ms、平均1,061 ms、p95 3,719 ms。medium/large の中央値は2,277 ms（最大10,144 ms）。
- 時間の内訳（工程の合計に対する割合）: `fit-housing` 46%、`apply-total` 17%、`wall-defense-closure` 13%、`route-junctions` 12%、`plan-total` 6%、`finish-geometry` 5%、`smooth-boundaries` 2%。

FMG連携では、失敗や壁と川の取り合いは時間の主因ではない。最大の工程は住宅の当てはめ（`fit-housing`）で、骨格先行の対象外である。**FMG連携については、骨格先行で速度が大きく改善するとは見込めない。** 改善が見込めるのは壁の形の自由度である。

### 3.2 単独生成（144都市）

| 条件 | 失敗 | 不採用 | 平均ms | 不採用理由 |
| --- | ---: | ---: | ---: | --- |
| small-voronoi 既定 | 0 | 4 | 4,191 | 壁川3、門1 |
| small-voronoi 川なし | 0 | 0 | 1,906 | — |
| small-voronoi 川2本 | 0 | 0 | 4,301 | — |
| small-voronoi 湾 | 0 | 0 | 3,922 | — |
| small-voronoi 岬 | 0 | 17 | 7,072 | 壁川14、門3 |
| small-voronoi ランダム | 1 | 10 | 3,558 | 壁川9、門1 |
| tiny-evolution 既定 | 0 | 1 | 468 | 壁川1 |
| tiny-evolution 川なし | 0 | 0 | 157 | — |
| tiny-evolution 川2本 | 0 | 0 | 728 | — |
| tiny-evolution 湾 | 0 | 5 | 666 | 門4、壁川1 |
| tiny-evolution 岬 | 4 | 46 | 1,201 | 壁川33、門12、交差1 |
| tiny-evolution ランダム | 0 | 12 | 433 | 門5、壁川4、交差3 |

「壁川」は `wall-river-routing-failed`、「門」は `unconnected-gates`、「交差」は `invalid-crossings`。

- 144都市中、最終失敗5、例外0。試行数は1回が107都市、2〜6回が32都市、8回（上限）が5都市。
- 不採用95件のうち `wall-river-routing-failed` が65件（68%）で最多だった。この理由は2026-10-02の集計には無く、その後に `repairRiverWalls` の失敗として追加されたものである。次が `unconnected-gates` 26件、`invalid-crossings` 4件。
- 全生成時間343秒のうち19%は、不採用になった試行に費やされていた。
- 川なしの条件は、small・tiny とも不採用0で、時間も最短（川1本の半分以下）だった。
- 工程別の時間（`generationTimer` の区間。区間は入れ子なので合計しても100%にならない）: `apply-total` 45%、`wall-defense-closure` 24%、`finish-geometry` 21%、`route-junctions` 13%、`wall-junctions` 10%、`smooth-boundaries` 7%、`plan-total` 7%。

単独生成では、壁と川の取り合い（`repairRiverWalls`）による不採用と、そのやり直しの時間が支配的である。骨格先行が狙う効果と一致する。

## 4. 設計書への反映

- §3.3: `gridKind: "skeleton"` と保存形式の追加を取りやめ、evolution 相当の粗いメッシュとする（1.4）。
- §4.7: アダプタの境界を `planCoast`〜`planDefenses` の置換に改め、`applyPlan` の骨格先行用の分岐を追加する（1.2、1.3）。
- §8: 評価の重点を単独生成に置き、FMG連携では速度の改善を目標にしない（3.1）。

## 5. 気付いた既存の問題

- [生成の失敗条件と試行結果](../generation-failure-cases.md) の「再現方法」は、`defaultGenerationSettings` を `generateCity.ts` から import している。リファクタリング後は `generators/generation/settings.ts` にあるため、この手順はそのままでは動かない。本記録の範囲外なので未修正。
- 同資料の不採用理由の表に `wall-river-routing-failed` が無く、現状の最多理由を表していない。

## 6. 再現手順

```sh
npm run ce:perf -- "temp/000.savdata/Triviers_2026-10-12-18-47.fmg" temp/s0/triviers-inputs.csv --list
npm run ce:perf -- temp/s0/triviers-inputs.csv temp/s0/triviers-sample-mesh-first.jsonl --burg <96都市のID> --timeout-ms 120000
node --import tsx scripts/city-editor/skeleton/standaloneBaseline.ts --out temp/s0/standalone-mesh-first.jsonl --seeds 12
```

96都市のIDと層の対応は `temp/s0/sample.json` に保存した（`temp/` はGit管理外）。

```text
1,2,17,18,20,23,24,25,28,29,33,34,37,38,42,46,54,62,66,77,91,95,103,112,113,116,126,140,151,153,162,164,171,172,176,192,195,196,198,199,208,211,212,214,218,242,244,246,261,271,277,278,284,291,294,303,315,320,323,328,332,333,340,341,353,355,358,369,384,387,397,416,419,429,437,443,446,457,460,464,471,472,479,480,485,488,490,491,500,501,518,533,568,587,590,594
```
