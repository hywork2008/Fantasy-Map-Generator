# Wine 副産物設計: Pomace（搾りかす）・ポマースワイン・蒸留技術

## 状態

**設計 → 実装着手**（2026-08-12 設計、同日中に §1〜§4 のコア部分が実装され staged。詳細は §1.5 参照）

参照:

- [docs/temp/foods/wine.md](../temp/foods/wine.md) — ポマースワイン／蒸留酒／堆肥・飼料の三段階利用の史実根拠
- [docs/temp/0807-vinegar.md](../temp/0807-vinegar.md) — 「醸造の副産物」としてのポマース／劣化酒の先行整理
- [docs/plan/technology-development-roadmap.md](./technology-development-roadmap.md) — 技術グラフの実装済み契約（`TechnologyDefinition` / `TechnologyStage` / era 0–3）
- [docs/data/recipe-guild-skill-inference.csv](../data/recipe-guild-skill-inference.csv) 34行目 — Liquor に「Distillers' guild / distilling」を提案済み（未反映）
- [docs/plan/data/medieval-european-disciplines.csv](./data/medieval-european-disciplines.csv) 59行目 — Distillation を Alchemist/Apothecary/Vintner の技能として記録
- `src/extensions/economy/generators/goods-generator.ts`（GOODS_DATA, Wine/Ash/Brick/Coal/Preserved food/Smoked Cheese/Tar/Liquor の各定義）
- `src/extensions/economy/generators/production-generator.ts`（`executeManufacture` のレシピ実行）
- `src/generators/technologyDefinitions.ts` / `technologyProgress.ts`（技術ノードと State ゲート）

---

## 0. 前提となる指摘: レシピは m:1 ではなく m:n であるべき

現状の `Good.recipes?: Record<number, number>[]` は「複数素材 → 単一の完成品」の m:1 契約であり、`production-generator.ts` の `executeManufacture` も `state.inventory[good.i] += produced` の一箇所にしか出力を書き込まない。

ところが実際には、Wood を燃料として使うレシピが複数存在する:

| Good | 現在のレシピ | Wood の役割 |
| --- | --- | --- |
| Brick | `{ Clay: 1, Wood: 0.1 }` | 粘土の窯焼成 |
| Coal | `{ Wood: 1.5 }` | 木炭化（本プロジェクトの現行 Coal は鉱物石炭ではなく木炭の代用— §5 参照） |
| Preserved food | 12レシピ中1つ `{ Fish: 1, Wood: 1 }` | 燻製・乾燥 |
| Smoked Cheese | `{ Cheese: 1, Wood: 0.5 }` | 燻製 |
| Tar | `{ Wood: 1 }`（もう1レシピは `{ Resin: 0.75 }`） | 乾留（タール窯） |
| Ash（現行） | `{ Wood: 1 }` のみ | Ash 専用の「わざと燃やす」レシピ |

これらは全て Wood を燃焼・炭化させており、灰が出ないほうが不自然である。現行実装では Ash だけが独立した m:1 レシピ（Wood 1 → Ash 1）を持ち、他の燃焼レシピは灰を一切生成しない——これは Ash の生成経路をゲーム世界の実際の木材消費から乖離させている。

一方 Wine（`{ Grapes, Barrels } → Wine`）も同じ穴を持つ: 搾汁の残り（ポマース）が完全に消滅する。これが本設計の主題である「Grapes + Barrels → Wine + 搾りかす」という m:n レシピの必要性の核心。

**方針**: レシピエンジンを「主産物1つ + 副産物0個以上」の m:n に一般化し、Ash は「Wood を燃料として使う既存レシピの副産物」として複数の入口から自動的に供給されるようにする。Ash 専用レシピ（わざと燃やして作る）は削除せず、「他の燃焼副産物が無い/足りない集落のフォールバック」として残す（史実の灰焼き＝ポタシュ/リード灰生産者という独立職業の再現でもある）。

---

## 1. レシピエンジンの一般化（m:1 → m:n）

### 1.1 データ契約

