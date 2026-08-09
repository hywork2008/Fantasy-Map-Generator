# 交易品

主実装: `src/extensions/economy/generators/goods-generator.ts`（`GOODS_DATA`）。

## カタログ編集

GOODS_DATA の編集 UI（Goods Editor）が存在する。マップ生成時にカタログが materialize され、economy 拡張スライスに保存される。

## 主食作物・土壌（実装済み）

`Grain` は Food Ledger が価格、備蓄、輸入を決済するための**主食総量**である。これとは別に、Goods カタログには各セルの住民が実際に食べる作物として Wheat / Rye / Barley / Oats / Millet / Buckwheat、Peas / Broad Beans / Lentils / Chickpeas、Turnips / Potatoes を持つ。

- 各作物の `crop` パラメーターは、年平均の気温・降水代理値、適する土壌（沖積土・粘土・腐植土・壌土・砂質土・薄い山地土）、相対収量を定義する。
- `agriculturalLandUse.ts` はセルごとに、適した**主食作物（穀物または根菜）を1種**と**豆類を1種**選ぶ。環境は候補を制限し、Culture type はその候補群の優先順位（例: Highland の Rye / Buckwheat、Nomadic の Millet / Lentils）を決める。小さい決定的なセル差だけを加えるため、同じ地図を再描画・再ロードしても作付は変わらない。
- 主食:豆類は 2:1 の作付計画として扱い、三圃式の通常状態なので初期収量に連作障害ペナルティはない。豆類を育てられず主食作物だけに偏る場合は、年次更新時に `soilFertility` が低下し、以後の収量を下げる。豆類の作付は緩やかに回復させる。
- 河川水に依存する乾燥砂漠セルは、年次更新時に `irrigationSalinity` を蓄積する。十分な降水がない限り塩害が残り、収量を最大 65% まで抑制する。
- Era 1 の `Four-course rotation` は、三圃式と鉄製農具・役畜利用を前提とする州単位の技術である。普及段階に応じて、クローバー・飼料作物の輪作による控えめな収量増加、農作業量の低下、土壌肥沃度の追加回復を与える。耕地の最大 1/4 は `floweringForageArea` として保存され、将来の養蜂が利用する局地的な蜜源になる。これは主食生産に二重加算されない。

作物別の Goods 出力は地図レイヤーとツールチップで表示する。市場の Food Ledger はこれらの合計を引き続き Grain として扱うため、作物を増やしても備蓄・飢饉・輸入の会計を二重計上しない。Potatoes には `postMedieval` タグを付けており、史実のヨーロッパには中世末ではなく16世紀以降に導入された点を明示している。

Cell Info の `Pin cell` を使うと、カーソル移動中もそのセルの気温・降水量を固定できる。Economy 有効時の `Crop climate` 行から開く Crop climate guide は、個別作物の詳細と全作物比較を切り替えられる。淡色の帯は生育可能な `min–max`、濃色の帯は最適な `idealMin–idealMax`、橙色の印は固定セルの値を示す。

## 生きた猫（実装済み）

`Cats` は `unit: "head"`、タグ `liveAnimal` / `pestControl` を持つ生きた交易品である。農耕地・草地から少量が供給され、長距離取引には不向きな小型・壊れやすい生体貨物として扱う。倉庫のネズミ抑制へ接続する将来仕様は[治安・衛生](civic-conditions.md)を参照。

`liveAnimal` は、生きたまま取引・輸送される Cattle、Horses、Elephants、Camels、Sheep、Goats、Pig、Chicken、Cats に付与する。捕獲後の肉・副産物として流通する Game や Whales、および人間を示す Slaves には付与しない。

### 生産量の整数化（実装済み）

`liveAnimal` タグ付き商品は、他の商品のように小数点以下の連続量として市場在庫に加算されない。実装は `generators/liveAnimalCatch.ts`（`rollLiveAnimalCatch`）で、`markets-generator.ts` の `addRuralOutput()` がこのタグを検出した際に介在する。

アルゴリズムは「漏れバケツ」型の確率的丸め（Bresenham 型直線描画アルゴリズムの乱数版）:

