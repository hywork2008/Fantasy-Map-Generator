# 商品(Goods)の unit ロット化フレーバー計画 — 「1 unit は実際何個分か」

## 状態

**設計更新済み・未実装**。 [currency-denomination.md](currency-denomination.md) の「個人視点(プレイヤーキャラクター)の価格スケール問題」(未確定・要調整事項 9)から派生した、独立した設計文書。通貨のデノミネーションとは別軸の、Goods テーブルの `unit` 解釈に関する計画である。2026-08-01 に現行 `GOODS_DATA` 全111品目と全46加工品のレシピを再試算し、表示専用の単位フレーバーと、実際に経済計算へ影響する値・レシピの修正範囲を確定した。

## 通貨デノミ計画との関係、別文書にする理由

[currency-denomination.md](currency-denomination.md) は 🟡 という**通貨**を金貨/銀貨/銅貨に表示レイヤーだけで置き換える計画であり、スコープを通貨側に絞っている。本ドキュメントが扱うのは、Boots(`value: 7`, `unit: "pair"`)のような**商品(Goods)側**の `unit` が実際には何個分の物理アイテムを指すのかというフレーバー値の追加であり、通貨の変換ロジック(`GOLD_TO_SILVER_RATE` 等)には一切触れない。実装時に触るファイルもほぼ重ならない(通貨側は `src/utils/unitUtils.ts` 系、本計画は `src/extensions/economy/generators/goods-generator.ts` 周辺のフレーバー定義)ため、別文書として切り出す。

両ドキュメントは同じ「内部の保存値・計算式は一切変更せず、意味づけだけを追加するフレーバーレイヤー」という手法を共有している。ただし本監査では、Bread/Flour の小売スケールと、8加工品の赤字代替レシピについては、表示だけでは解決できない実データ修正が必要と判明した(後述)。

## 「unit = ロット」解釈の既存の裏付け

本計画の前提(`unit` は個数ではなくロット単位)は、当て推量ではなく既存のバランス調査文書とも整合する。[trade-profit-viability-after-goods-rebalance.md](../analytics/trade-profit-viability-after-goods-rebalance.md) は Goods 価値の再調整後の交易利益を検証した文書で、`value 1 = Grain 1 wain` を**「1人日」ではなく「荷車単位の会計価値」と読む前提**を明記している(同文書冒頭)。つまり `unit` をロット単位として読む本計画の解釈は、Grain の交易バランス調整で既に採用されていた前提の延長線上にあり、Boots のような個数単位の商品にも同じ解釈を適用するのは筋が通っている。

## 背景・目的