`Good`（`goodsGeneratorTypes.ts`）に、`recipes` と**インデックス対応**する副産物配列を追加する:

```ts
export interface Good {
  // ...既存フィールドは無変更...
  recipes?: Record<number, number>[];
  /**
   * `recipes[i]` の副産物。存在しない添字（undefined）は「副産物なし」を意味する。
   * 数量のスケール基準は ingredients と同じ — `actualYield`（culture/guild ボーナス適用前）に
   * 乗算する。副産物量は「どれだけ燃料/原料を消費したか」に比例すべきで、職人の熟練度で
   * 灰の出方が変わるのは不自然なため、熟練ボーナスがかかる `produced`（最終出荷量）ではなく
   * 消費量ベースの `actualYield` を基準にする。
   */
  byproducts?: (Record<number, number> | undefined)[];
}
```

`GoodData`（GOODS_DATA の要素型）側も同様に `byproducts?: (Record<string, number> | undefined)[]` を追加。既存の50件超のレシピは配列を追加しないため**無変更**で済む（後方互換）。

### 1.2 名前解決（goods-generator.ts）

`GoodsModule.defaultGoods` のビルダー（既存の `recipes` 名前→id解決ループの直後）に、同型の解決を追加する:

```ts
let byproducts: Good["byproducts"];
if ("byproducts" in good && good.byproducts) {
  byproducts = good.byproducts.map(entry => {
    if (!entry) return undefined;
    const resolved = Object.entries(entry).map(([key, value]) => {
      const i = GOODS_DATA.findIndex(g => g.name === key);
      if (i === -1) throw new Error(`Unknown byproduct ${key} in good ${good.name}`);
      return [i + 1, value];
    });
    return Object.fromEntries(resolved);
  });
}
```

### 1.3 実行（production-generator.ts）

- `Recipe` 型（内部型、`{ good, ingredients }`）に `byproducts: Ingredient[]` を追加。
- `buildRecipesArray()`: `good.recipes` を走査するのと同じループ内で、対応する `good.byproducts?.[index]` を `Ingredient[]` に変換して積む。ingredients と異なり、参照先 Good が存在しない/`isGoodEnabled` が false でも**そのレシピ全体を無効にはしない**（副産物1件を静かに落とすのみ — 主産物の生産可否は副産物の存在に依存させない）。
- `ProductionCandidate` / `ProductionDecision.action` 経由で `byproducts` を末端の `executeManufacture` まで素通しする（`ingredients` が通っている経路と同じ配線）。
- `executeManufacture()`: 既存の「ingredients 消費 → `state.inventory[good.i] += produced`」の直後に副産物ループを追加:

```ts
for (const byproduct of ingredients_と同じ経路で受け取ったbyproducts) {
  const units = rn(actualYield * byproduct.amount, 2);
  if (units <= 0) continue;
  state.inventory[byproduct.goodId] = (state.inventory[byproduct.goodId] || 0) + units;
  this.addDemandCoverage(state.demandCoverage, byproduct.goodId, units, index.demandCoverageByGood);
}
```

副産物には主産物のような予算チェック（`ingredientCostPerUnit` によるアフォーダビリティ上限）や `getFoodProcessingProductionHeadroom` のような在庫上限は課さない——原材料費は主産物側で既に支払われており、副産物はその「おまけ」でしかないため。市場への供給過多は通常の価格発見メカニズムに委ねる。これは Wool（`woolProduction.ts` のコメント: 「群れの副産物として、売れるかどうかに関わらず生産される」）で既に採用されている設計哲学と同じ。

- `MfgRecord`（productionRecordTypes.ts）に `byproducts?: ProductionRecipeEntry[]` を追加し、`record.recipe` と対になる監査ログとして記録する（`DEBUG.production` 時のみ、既存の `candidates` と同待遇でも良い）。

### 1.4 影響範囲

