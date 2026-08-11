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

## セル内の生鮮食料と保存食（実装済み）

Milk / Grapes / Game / Fish / Shellfish は `freshFood` と `freshFood` プロファイルを持つ。これらは農村セルでの収穫直後に処理され、**生のまま Market 在庫へ集約されない**。

各セルは、住民の当月の生食、三か月分のセル内保存食、商業用保存食の順で計画する。収穫量は、住民が消費・保存加工できる実量だけに制限されるため、「未収穫の潜在量」や、労働不足で作られた余剰生鮮在庫は記録しない。

- 最初に同じセルの住民が生鮮品を消費する。
- 次に、セル人口の最大 15% の共同加工労働で、Milk → Cheese、Grapes → Raisins、肉・魚介 → Preserved food / Stockfish の三か月分の備蓄を補充する。
- 備蓄を満たした後は、市場価格の需要シグナルに応じた小さな商業ロットだけを Market へ出す。Grapes は Wine を主な商業加工先とし、Raisins は安全備蓄用の副産物として残す。したがって保存食は流通するが、セルの安全在庫は売却しない。
- 保存材料は食料と同じ優先度で確保する。材料・保存経路が物理的に欠けた場合だけ、加工予定だった生鮮品を腐敗として記録する。

これは食料安全を満たすために全住民を保存加工へ回すのを防ぐ。セル内の備蓄が健全なら、残る労働力は通常どおり建設・武具・贅沢品などの高付加価値生産へ向かう。旧来の Market 内の生鮮在庫を処理する互換経路にも、同じ 15% の優先労働上限を適用する。

Milk は例外として、生のまま口にできるのは搾乳場所の近傍に限られる。そのためセル内で実際に扱う Milk の最大 5% だけを生食・調理用に配分し、残りは Cheese 用の保存加工へ優先配分する。加工能力・保存材料・需要が不足する分は生産候補の段階で作らず、余剰の生乳を通常の生産として記録しない。

農村の通常食は Grain と豆類であり、Cheese 備蓄は日々の Milk 不足を埋める用途には使わない。Food Ledger が農村の主食不足を記録したときだけ非常食として取り崩し、平時は三か月分を満たした後の Cheese を商業出荷へ回す。

### Goods Editor の生産・加工実績

Goods Editor の `Potential` は、セル資源と Burg の現時点の能力から毎回再計算する**見込み能力**であり、実際に収穫・製造された量ではない。実際の流れは次の列で確認する。

- `Market Output`: 実際に Market 在庫へ置かれた地元産の完成品・採取品の累計。小売消費量や他市場からの到着量ではない。
- `Actual Output`: `Market Output` に、セル内の三か月備蓄として作られた Cheese / Raisins / 保存肉・魚を加えた実際の出力量。たとえば Cheese はこの列で Milk の加工比率を確認し、`Market Output` との差でセル内備蓄分を読める。
- `Food Flow (H / P)`: 生鮮食品について、`H` はセルで実際に扱えた収穫量（計画外の候補量を含まない）、`P` は保存加工・製造に投入した原料量の累計。Grapes なら `H` と `P` を比較して収穫と Wine/Raisins 化の規模を読み、Wine なら `Market Output` で完成品の流通量を読む。

これらの実績カウンタは `Market Output` のリセット操作と一緒にゼロに戻る。セル内の当月生食は月内の Market 需要からのみ差し引き、過去月の累積消費量で将来月の需要を減らさない。

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