```text
accumulator += expectedAmount              // その月分の連続レートを積み立てる
guaranteed   = floor(max(accumulator, 0))  // 確実に得られる頭数
remainder    = accumulator - guaranteed    // 端数（負債中は負値）
bonus        = remainder > 0 && random() < remainder ? 1 : 0
caught       = guaranteed + bonus
accumulator -= caught
```

捕獲が起きるとアキュムレータが 0 付近（または負債側）まで下がるため、直後の数ヶ月は捕獲確率が低く保たれ、再び貯まるまで待つ「捕りすぎた後にしばらく減る」挙動になる。多数ヶ月で平均すると `expectedAmount`（従来の連続生産レート）に厳密収束する（renewal-reward theorem）ため、年間総生産量は変更前と同じで、月ごとの分布だけが変わる。

アキュムレータは市場・集荷 Burg・商品ごと（`marketId:collectionBurgId:goodId`）に独立して保持し、`simulation.extensions.economy.liveAnimalCatchAccumulators` に永続化される（`economyContext.ts` の `getOrCreateLiveAnimalCatchTable()`）。Economy 拡張を disable/regenerate すると `clearLiveAnimalCatchAccumulators()` でクリアされる。

### 卸取引・初期在庫の整数ロット化（実装済み）

生産（上記）は整数化されても、**市場間の卸取引は元々どの商品も連続量で動く**ため、`unit: "head"` の商品（liveAnimal はすべて該当）でも卸取引を経由すると端数在庫が生まれ得た。具体的には:

- `runGlobalTrade()`（`markets-generator.ts`）が算出する取引量 `units`
- `ExportStaging.seedInheritedExportWarehouseIfNeeded()`（`exportStaging.ts`）が生成する「ゲーム開始時点で商人がすでに買い付け済みだったことにする」初期倉庫ロット

のどちらも、既存の小売ロット制約 `getRetailLotSize()` / `floorToRetailLot()`（`goodsTradeLots.ts`。`unit` が `INDIVISIBLE_UNITS`＝`head`/`ship`/`cannon`/`slave` 等、または `cargo.handlingClass === "live"` の商品はロットサイズ 1）を、取引量が確定する箇所で通すことで整数化している。これにより「開始時点で在庫 0.4 匹」のようなケースは発生しなくなる。プレイヤー向け小売購入（Character Market）は元々この関数でロット制約済みだった。

## 建材・住居関連（実装済み）

住居建設と文化別建材は [urban-housing-system.md](../plan/urban-housing-system.md) と [urban-construction-industry.md](../plan/urban-construction-industry.md) を参照。

| Good | 役割 |
| :--- | :--- |
| **Wood** | 大工材料。造船と市場在庫を間接競合 |
| **Stone** / **Marble** | 石工材料。採石場オペレーションからも供給 |
| **Clay** | 煉瓦の原料。River/Lake 文化で産出補正 |
| **Brick** | 建設用中間財（`Clay` + `Wood` 0.1 焼成）。Ceramics（utilities）とは別 |
| **Lime** / **Volcanic Ash** / **Roman Concrete** | 上級建材。Roman Concrete は石の直接代替（効率 2×） |

### 文化タイプと建材ミックス

`housingRecipes.ts` が `CultureType` ごとに Wood / Stone / Brick の比率を決める。

- 採石場なし → **石**シェアのみ無効化し、残り材へ比例再配分
- Brick は採石なしでも可（River/Lake などで石工が立つ）
- High Fantasy 文化セット + 採石あり → wood→stone 最大 0.2 移動

家を何で建てるか（概略）:

- 石 — Highland 寄り
- 煉瓦 — River / Lake 寄り
- 木 — Hunting / Nomadic / 採石なし

## メモ・候補（未整理）

以下は過去のメモであり、必ずしも実装済みではない。

- 小麦 Wheat / 大麦 Barley / 蕎麦 Buckwheat / 米 Rice / 芋 Potatoes
- 綿 Cotton / Cacao / Narwhal の角 / ゴムの木 / ゴム

## Fantasy Culture Set 専用品（調査済み・未実装）

Culture set が `highFantasy` / `darkFantasy` のときに出したいジャンル・フレーバー品（ポーション、ミスリル、竜の鱗、魔石など）の JRPG／英語圏ファンタジー比較調査は [docs/plan/fantasy-culture-set-goods.md](../plan/fantasy-culture-set-goods.md) を参照。