- `buildProductionIndex` の `preservationGoods` / `preservationIngredientGoods` 判定（Wine の一点依存 Barrels を優先枠に入れる仕組み）は ingredients ベースのままで良い。副産物 Pomace は Wine の「入力」ではなく「出力」なので、この優先枠のロジックには影響しない・変更不要。
- 既存レシピは全て `byproducts` フィールドを持たないため、この変更はゼロ・マイグレーションの追加のみ。

### 1.5 見落とし: `Good.recipes` の実行経路は1つではない

**初版のこのドキュメントは、`production-generator.ts` の `executeManufacture()`（Burg の worker loop による通常製造）だけを「レシピ実行エンジン」として扱っており、これが唯一の実行経路であるという誤った前提に基づいていた。**

実際には `markets-generator.ts` の `settleCellFreshFood()` が、Grapes のような `freshFood` 品目をセル単位で処理し、`getCellFoodCommercialPath()`（`grapeWine` タグ＝Wine を優先して選ぶ）経由で `Good.recipes` を直接参照し、`addRuralOutput()` で市場在庫へ加算する——**Burg の worker loop を一切経由しない、独立した第二のレシピ消費経路**である。実際の Wine 生産量の大半はこちらの cell 直販経路を通っており、§1.3 の byproducts ループを `executeManufacture()` にしか実装しなければ、Wine だけが増えて Pomace が生成されないバグになる（実際に発生した）。

対応: `markets-generator.ts` に `executeManufacture()` と同型の byproducts 解決・付与ロジックを追加する。

```ts
/** Returns the outputs accompanying a cell-local recipe conversion. */
export function getCommercialRecipeByproducts(
  outputGood: Pick<Good, "recipes" | "byproducts">,
  sourceGoodId: number,
  sourceInputPerOutput: number,
  outputUnits: number
): { goodId: number; units: number }[] {
  if (outputUnits <= 0 || !outputGood.recipes?.length || !outputGood.byproducts?.length) return [];
  const recipeIndex = outputGood.recipes.findIndex(recipe => recipe[sourceGoodId] === sourceInputPerOutput);
  if (recipeIndex < 0) return [];
  return Object.entries(outputGood.byproducts[recipeIndex] ?? {}).map(([goodId, amount]) => ({
    goodId: +goodId,
    units: outputUnits * amount
  }));
}
```

`settleCellFreshFood()` が `addRuralOutput(marketId, collectionBurgId, commercialPath.outputGoodId, outcome.exportOutputUnits)` を呼ぶ箇所の直後に、同じ引数で `getCommercialRecipeByproducts()` を呼び、得られた各副産物にも `addRuralOutput()` を適用する（`addCommercialRecipeByproducts()` としてラップ）。

**教訓（後続の m:n 化タスクへの一般化）**: あるフィールド（ここでは `Good.recipes`）に新しい意味（byproducts）を追加するとき、「そのフィールドを読んでいる箇所」を実行系全体で洗い出さずに主要な1箇所だけを直すと、生成物の一部の経路だけが新仕様に追従し、残りは黙って旧仕様のまま動き続ける——症状は「特定の Good だけ増え方がおかしい」という形で遅れて表面化する。今回は経済拡張内で `.recipes` を参照する全箇所（`merchantTransportAssets.ts`, `metallurgWork.ts`, `goodsBalanceLedger.ts`, `tradeOpportunityEstimator.ts`, `marketFlowDiagnostics.ts`, `goods-editor.ts`）を洗い直し、他はいずれも表示分類・調達見積もり用の読み取り専用参照であり、実行経路はこの2箇所（`production-generator.ts` / `markets-generator.ts`）のみであることを確認した。

---

## 2. Ash を「専用レシピ」から「燃焼副産物」中心へ

新定数（Ash の定義近くに配置。Ash 自身の既存 `{ Wood: 1 }` レシピの 1:1 比率をそのまま再利用する）:

