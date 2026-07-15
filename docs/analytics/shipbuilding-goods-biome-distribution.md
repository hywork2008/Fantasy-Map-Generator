# Goods Distribution Algorithm and Biome Wealth Tendency (Shipbuilding Initial Stock Investigation)

## Summary

`docs/plan/shipbuilding-industrial-policy.md` §8.5(初期在庫)の検討材料として、地域ごとのGoods割り当てアルゴリズムをコードから調査した。

結論として、「造船材料(Wood/Hemp等)が出るバイオーム = 富む/貧しい」という単純な二分法は成立しない。コード上は次の3つの独立した軸が富の傾向を決めており、造船材料バイオームはそのうち**人口扶養力(habitability)が高い側**に位置する一方、**単位価値は低い側**に位置する。両者が相殺し合うため、生の木材輸出だけでは突出した富にはならず、Tar/Ropes/Sails/Shipsまでの加工チェーンを国内で回せているかどうかが富の分岐点になる。

この文書は現時点では**コードリーディングによる仮説**であり、複数シードでの実測検証はまだ行っていない(§5参照)。

## 1. 調査の背景

`docs/temp/todo/shipbuilding.md` §8.5 は、造船所の新規マップ初期在庫を「明示的な備蓄」で作る方針を検討しており、その候補として以下を挙げている。

- 候補①: 裕福な国かつ港が沢山ある
- 候補②: 小国で海洋にしか生き残りのチャンスが無い
- Economy拡張機能によって生成される国家・地域の商品が船の製造に向いている

これを定量化する前段として、「地域ごとのGoods割り当てのアルゴリズム」と「地図生成時の各国のPort数・Wealthの傾向」をコードから調査した。

## 2. Goods配置アルゴリズム

### 2.1 二種類の資源生成経路

`src/extensions/economy/generators/goods-generator.ts` の `GoodsModule` は、セルへの資源付与を2つの独立した経路で行う。

| 経路 | 実装 | 性質 |
|---|---|---|
| ボーナス資源(セル単位の抽選配置) | `GoodsModule.generate()` | 確率的・希少・全マップで総量に上限あり |
| バイオーム背景生産 | `good.biomeOutput` → `getCellProduction()` | 決定的・人口に比例・上限なし |

#### ボーナス資源の配置(`generate()`, [goods-generator.ts:1160-1198](../../src/extensions/economy/generators/goods-generator.ts#L1160-L1198))

```
全セルをシャッフル → 10セルごとにGoods配列もシャッフル
  各セルについて、Goods配列を順に試す:
    good.chance(%) の乱数判定に通る
    かつ good.distribution という条件式(DSL文字列)が true
    かつ その good の累積配置数が resourceMaxCells 未満
    → そのセルに good.i (1種類だけ) を割り当てて次のセルへ
```