[currency-denomination.md の「個人視点(プレイヤーキャラクター)の価格スケール問題」](currency-denomination.md#個人視点プレイヤーキャラクターの価格スケール問題新規確認優先度上昇)で確認した通り:

- Boots(`goods-generator.ts:911-919`)は `value: 7`、`unit: "pair"`。[cost-of-living.md](../analytics/cost-of-living.md)の農民一人の年間最低生存費(約0.34🟡)と比較すると、**ブーツ1足で生存費約20年分**という非現実的な価格になる。
- Trade キャラバンの取引量(`markets-generator.ts` の `units`)は端数(例: 0.5)になり得る。バレルやワゴンのような「元々ロット単位」の商品なら「半バレル」は自然だが、Boots のような不可分な個数単位で「0.5足」という表示は不自然。

2026-08-01 の会話で出た提案: **Boots の「1 unit」を文字通り「靴1足」ではなく、「N足分のロット(卸売出荷単位)」というフレーバー値として再定義すれば、両方の問題が一挙に解決する。**

- 価格の問題: 1 unit = 20足のロットなら、実質1足あたり `7 / 20 ≈ 0.35 old🟡` となり、生存費と比較して妥当なレンジに収まる。
- 端数の問題: 「0.5 unit」は「ロットの半分(10足)」という、他の bulk 商品(バレル・ワゴン等)と同じ自然な部分出荷の意味になる。

Boots と酒場小売の参照値には、`value` や `unit` の実数・計算式を変えない**表示・ドキュメント専用のフレーバー値**を使う。これは [currency-denomination.md](currency-denomination.md) のフェーズ1(🟡→銀貨の表示置き換え)、[cost-of-living.md](../analytics/cost-of-living.md) の住宅価格、「1食」と同じ手法である。Bread/Flour と後述の赤字レシピは、この原則の明示的な例外である。

## 既存の Goods テーブルにおける unit の使われ方調査

`goods-generator.ts` 内の現行 `GOODS_DATA` 全111品目の `unit` を集計した結果:

| unit語 | 件数 | 性質 |
| --- | --- | --- |
| barrel / wain / wagon / sack / bag / bundle / bale / chest / pallet / bottle / basket / roll / ream / coil / bolt / pile / block / bullion / set / quiver / pouch / vessel / beam | 85件 | **既に容器・荷姿・複数品目のセットを意味する会計ロット**。0.5単位の端数取引も自然であり、品目別の個数フレーバーは不要。 |
| head | 8件(Cattle, Horses, Elephants, Camels, Sheep, Goats, Pig, Chicken) | **既に1頭=1匹で曖昧さがない**。価格は家畜・役畜という資本財として読むべきで、個人の年次生活費との直接比較対象ではない。 |
| slave | 1件(Slaves) | head と同様、1 unit=1人で曖昧さなし。本ドキュメントの対象外(倫理的にも価格面の「お得感」演出は避けるべき題材)。 |
| pair | 1件(Boots, value 7) | **表示フレーバー対象**。`1 unit = 20 pairs` と明示して小売換算・端数取引を自然にする。経済値は変更しない。 |
| loaf | 1件(Bread, value 3) | **表示と実データの両方の対象**。`1 unit = 20 loaves` を明示し、Flour と合わせて `Flour: 1.5` / `Bread: 2` に調整する。1個約1.2CPとなり、加工利幅も維持できる。 |
| barrel(Wine, value 5) | 1件 | **対象外(unit自体は問題なし)、ただし別種の課題を発見**。「1樽」は既に自然なロット単位で端数取引も問題ない。ただし樽の内容量から1杯あたりの小売価格を逆算すると、通貨デノミ計画で既出の「銅貨未満に沈む」問題と同じ現象が起きることが判明した。詳細は後述。 |
| pearl / gem / stone / pelt / fleece / tusk / branch / volume / ship / cannon / service / piece / wheel | 15件 | 高級素材・完成資本財・サービスであり、高額な単体表示は意図どおり。`value` は小売価格ではなく市場会計値なので、年次生活費との比率だけで変更しない。 |

**結論: 個数フレーバーを必要とするのは Boots と Bread のみ**であり、「単数形の unit を持つ商品を全てロット化する」対応は採らない。Wine/Beer は卸売ロットと酒場小売を分ける表示上の問題、Bread/Flour と赤字加工経路は実際の経済データ問題として分けて扱う。

## Boots の具体例(試算)

```text
Boots: value = 7 old🟡 / unit ("pair")
農民一人の年間最低生存費(cost-of-living.md) ≈ 0.34 old🟡/年

現状(1 unit = 1足という文字通りの解釈):
  7 / 0.34 ≈ 20.6年分の生存費 → 明らかに非現実的

提案(1 unit = 20足分のロットというフレーバー値を追加):
  1足あたりの実質価格 ≈ 7 / 20 = 0.35 old🟡 ≈ 生存費のほぼ1年分
  → まだ高価だが、「たまに買う耐久財」として現実的なレンジ
  → 銅貨換算(currency-denomination.mdのレート採用時): 0.35 SP × 12 ≈ 4.2銅貨/足
    → 「1食 ≈ 銅貨1〜3枚」と比較しても、靴1足が食費1〜2日分よりやや高い程度という妥当な相対スケールになる
```

`itemsPerUnit = 20` を本計画の採用値とする。これは厳密な史料上の梱包規格ではなく、0.5 unit を10足として自然に読め、小売換算も整合するゲーム内フレーバー値である。

## Bread(loaf)についての分析 — 小売フレーバーと加工利幅を同時に直す

Bread(`value: 3`, `unit: "loaf"`)も同じ試算をすると `3 / 0.34 ≈ 8.8年分` となり、Boots(耐久財、たまに買う)よりむしろ深刻——パンは毎日消費する主食であるため。

### レシピは物理重量ではなく Economy unit の投入比である

Bread は `recipes: [{ Flour: 1 }]` を持つ。この `1:1` は「127kg の史実上の sack からパン1個を焼く」という物理的換算ではなく、全Goodsに共通する **Economy unit 同士の投入比**である。`sack`、`wain`、`barrel` の内容量はコードで定義されておらず、英国の特定の sack 容量を当てはめて250個と断定することはできない。

ただし、このことは Bread を1個と読める理由にはならない。`value: 3` を生活費・銅貨スケールにそのまま当てると不合理なので、Bread は他の加工品と同様に市場用バッチであることを明示する必要がある。物理量を決めるのはレシピではなく、表示専用の `itemsPerUnit` とする。

### 確定するバッチと値

Bread は `1 unit = 20 loaves` とする。これは一回の焼成・近隣市場への出荷として無理のない量であり、0.5 unit は10個である。現行の `Bread.value = 3` のままなら1個は1.8CPとなるが、パンは日常食の一部なのでこの水準は高い。

`Bread.value` だけを1.5〜2へ下げると、現行 `Flour.value = 2` を丸ごと投入するレシピが赤字になり、`Production` の原料購入ゲートで継続生産されない。したがって Bread は単独では変更しない。Flour と一組で次のように変更する。

### 試算(内部値変更を伴う採用案)

```text
目標: パン1個の実勢価格が、currency-denomination.md で既に採用済みの
      「酒場での質素な1食 ≈ 銅貨1〜3枚」という基準に対し、パンは食事の一部品に過ぎない
      ことを踏まえ、その中でも低めの銅貨1枚程度(≈1食の1/3〜1/1)に収まることとする。

  1 CP ≈ 1/12 old🟡(SP)(currency-denomination.md の SILVER_TO_COPPER_RATE=12 を流用)
  採用値:
    Flour.value: 2 → 1.5
    Bread.value: 3 → 2
    Bread.itemsPerUnit: 20 loaves

  1 loaf = 2 / 20 SP = 0.1 SP = 1.2CP
  Flour → Bread の基準加工利幅 = 2 - 1.5 = 0.5 SP / Economy unit

→ 1個のパンは銅貨約1枚、加工品は原料より高く、加工者にも正の利幅が残る。
```

この変更は `goods-generator.ts` の実データを変更する。Food Ledger の主食基準は引き続き Grain であり、Grain の値は変更しない。実装時にはレシピ原価の非赤字検証をテストに追加する。

Bread と Grain(原材料、`cost-of-living.md` の生存費算出の基準)の関係は、Flour を介した間接的なものであり、Grain 自体の `value` を変更する話ではない。

## Wine(barrel)についての分析 — unit自体は問題ないが、1杯の小売価格が別の問題を露呈させる

2026-08-01 の会話で出た追加の検証依頼: 「Wineが1樽だとすると、1樽の内容量、一人が飲む常識な量から銅貨何枚分になるか、パンと一緒に食事として摂れる常識的な価格が出せないか」。

Wine(`goods-generator.ts:285-297`)は `value: 5`、`unit: "barrel"`。「1樽」は既に容器・ロット単位であり、0.5樽のような端数取引も「半樽」として自然——本計画が対象とする「discrete-unitの誤解」問題はそもそも存在しない。しかし、樽の内容量から1杯あたりの小売価格を実際に逆算すると、別の問題が露呈する。

```text
前提(概算値、確定した史料ではなく試算用の仮定):
  中世イングランドのワイン樽(barrel)標準容量 ≈ 119リットル(31.5ガロン、史実上の実在の単位)
  1杯(cup)の分量 ≈ 200ml
  → 1樽あたり ≈ 595杯

Wine: value = 5 old🟡(SP)/barrel
  5 / 595 ≈ 0.0084 SP/杯 ≈ 0.1 CP/杯(SILVER_TO_COPPER_RATE=12換算)
```

**1杯あたり約0.1銅貨——銅貨1枚の1/10にしかならない。** これは [currency-denomination.md](currency-denomination.md) の「[少額決済(外食1食など)についての追加検討](currency-denomination.md#少額決済外食1食などについての追加検討)」で既に確認された「生穀物の1日分コストが銅貨1枚の1%にも届かない」問題と**全く同じ現象**である。原因も同じ: Wine の `value` は burg間の卸売ロット取引(caravan)向けにバランス調整された値であり、酒場で1杯単位に小分けして売るための小売価格として設計されたことは一度もない。

### 対応方針: 樽の`value`から機械的に逆算しない、独立したフレーバー値として「1杯」を定義する

[currency-denomination.md](currency-denomination.md)が「1食」で既に採用した解決策と同じ手法をそのまま踏襲する: 樽の卸売`value`から1杯単価を割り算で逆算するのではなく、**「酒場で提供されるワイン1杯」を独立したフレーバー値として直接定義する**。

- 採用フレーバー値は **ワイン/ビール1杯 ≈ 銅貨1枚** とする。「1食(銅貨1〜3枚)」に統合して「食事+酒 ≈ 銅貨2〜4枚」と見せることもできる。いずれも `currency-denomination.md` の「1食 ≈ 銅貨1〜3枚」と同じ粒度・同じ性質(既存の財政ロジックに一切接続しないUI/ドキュメント専用フレーバー)である。
- Wine の `unit`(barrel)自体にはフレーバー値([Boots](#boots-の具体例試算)のような`itemsPerUnit`)は不要——問題の所在は「unitの意味の誤解」ではなく「卸売ロット価格を割り算しただけでは小売の1回分価格にならない」という、通貨デノミ計画で既に扱った論点の再現であるため。
- Beer(`value: 3`, 実装時は`4`, `unit: "barrel"`)にも Wine と同じ独立フレーバーを適用する。Liquor(`value: 12`, `unit: "vessel"`)は小容量の奢侈飲料として扱い、今回の酒場基準には加えない。

## 全Goods監査 — 値を変えるべき条件

`Good.value` は、小売一個の定価ではなく市場・交易・生産の **Economy unit あたり会計値** である。このため、全111品目について「年次生活費で割って高額か」だけで値を変更することはしない。値の変更を認める条件は次の二つに限定する。

1. 日用品を単数形で読んだ時の小売価格が破綻し、妥当なバッチ表示と値の組合せが必要なこと(Bread)。
2. 基準値で `output.value < Σ(input.amount × input.value)` となり、通常価格では製造するほど損をすること。

2番目を全46加工品・全110代替レシピに適用した。100経路は非赤字、10経路が赤字だった。以下は実装で同時に適用する修正であり、単位フレーバーとは異なり経済計算へ影響する。

| 完成品 | 現行の赤字経路 (基準原料費) | 設計上の修正 | 修正後の最小利幅 |
| --- | --- | --- | ---: |
| Tar (2) | Resin ×0.75 (4.5) | `Tar.value: 2 → 5` | 0.5 |
| Leather (6) | Horses ×1 (10), Camels ×1 (12) | 馬を`0.5`、駱駝を`0.25`にする | 1 |
| Cloth (5) | Silk ×0.5 (8) | Silk を`0.25`にする | 1 |
| Garments (12) | Linen ×1 + Dyes ×0.5 + Alum ×0.25 (12.25) | Linen を`0.75`にする | 0.75 |
| Preserved food (5) | Cattle ×1 + Salt ×1 (8)、Cattle ×1 + Vinegar ×0.5 (7) | 両経路の Cattle を`0.25`にする | 0 |
| Vinegar (4) | Wine ×1 (5) | `Vinegar.value: 4 → 5` | 0 |
| Beer (3) | Honey ×0.5 + Barrels ×1 (4) | `Beer.value: 3 → 4` | 0 |
| Tallow (2) | Cattle ×0.5 (2.5) | Cattle を`0.4`にする | 0 |
| Flour / Bread | Bread だけを下げると Flour ×1 (2) を下回る | `Flour.value: 2 → 1.5`、`Bread.value: 3 → 2` | 0.5 |

利幅0の Vinegar・Beer・Tallow は、原料の変質/副産物化を表すために許容する下限である。労務・需給による市場価格上振れはこの基準値の外で発生する。上表の変更を適用すれば、全110経路が基準値で非赤字となり、これ以外の値・レシピ変更は不要である。

## 全111品目の unit / value 監査記録

次表は現行カタログを unit ごとに全件列挙したもの。括弧内は現行 `value`。`cargo` は既存の単位語だけで部分出荷を説明できるためフレーバー追加不要、`asset` は単体の高額資本財・奢侈品、`retail batch` は今回の追加対象である。

| Unit | 品目 (現行 value) | 判定 |
| --- | --- | --- |
| pile | Wood (1), Mahogany (10) | cargo |
| pallet | Stone (1), Marble (8), Roman Concrete (6) | cargo |
| wagon | Iron Ore (2), Copper Ore (2.5), Tin Ore (3), Lead Ore (1.5), Iron Ingot (4), Copper Ingot (5), Tin Ingot (6), Lead Ingot (3), Bronze (8) | cargo |
| bullion | Silver Ore (10), Gold Ore (20), Silver Ingot (20), Gold Ingot (40) | cargo |
| wain | Grain (1), Fish (1), Game (2), Hemp (1), Coal (2), Clay (1), White sand (1), Ceramics (4), Glass (6), Preserved food (5), Cheese (5) | cargo |
| barrel | Wine (5), Olives (3), Honey (4), Tar (2), Sulfur (5), Saltpeter (4), Oil (4), Whales (3), Barrels (2), Gunpowder (12), Vinegar (4), Beer (3), Soap (6), Resin (6), Tallow (2), Potash (3) | cargo; Wine/Beer only retail reference |
| bag | Salt (3), Dyes (8), Sugarcane (4), Tea (10), Tobacco (8) | cargo |
| chest | Dates (7), Incense (12), Spices (18) | cargo |
| bale | Fodder (1), Peat (2), Cotton (2) | cargo |
| bolt | Silk (16), Cloth (5), Linen (6) | cargo |
| sack | Volcanic Ash (3), Lime (2), Flour (2), Alum (9) | cargo |
| roll | Leather (6) | cargo |
| set | Garments (12), Sails (8), Harnesses (10), Tools (14), Arms (24) | cargo / equipment set |
| coil | Ropes (3) | cargo |
| ream | Paper (5) | cargo |
| bottle | Ink (7), Perfume (28) | packaged luxury; no count needed |
| basket | Egg (1), Shellfish (2) | cargo |
| bundle | Medicinal herbs (10), Reeds (1), Flax (1), Stockfish (4) | cargo |
| block | Candles (10), Beeswax (5) | cargo |
| beam | Timber (3) | cargo |
| quiver / pouch / vessel | Arrows (3), Bullets (6), Liquor (12) | packaged cargo |
| head | Cattle (5), Horses (10), Elephants (30), Camels (12), Sheep (1), Goats (3), Pig (2), Chicken (1) | living asset |
| slave | Slaves (10) | person; no retail flavour |
| pearl / gem / stone / pelt / fleece / tusk / branch | Pearls (18), Gemstones (20), Amber (8), Furs (6), Wool (2), Ivory (35), Coral (16) | high-value material; value retained |
| volume | Books (18) | asset / luxury |
| ship | Sloop (80), Caravel (200), Galleon (480) | capital asset |
| cannon / service / piece / wheel | Artillery (70), Coins (45), Jewelry (55), Spinning Wheel (12) | capital asset / service |
| pair | Boots (7) | **retail batch: 20 pairs** |
| loaf | Bread (3) | **retail batch: 20 loaves; value 2 planned** |

## 設計方針: 表示専用フレーバーと経済値を分離する

- `Goods` 型へフレーバー値を追加しない。`value` と `recipes` はシミュレーションの入力であり、表示上の個数が混入すると誤用を招く。
- `src/extensions/economy/generators/goodsUnitFlavor.ts` を表示専用モジュールとして新設し、少なくとも次を保持する。経済計算コードからは参照禁止とする。

  ```ts
  type GoodsUnitFlavor = {
    readonly itemsPerUnit?: number;
    readonly itemNoun?: string;
    readonly retailReference?: { readonly label: string; readonly copperPrice: number };
  };

  // Boots: { itemsPerUnit: 20, itemNoun: "pairs" }
  // Bread: { itemsPerUnit: 20, itemNoun: "loaves" }
  // Wine / Beer: { retailReference: { label: "cup", copperPrice: 1 } }
  ```

- Wine/Beer の「1杯 ≈ 1CP」は樽値から逆算しない酒場小売の独立フレーバーである。Liquor は `vessel` が既に小容量包装を表し、奢侈飲料なので今回の小売基準には加えない。
- GoodsEditorDialog の価格セルのツールチップにのみ表示し、品目を新規作成・編集した場合には適用しない。表示対象は名前一致の既定Goodsに限る。

## 未確定・要調整事項

1. **通貨デノミ計画との実装順序**: フレーバーは先行実装できるが、CP表記を有効にするUIはデノミネーションの導入後にするか、暫定で`≈ one copper`という文言にするかを決める必要がある。
2. **食事+酒の見せ方**: Wine/Beerの1杯を単独表示するか、`Meal with drink ≈ 2–4 CP` として About の生活費説明へ統合するかはUI設計時に決める。
3. **動的・ユーザー作成Goods**: 本計画は既定カタログのみを対象にする。任意の新規Goodsへ物理換算を推測して自動適用しない。

## 実装ステップ(想定・未実施)

1. `GOODS_DATA` に「全Goods監査」の9行の値・レシピ修正を適用する。Breadだけでなく、赤字の代替レシピを残さない。
2. `goodsUnitFlavor.ts` を新規作成し、Boots/Breadの20個バッチとWine/Beerの独立した1CP小売参照を定義する。`Good` 型・市場・生産・交易コードは変更しない。
3. `GoodsEditorDialog` の既定Goodsの価格ツールチップへフレーバー文言をi18nで表示する。編集済みまたは新規Goodsには表示しない。
4. `GOODS_DATA` を復元するユニットテストに、全レシピの基準原料費が完成品値を超えないことを検証するテストを追加する。これは将来の値変更で赤字経路を再導入しないための回帰防止策である。
5. [cost-of-living.md](../analytics/cost-of-living.md) に代表的な耐久財・食品・酒場小売の価格説明を追記する。
6. `npx tsc --noEmit`、`npm run lint`、該当Vitest、既存テストスイートで回帰がないことを確認する。値変更後は生産・交易のスモーク確認も行う。

## 関連ドキュメント

- [currency-denomination.md](currency-denomination.md) — 本ドキュメントの発端(未確定・要調整事項 9・10)。通貨のデノミネーション計画。
- [../analytics/cost-of-living.md](../analytics/cost-of-living.md) — 本ドキュメントで基準として使う生存費アンカー値の算出根拠。