```ts
/** Ash 専用レシピの Wood:Ash = 1:1 比率を、他の「完全燃焼」レシピの副産物にも流用する。
 *  現実の灰収率（乾燥木材重量の1〜3%程度）とは大きく乖離した抽象化だが、Ash 自身のレシピが
 *  既にこの抽象化を採用しているため、副産物側もこれに合わせて内部一貫性を取る。 */
const ASH_YIELD_PER_WOOD_FULL_COMBUSTION = 1;
/** 木炭・タール窯のような低温乾留は、木材を燃やし尽くさず炭/タールとして温存するのが目的なので、
 *  完全燃焼より灰の回収率が大きく下がる。 */
const ASH_YIELD_PER_WOOD_PARTIAL_PYROLYSIS = 0.15;
```

適用（`recipes` と同じ添字に `byproducts` を追加するのみ、レシピ本体は無変更）:

| Good | 対象レシピ | 追加する byproducts | 根拠 |
| --- | --- | --- | --- |
| Brick | `{ Clay: 1, Wood: 0.1 }` | `{ Ash: 0.1 }` | 窯焼成は燃料を完全燃焼させる |
| Coal | `{ Wood: 1.5 }` | `{ Ash: 0.225 }` | 木炭化＝部分乾留（低収率） |
| Preserved food | 12番目 `{ Fish: 1, Wood: 1 }` のみ | `{ Ash: 1 }` | 燻製・乾燥は燃料を完全燃焼させる。他11レシピ（Salt/Vinegar系）は対象外 |
| Smoked Cheese | `{ Cheese: 1, Wood: 0.5 }` | `{ Ash: 0.5 }` | 燻製は完全燃焼 |
| Tar | `{ Wood: 1 }` のみ（`{ Resin: 0.75 }` は対象外） | `{ Ash: 0.15 }` | タール窯も部分乾留（低収率） |
| Liquor | 全15レシピ（§4 で Pomace 系3種追加後）— 全て `Wood: 1` を含む | 各 `{ Ash: 1 }` | 蒸留器の加熱は完全燃焼 |

Ash 自身の `{ Wood: 1 }` レシピは変更しない。副産物 Ash は原材料費ゼロで市場に供給されるため、`makeProductionDecision` の利益比較上、Brick/Coal/Smoked Cheese/Liquor が盛んな集落では Ash 専用レシピが自然に選ばれにくくなる——これはコード変更なしで生じる意図した創発効果であり、既存の Ash 専用レシピを削除する必要はない（燃焼系産業を持たない集落のフォールバック兼、史実の「灰焼き」という独立職業の再現として残す）。

---

## 3. Wine → Pomace（搾りかす）

### 3.1 新 Good: `Pomace`

```ts
{
  name: "Pomace",
  tags: ["food"],
  icon: "good-unknown", // TODO: placeholder icon — no hand-drawn SVG symbol exists for this good yet
  color: "#7a5c3e",
  value: 0.5, // 廃棄物に近い残渣。Wood(1) や Grapes(2) より明確に安く — 史実でも農民が無償同然で回収していた
  chance: 0, // Wine 生産の副産物としてのみ発生
  unit: "1,000 kg pomace lot",
  demandCoverage: {}
}
```

`recipes` は持たせない（Pomace はレシピの主産物として生産されることはなく、常に Wine の副産物としてのみ供給される）。

### 3.2 Wine 側の変更

`foodLots.ts` に新定数を追加:

```ts
/** 中世の圧搾技術では果汁を絞り切れず、破砕したブドウ質量のおよそ2割強が搾りかすとして残った
 *  （docs/temp/foods/wine.md）。 */
export const POMACE_SHARE_OF_PRESSED_GRAPE_MASS = 0.22;
```

Wine の定義に `byproducts` を追加（`recipes` 本体・`value` は無変更）:

```ts
recipes: [{ Grapes: GRAPES_LOTS_PER_WINE_LOT, Barrels: 0.08 }],
byproducts: [{ Pomace: GRAPES_LOTS_PER_WINE_LOT * POMACE_SHARE_OF_PRESSED_GRAPE_MASS }] // ≈ 0.057 lot/cask
```

---

## 4. ポマースワイン（ピケット）— 技術ゲートなし

