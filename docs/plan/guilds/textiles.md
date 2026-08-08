# textiles

`src/extensions/economy/generators/goods-generator.ts`

```ts
  {
    name: "Cloth",
    warEconomyType: "strategic",
    tags: ["clothing"],
    icon: "good-cloth",
    color: "#e8e69c",
    value: 6,
    chance: 0,
    recipes: [{ Wool: 1 }, { Hemp: 1 }, { Cotton: 1 }],
    unit: "bolt",
    demandCoverage: { utilities: 0.2 }
  },
  // Raw-material / processed-good chains: sheared/grown fiber feeds Cloth & Linen so textile
  // manufacturing has an actual import-raw/export-finished trade loop instead of consuming the
  // live-animal Good directly (see docs discussion on medieval wool/flax trade).
  {
    // Renewable, cell-local shearing yield (woolProduction.ts's getWoolOutput(), wired into
    // production-utils.ts's getRuralProductionContributions() the same way Milk is) — driven by
    // this cell's own live Sheep headcount, never consuming/culling it. Replaces the earlier
    // `recipes: [{ Sheep: 1 }]` (found 2026-08-08: that modeled "make 1 Wool" as "slaughter 1
    // Sheep" 1:1, the same treatment Leather correctly uses for Cattle/Game/Horses/Camels — but
    // wool is sheared, not slaughtered. Worse, it put "buy Sheep to make Wool" in direct
    // competition with Sheep's own `demandCoverage.food`-driven retail sale inside the SAME
    // per-burg production-decision slot every cycle; food's larger DEMAND_TARGET_FACTORS weight
    // meant Wool essentially never won that comparison — 0 stock/0 sales over a full year on a real
    // map despite ample Sheep supply. Mirroring dairy.ts's Milk pattern removes the competition
    // entirely: Wool is now a byproduct of the standing herd, produced whether or not any Sheep are
    // also sold as food that month. Cloth (goods-generator.ts, below) stays an ordinary burg-craft
    // recipe good consuming this — see dairy.ts's module doc-comment for why that half of the
    // pattern (Milk/Wool direct, Cheese/Cloth recipe-based) keeps craft employment and guild
    // participation intact. See docs/plan/fauna-biome-realism.md's Wool/Sheep investigation.
    name: "Wool",
    tags: ["clothing"],
    // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet (see good-unknown).
    icon: "good-unknown",
    color: "#f2e9d8",
    value: 2,
    chance: 0,
    unit: "fleece"
  },
```

```ts
  {
    name: "Hemp",
    value: 1,
  },
  {
    name: "Silk",
    value: 16,
  },
  {
    name: "Cotton",
    value: 2,
  },
```

以前の `{ Silk: 0.5 }` を `{ Silk: 0.25 }` に減らすだけでは、絹相場が上がれば再び赤字になる。また、絹を平民向け織物の代替原料にする設計自体が不自然である。

`docs/plan/goods-unit-scale.md`

```md
## 全Goods監査 — 値を変えるべき条件

| 完成品 | 現行の赤字経路 (基準原料費) | 設計上の修正 | 修正後の最小利幅 |
| --- | --- | --- | ---: |
| Cloth (5) | Silk ×0.5 (8) | Silk を`0.25`にする（旧案） | 1 |
```

## 需要

Clothの需要は人口増が支える。
破損・買い替え・予備などで需要は無くならない。

## 2026-08-08 再検討 — 平民衣料と価格

### 結論

- `Cloth` は平民・兵員・船舶向けの一般織物であり、レシピを `{ Wool: 1 }` / `{ Hemp: 1 }` / `{ Cotton: 1 }` とする。絹を一般布へ変換する `{ Silk: 0.25 }` は廃止する。
- `Cloth.value` は `5 → 6` にする。最も高い一般繊維である Wool/Cotton (`value: 2`) からでも、織り・整経・仕上げという手工業の余地を `4` 残す。`value` は小売の一着価格ではなく、`bolt` 一荷の市場会計値である。
- `Garments` の `utilities: 1` は、全人口向けの普段着需要を表す。したがって `{ Cloth: 1 }` / `{ Linen: 0.75 }`（寒冷地は `{ Cloth: 0.5, Furs: 1 }`）に限定する。全ての普段着に高価な Dyes と Alum を投入する現行経路は採らない。
- Silk (`value: 16`) は輸入・宮廷・富裕層向けの独立した luxury Good として残す。高品質キャラクターの装備、タペストリー等の高級工芸が消費先であり、平民衣料の代替原料ではない。

### 根拠とスケールの注意

中世ヨーロッパを単一の定価に換算することはできない。地域・年代・布幅・等級・染色・仕立ての別に価格差が非常に大きく、史料データも布価を職人日当たりの購買力と併せて記録している。この Economy の `value` はその個別小売価格ではなく、`bolt` / `set` ごとの交易・製造会計値である。

ただし素材の社会的な区分は設計に利用できる。平民の服は自家羊毛の毛織物、麻の下着、地域によって麻・木綿が中心で、絹は輸入され一部の富裕層しか買えなかった。従って、一般衣料を絹の相場に直接連動させるより、絹を別の luxury 財として流通させる方が史実・市場挙動の双方に整合する。

### 赤字が再発しない理由

基準値での `Cloth` の原料費は Wool/Cotton が最大でも `2 × 1 = 2`、販売基準値は `6` である。Silk を削除したため、絹の局地的な高騰が一般 Cloth の製造原価に入り込むこともない。実勢相場は需給で変動するため一時的な逆ざやはあり得るが、`Production` はその時点の買値と売値で採算を判定し、不採算経路を選ばない。

### 参照

- National Museum of Finland, [Clothing in the Middle Ages](https://www.kansallismuseo.fi/en/olavinlinna/clothing-in-the-middle-ages) — 一般的な衣料の羊毛・麻と、輸入絹が一部の富裕層向けだったこと。
- Rutgers Medieval and Early Modern Data Bank, [Textile Production, Wages, and Prices (Munro)](https://memdb.libraries.rutgers.edu/index.php/munro-prices-wages) — 1330–1571 年の英仏・低地諸国の織物価格、賃金、消費バスケットの一次帳簿由来データ。
- John H. Munro, [Hanseatic commerce in textiles…](https://ideas.repec.org/p/pra/mprapa/11199.html) — 安価な軽量織物から高級毛織物までの価格階層と、職人日当たりでの比較。

## その他の参考資料

`src/extensions/economy/generators/guildKnowledgeTypes.ts`