- `distribution` は文字列として保持され、`new Function()` で実行時にコンパイルされる条件式。`getMethods()`([goods-generator.ts:1253-1273](../../src/extensions/economy/generators/goods-generator.ts#L1253-L1273))が提供する判定関数:
  - `biome(...ids)` — バイオームID一致
  - `minHeight(n)` / `maxHeight(n)` / `elevation()` — 標高条件(`elevation()`は`h/100 > Math.random()`という確率的判定)
  - `shore(...rings)` — 海岸線からの距離リング
  - `type(...types)` — 海洋/湖沼/塩湖などのfeature種別
  - `river()` — 河川セルか
  - `minTemp(n)` / `maxTemp(n)` — 気温条件
  - `habitability()` / `minHabitability(n)` — バイオームの生息可能性
  - `nth(n)` / `random(n)` — 追加の間引き・確率調整
- `resourceMaxCells = Math.ceil(200 * 総セル数 / 5000)` — 1つのgoodにつき配置できるセル数の上限。マップ規模に比例し、目安は全セルの約4%。同一goodが枯渇せず希少資源として機能するための密度キャップ。
- **1セルにつき資源は1種類のみ**(最初にマッチしたgoodで確定、`break`)。

#### バイオーム背景生産(`biomeOutput`)

`biomeOutput` は good ごとに定義された `{ biomeId: 係数 }` のテーブルで、抽選を経ずに「そのバイオームの人口を持つ全セルが恒常的に産出する」背景生産を表す。例:

```ts
// Wood
distribution: "biome(5, 6, 7, 8, 9)",
biomeOutput: { 5: 0.1, 6: 0.1, 7: 0.1, 8: 0.1, 9: 0.1, 12: 0.05 }
```

Woodはボーナス資源としても`biome(5,6,7,8,9)`で抽選されるが、それとは別に、これらのバイオームの全セルが人口比例で恒常的に木材を産出する。`getCellProduction()`([production-utils.ts:106-140](../../src/extensions/economy/generators/production-utils.ts#L106-L140))がこの2つを合算する。

### 2.2 生産量への変換

```
背景生産 = pop * biomeOutput係数 * modifier
ボーナス資源 = min(pop * 係数, MAX_BONUS_PRODUCTION=5) * modifier
  係数: 農村 0.25 (BONUS_RURAL_PRODUCTION) / 都市 1 (BONUS_URBAN_PRODUCTION)
```

`modifier` は `good.multipliers` の `cultureType` / `culture` / `state` / `religion` / `biome` / `zone` を全て掛け合わせたもの([production-utils.ts:26-57](../../src/extensions/economy/generators/production-utils.ts#L26-L57))。加えてWoodのみ森林伐採による枯渇(`getDepletionMultiplier`)、食料品には季節係数(`getSeasonalProductionMultiplier`)が乗る。

生産物は市場で売られ `burg.product`(粗利)・`burg.treasury` になり、Burgs Overviewの **Product / Product per 1k residents(Wealth)** 列に表れる([index.tsx:148-163](../../src/extensions/economy/index.tsx#L148-L163))。

## 3. 造船関連Goodsのバイオーム依存性

造船4資材(Wood, Sails, Ropes, Tar)と、その原料チェーンの`distribution`/`biomeOutput`/`recipes`を整理する([goods-generator.ts:93-1039](../../src/extensions/economy/generators/goods-generator.ts#L93-L1039)のGOODS_DATA)。

| Good | 種別 | distribution / recipe | biomeOutput |
|---|---|---|---|
| Wood | 原料 | `biome(5,6,7,8,9)` | `{5:.1,6:.1,7:.1,8:.1,9:.1,12:.05}` |
| Hemp | 原料(Ropes/Sails/Paperの原料) | `biome(6,7,8)` | `{6:.1,7:.1,8:.1}` |
| Sheep | 原料(Clothの原料、Sailsの間接原料) | `biome(3,4) or biome(6)`等 | `{4:.1}` |
| Tar | 中間財 | recipe: `{Wood:1}`(chance=0、抽選なし・生産のみ) | — |
| Ropes | 中間財 | recipe: `{Hemp:1}` | — |
| Cloth | 中間財 | recipe: `{Sheep:1}` or `{Hemp:1}` or `{Silk:0.5}` | — |
| Sails | 中間財 | recipe: `{Cloth:1}` | — |
| **Ships** | 最終財 | recipe: `{Wood:2, Sails:2, Ropes:2, Tar:1}` | — |

Wood/HempはいずれもバイオームID **5〜9**(Tropical seasonal forest / Temperate deciduous forest / Tropical rainforest / Temperate rainforest / Taiga)に限定される。Tar/Ropes/Cloth/Sails/Shipsは`chance: 0`・`distribution`なしで、**抽選配置されず**recipeによる生産のみ(=原料さえ市場にあれば加工可能で、バイオーム制約は原料側にしかない)。

## 4. バイオームと富の傾向(コードからの仮説)

### 4.1 森林バイオームはhabitabilityが最も高い側にある

`src/generators/biomes.ts` のデフォルトhabitabilityテーブル([biomes.ts:51](../../src/generators/biomes.ts#L51)):

| biome ID | 名前 | habitability |
|---:|---|---:|
| 1 | Hot desert | 4 |
| 2 | Cold desert | 10 |
| 3 | Savanna | 22 |
| 4 | Grassland | 30 |
| 5 | Tropical seasonal forest | **50** |
| 6 | Temperate deciduous forest | **100**(最大) |
| 7 | Tropical rainforest | **80** |
| 8 | Temperate rainforest | **90** |
| 9 | Taiga | 12 |
| 10 | Tundra | 4 |
| 12 | Wetland | 12 |

Wood/Hempの対象バイオーム(5,6,7,8)は、Taiga(9)を除き**全バイオーム中もっとも人口を養える土地**である。造船原料の産地は、資源が希少な辺境ではなく、むしろ人口密度が最も高くなりうる主要な生産地帯と重なっている。

### 4.2 単位価値は低い側にある

`good.value`(goods-generator.tsのGOODS_DATA)を比較すると:

| Good | value | 備考 |
|---|---:|---|
| Wood | 1 | 原料、嵩物 |
| Hemp | 1 | 原料、嵩物 |
| Tar | 2 | 一次加工 |
| Ropes | 3 | 一次加工 |
| Sails | 8 | 二次加工 |
| **Ships** | **80** | 全GOODS_DATA中、最高値 |
| (参考) Gold | 40 | 鉱物・高標高依存 |
| (参考) Silk / Spices | 16 / 18 | 熱帯雨林バイオーム依存の奢侈品 |

原料(Wood/Hemp=1)と最終財(Ships=80)の間に80倍の価値差がある。加工度を上げるほど同じ原料量から得られる価値が跳ね上がる構造。

### 4.3 鉱物系はバイオームでなく地形(標高)に依存する

Gold/Silver/Iron/Copper/Tin/Gemstones/Marbleはいずれも `minHeight()` / `elevation()` 条件が主で、`biome()`条件を持たない(Ironのみ`biome(12) && nth(7)`を選択肢の一つとして持つ)。つまり「山国は富む」はバイオームの話ではなく地形の話であり、森林バイオームか砂漠バイオームかを問わず山岳地形さえあれば出現しうる。

### 4.4 Naval文化タイプ補正

`multipliers.cultureType.Naval` を持つgoods([goods-generator.ts](../../src/extensions/economy/generators/goods-generator.ts)):

| Good | Naval倍率 |
|---|---:|
| Ships | ×2.0 |
| Fish / Sheep | ×1.4 |
| Salt / Tar(Huntingのみ) | ×1.2 |
| Pearls / Whales | ×1.4 |
| Leather | ×0.6(減衰) |

Naval文化はShips生産を2倍にし、水産物・Sheep(Cloth原料)にもボーナスを持つ。§8.5候補②(海洋依存の小国)は、この補正だけで水産品+一部加工品に特化する構成が成立しやすい設計になっている。

### 4.5 既存の交易利益分析との整合

`docs/analytics/trade-profit-viability-after-goods-rebalance.md` によれば、価値リバランス後の交易利益上位goodsは:

> Perfume, Artillery, Coins, Jewelry, Elephants, Gunpowder, Spices, **Ships**, Gemstones, Silk, Books

であり、「生の嵩物(grain, stone, bulky raw materials)は個人商会の利益源として弱い」と既に結論づけられている。Shipsはこのリストに入る数少ない軍需系最終財であり、造船を単なる資材消費ではなく地域の輸出産業として見た場合、既存の交易モデル上も高収益部類に入る。

## 5. 結論と§8.5への示唆

1. **「造船材料バイオーム=富む/貧しい」の二分法は成立しない。** habitability(高い)とvalue(低い)が逆方向に働くため、原料のまま留まる集落は「人口は多いが単位価値が低い」中庸の富にとどまる。
2. **富の分岐点は加工チェーンの完成度。** Wood/Hemp/Sheep → Tar/Ropes/Cloth/Sails → Shipsまで国内で回せている国家は、既存の交易利益分析上もトップクラスの収益性を持つgoodsを生産していることになる。§8.5候補①(裕福な国+港多数)は、この加工チェーンを維持できる大国と対応しうる。
3. **鉱物資源(Iron等、造船に必要な金具・道具の原料)はバイオームでなく地形依存。** 森林バイオームと山岳地形が重なる地域(例: 標高の高い温帯落葉樹林)は、Wood/Hemp/Iron/Toolsを同時に持てる可能性がある。
4. **Naval文化タイプは水産品+Shipsに集中したボーナスを持つ**ため、§8.5候補②(海洋依存の小国)はNaval文化との相関が高いと推測できる。
5. 初期在庫の較正は、上記の「加工度に応じた価値の非対称性」を踏まえ、原料在庫よりも中間財(Tar/Ropes/Sails)の初期保有量の方が国家の造船能力に効きやすい可能性がある。

## 6. 未実施の実測検証(今後の課題)

本調査はコードリーディングのみによる仮説であり、実際のマップ生成結果による検証は行っていない。既存の類似調査(`docs/analytics/urban-resource-bonus-rebalance.md`)は次の手法を確立している:

- `npm run dev` + Playwright CLIで実マップを生成
- Economy拡張(`characters`拡張も必要)を有効化し、`window.fmg.actions.advanceTime()`で生産サイクルを進行
- `window.fmg.world.pack` を直接ダンプしてJSON/CSVで比較

これを応用した検証案:

- Burgs Overviewの CSVエクスポート(`downloadBurgsData()`, [burgs-overview.ts:216](../../src/controllers/burgs-overview.ts#L216))はProduct/Wealth/Treasury/Port列を持つが**Biome列を含まない**ため、`pack.cells.biome[burg.cell]`との結合をスクリプト側で行う必要がある。
- 複数シードでマップを生成し、バイオーム別・Port有無別にWealth(Product per 1k)の分布を集計する。
- Wood/Hemp産地国家とTar/Ropes/Sails/Shipsの実生産量・Treasuryの相関を確認し、§4の「加工チェーン仮説」を検証する。

この実測検証は本調査の範囲外とし、必要になった時点で別途実施する。