wine.md の指摘どおり、ポマースワインの再醸造そのものには特別な技術は不要（水を加えて再発酵させるだけ）。よって**技術グラフに一切触れず**、通常のレシピ財として即座に生産可能にする。

### 4.1 新 Good: `Pomace Wine`

```ts
{
  name: "Pomace Wine",
  // Wine の luxury/grapeWine とは対照的に、庶民・労働者の日常的な水分補給源という史実上の位置づけ
  // （docs/temp/foods/wine.md）を反映し、Beer と同じ tags を持たせる。
  tags: ["food", "beverage"],
  icon: "good-unknown", // TODO: placeholder icon
  color: "#b08968",
  // 原価: Pomace 1.2*0.5 + Barrels 0.08*2 = 0.76。Beer(4)より明確に安く、
  // 「薄いワイン・3〜4%度数」という史実の位置づけどおり酒類中最安に置く。
  value: 2,
  chance: 0,
  recipes: [{ Pomace: 1.2, Barrels: 0.08 }],
  unit: "200 L cask",
  demandCoverage: { food: 0.15 }
}
```

Wine/Beer 専用の `returnableContainerLedger`（`recordWineCaskFilling`/`recordBeerCaskFilling`）には接続しない — Liquor と同様、Barrels 消費は片道の原材料コストとして扱う（`executeManufacture` の `good.name === "Wine" || good.name === "Beer"` 分岐はそのまま、Pomace Wine を追加しない）。

`demandCoverage: { food: 0.15 }` により、Wine/Ale のような専用世帯需要台帳（`WINE_TARGETS`/`ALE_TARGETS`）を新設せずとも通常の需要充足ロジックで生産動機が発生する。史実に忠実な「地域住民1人あたり年間消費量」モデルへの拡張は、必要になった時点での追加検討事項とする（本設計のスコープ外）。

---

## 5. 蒸留技術（Distillation）

### 5.1 技術ノード定義

`technologyDefinitions.ts` の `ERA_1`（後期中世の知識集積、火薬ワールドゲート不要）に追加:

```ts
{
  id: "distillation",
  label: "Alembic distillation",
  era: 1,
  scope: "state",
  // アランビック（蒸留器）は銅細工の技能を要し、技法自体は錬金術師・修道士による記録を通じて
  // 広まった（12〜13世紀、docs/temp/foods/wine.md）。既存ノードのうち、この2系統の知識を
  // 過不足なく代表するのが basicMetallurgy（銅器）と recordReplication（記録・複製）。
  prerequisites: ["basicMetallurgy", "recordReplication"],
  known: { min: { metallurgy: 0.15, printing: 0.1 } },
  demonstrated: { min: { metallurgy: 0.25, printing: 0.2, treasury: 20 } },
  adopted: { min: { metallurgy: 0.35, printing: 0.3, treasury: 40, urbanPopulation: 10 } }
}
```

`worldGates` は設定しない（火薬・大航海のような世界設定オプションに依存しない、常時挑戦可能な技術）。既存の `getGunpowderDemandTechMultiplier` / `getMaxShipClassTierForState` と同じパターンで `technologyProgress.ts` に以下を追加する:

```ts
/** Liquor のレシピを産出できる最低条件。蒸留器を持たない State には「Liquor」という概念自体が
 *  存在しない（Gunpowder の isGoodEnabled と同じ「未解禁ならGoodそのものが無い」設計を、
 *  world gate ではなく state gate として適用する）。 */
export function isDistillationKnown(stateId: number): boolean {
  return isTechnologyAtLeast("distillation", stateId, "known");
}
```

### 5.2 Liquor への接続

**判断**: Liquor の全レシピ（既存12種＋新設 Pomace 系3種、§5.3）を `distillation >= known` でゲートする。「Liquor」という財の本質が蒸留酒である以上、技術グラフ導入前は世界に存在しなかった財として扱うのが史実（wine.md: 蒸留酒は12〜13世紀以降）にもロードマップの設計原則（§1.2「発見だけでは社会全体の効果を得られない」、§5.2「State ごとの採用ゲート」）にも合致する。

