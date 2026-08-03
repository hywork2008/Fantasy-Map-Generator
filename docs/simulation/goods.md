# 交易品

主実装: `src/extensions/economy/generators/goods-generator.ts`（`GOODS_DATA`）。

## カタログ編集

GOODS_DATA の編集 UI（Goods Editor）が存在する。マップ生成時にカタログが materialize され、economy 拡張スライスに保存される。

## 生きた猫（実装済み）

`Cats` は `unit: "head"`、タグ `liveAnimal` / `pestControl` を持つ生きた交易品である。農耕地・草地から少量が供給され、長距離取引には不向きな小型・壊れやすい生体貨物として扱う。倉庫のネズミ抑制へ接続する将来仕様は[治安・衛生](civic-conditions.md)を参照。

`liveAnimal` は、生きたまま取引・輸送される Cattle、Horses、Elephants、Camels、Sheep、Goats、Pig、Chicken、Cats に付与する。捕獲後の肉・副産物として流通する Game や Whales、および人間を示す Slaves には付与しない。

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