実装箇所: `buildRecipesArray()` は Good 単位でグローバルに1回だけ構築されるため（State に依存しない）、State ごとの可否は**Burg 単位の候補生成**（`buildImmediateManufactureCandidate` / `planGoodAction` — Burg の `state` フィールドが既にスコープ内にある箇所、`getSalesTax(burg)` が `burg.state` を読む場所と同じ層）でフィルタする。

```ts
// production-generator.ts
import { isDistillationKnown } from "../../../generators/technologyProgress";

const STATE_TECH_GATED_GOODS: Readonly<Record<string, () => (stateId: number) => boolean>> = {
  Liquor: () => isDistillationKnown
};
```

候補生成の該当箇所で、`good.name` が `STATE_TECH_GATED_GOODS` に含まれ、かつ `burg.state` に対するゲート関数が `false` を返す場合はその Good の候補生成をスキップする。既存の `good.name === "Garments"` / `good.name === "Wine" || good.name === "Beer"` と同型の、Good 名ベースの軽量な特例分岐として実装する（一般的な「Good に技術ゲートを持たせる」フィールドを `Good` 型に恒久的に追加するほどの汎用性はまだ無く、対象が Liquor 1件のみのため過剰設計を避ける）。

`isGoodEnabled()`（world gate）とは独立した層であることに注意 — Liquor は gunpowderEraEnabled の影響を受けない。

### 5.3 Pomace Brandy（マール/グラッパ相当）— Liquor への新レシピ枝

既存の穀物・ワイン系3系統（Barrels/Ceramics/Glass 容器違い）と対称に、Pomace 系を追加する:

```ts
recipes: [
  // ...既存12レシピは無変更...
  { Pomace: 1.5, Wood: 1, Barrels: 0.5 },
  { Pomace: 1.5, Wood: 1, Ceramics: 0.25 },
  { Pomace: 1.5, Wood: 1, Glass: 0.25 }
],
byproducts: [
  // 既存12レシピ全てに { Ash: 1 }（§2 の表のとおり、蒸留は完全燃焼）
  ...Array(12).fill({ Ash: 1 }),
  { Ash: 1 }, { Ash: 1 }, { Ash: 1 } // 新設 Pomace 系3レシピも同様
]
```

Pomace 系レシピの原価: `1.5*0.5(Pomace) + 1*1(Wood) + 0.5*2(Barrels)` = 2.75、Liquor の value 12 に対し圧倒的な利幅——「ほぼ無価値な廃棄物を蒸留して高価な酒に変える」という史実の経済的インパクトをそのまま再現する。これは Ash/Egg/Flour で既に確立されている「単一素材変換・高利幅」パターン（コメント: "Flour's/Ash's own single-ingredient-conversion pattern"）と同系統。

### 5.4 任意の追加ポリッシュ: ギルド domain

`guildKnowledgeTypes.ts` の `CRAFT_KNOWLEDGE_DOMAINS` には既に `"instruments"` が宣言されているが、`CRAFT_DOMAIN_BY_GOOD_NAME` には一件もマッピングされていない未使用スロットである。`guildChapterSuitability.ts` 側の `case "instruments":` も「首都度＋人口＋市場」という、蒸留所・薬種商・錬金術師が集まる都市部という史実像に合致する式が既に実装済み。

```ts
// guildKnowledgeTypes.ts の CRAFT_DOMAIN_BY_GOOD_NAME に追加
Liquor: "instruments"
```

これにより Liquor 生産にギルド習熟ボーナス（`getGuildBonus`）が適用されるようになる。本設計の必須要件ではないが、`docs/data/recipe-guild-skill-inference.csv` が既に "Distillers' guild" を提案していることとも整合するため、低コストな追加として推奨する。

---

## 6. 実装チェックリスト

1. `goodsGeneratorTypes.ts`: `Good.byproducts` フィールド追加。
2. `goods-generator.ts`:
   - `GoodData.byproducts` フィールド追加。
   - `GoodsModule.defaultGoods` に byproducts 名前解決ロジック追加。
   - `ASH_YIELD_PER_WOOD_FULL_COMBUSTION` / `ASH_YIELD_PER_WOOD_PARTIAL_PYROLYSIS` 定数追加。
   - Brick / Coal / Preserved food / Smoked Cheese / Tar に `byproducts: [{ Ash: ... }]` 追加。
   - Wine に `byproducts: [{ Pomace: ... }]` 追加。
   - 新 Good `Pomace` / `Pomace Wine` 追加。
   - Liquor に Pomace 系レシピ3種 + 全レシピへの `{ Ash: 1 }` byproducts 追加。
   - （任意）`guildKnowledgeTypes.ts` に `Liquor: "instruments"` 追加。
3. `foodLots.ts`: `POMACE_SHARE_OF_PRESSED_GRAPE_MASS` 定数追加。
4. `productionRecordTypes.ts`: `MfgRecord.byproducts?: ProductionRecipeEntry[]` 追加。
5. `production-generator.ts`:
   - `Recipe` 型・`ProductionCandidate`/`ProductionDecision.action` 系型に `byproducts: Ingredient[]` を配線。
   - `buildRecipesArray()` で byproducts を構築(無効な副産物は個別に無視、レシピ自体は失活させない)。
   - `executeManufacture()` に副産物付与ループを追加。
   - `STATE_TECH_GATED_GOODS`（Liquor → distillation）による Burg 単位のフィルタを候補生成箇所に追加。
6. `markets-generator.ts`（§1.5 — 初版で欠落していた第二の実行経路。実装必須）:
   - `getCommercialRecipeByproducts()` を追加し、cell 直販経路（`getCellFoodCommercialPath()` が選んだレシピ）から byproducts を解決する。
   - `settleCellFreshFood()` が `addRuralOutput()` で主産物（Wine 等）を市場へ計上する箇所の直後に `addCommercialRecipeByproducts()` を呼び、副産物（Pomace 等）も同じ市場へ計上する。
7. `technologyDefinitions.ts`: `distillation` ノードを `ERA_1` に追加。
8. `technologyProgress.ts`: `isDistillationKnown(stateId)` 追加。
9. テスト:
   - `goods-generator.test.ts` の利幅回帰テスト（`hasViableFoodProcessingMargin` 系）に Pomace Wine / Pomace 系 Liquor レシピを追加し、"dead recipe"（コスト＝価値の同値）にならないことを確認。Pomace Wine が僅差の場合は `foodProcessingEconomics.ts` の `FOOD_PROCESSING_GOODS` への追加も検討する。
   - `production-generator.ts` 向けに、副産物が主産物と同時に市場在庫へ計上されることを検証する単体テストを追加（Brick 生産 → Ash 在庫増加、など）。
   - `markets-generator.ts` 向けに、cell 直販経路（Grapes → Wine）でも Pomace が同時に計上されることを検証する単体テスト（`getCommercialRecipeByproducts()` の直接テスト）を追加 — production-generator 側のテストだけでは §1.5 のバグを検知できない。
   - `technologyProgress.test.ts` に `distillation` ノードの stage 遷移テストを追加。
   - Liquor が `distillation < known` の State では一切生産されないことを検証する回帰テストを追加（Gunpowder の `isGoodEnabled` テストと同型）。

## 7. スコープ外（将来検討）

- wine.md 第3段階（堆肥・家畜飼料としてのポマース再利用）は本設計に含めない。Pomace が Pomace Wine / Liquor いずれの需要にも吸収されず市場に滞留した場合の「最終処分先」として、将来 Fodder や土壌肥沃度システムに接続する余地を残す。
- Pomace Wine 専用の世帯消費台帳（`WINE_TARGETS`/`ALE_TARGETS` 相当）。
- Coal の実体を「木炭」から「採掘される鉱物石炭」へ分離する件（technology-development-roadmap.md Phase 4「石炭利用の拡大」で扱う想定、本設計は現行 Coal＝木炭という暗黙の抽象化を前提に Ash 副産物を接続するのみ）。
