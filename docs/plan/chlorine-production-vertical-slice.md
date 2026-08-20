# リン酸肥料の縦切り実装計画 (Phosphate Fertilizer Vertical Slice)

## 状態

**設計案（未実装）**。[docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md)（Grok による現状監査）と
[technology-development-roadmap.md](./technology-development-roadmap.md) §9.1–9.2、
[steam-industrial-goods-and-technology-chain.md](./steam-industrial-goods-and-technology-chain.md) §3.5/Phase D、
[steam-industrial-implementation.md](./steam-industrial-implementation.md) Phase 4 が指す「化学・電化の第二波」の最初の縦切りとして、
ハーバー・ボッシュ法（`syntheticAmmonia`）そのものではなく、その前段にあたる**過リン酸肥料連鎖**（1842年相当）だけを実装範囲とする。

## 1. 目的と非目的

### 目的

- `industrialSulfuricAcid`（era 6、現状の技術グラフの終点）に、市場に効く**最初の出口**を作る。現状 `Sulfuric Acid` は在庫が積み上がるだけで消費先がない。
- `Phosphate Rock` を新しい鉱物 Good として追加し、`Sulfur`/`Saltpeter`/`Coal` と同じ「鉱山供給のみ・`chance: 0`」パターンに揃える。
- `Phosphate Fertilizer` を新しい Good として追加し、`Sulfuric Acid` と同じ「一つの Good に二つの供給経路」パターン（職人レシピによる継続生産 + State資本設備による大規模生産）で実装する。
- 購入された `Phosphate Fertilizer` を、`Market.agTechStock`（[rural-agtech-investment.md](./rural-agtech-investment.md)）と同型の**市場ごとの飽和ストック**に変換し、収量へ接続する。State全体への一括倍率にはしない（[technology-development-roadmap.md](./technology-development-roadmap.md) §9.3 の「発明した State 全体へ倍率を与えない」という設計原則を農業側にも適用する）。
- `foodFertilizerPressure`/`lateChemistryDemandPressure`（現状は都市食料輸入ギャップの代理指標でしかない）に、初めて実際に解禁される技術ノードを与える。

### 非目的（本書の範囲外）

- `syntheticAmmonia`（ハーバー・ボッシュ）そのもの。[steam-industrial-implementation.md](./steam-industrial-implementation.md) の Phase 4（化学・電化・第二波、現状未着手）に属し、`modernSteelmaking`・`highPressureChemicalApparatus`・`catalyticChemistry` を前提とする別スライス。
- `modernSteelmaking` / `highPressureChemicalApparatus` / `catalyticChemistry` ノードの新設。
- `foodFertilizerPressure` の意味変更（都市食料輸入ギャップ→施肥カバレッジ不足）。[docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) が指摘する通りこの再定義は `syntheticAmmonia` 側の課題であり、本スライスでは既存の意味のまま `phosphateFertilizer` の需要シグナルの一部としてのみ使う。
- `Steam Power` / `Electricity` の容量サービス化。
- グアノ・チリ硝石などの extra-European 交易品の追加。
- `good-phosphate` のような専用 SVG アイコンの新規作成（既存アイコンを流用し、フォローアップ課題として記録するに留める）。
- `MarketOverviewDialog` への `fertilizerStock` 表示（[rural-agtech-investment.md](./rural-agtech-investment.md) §7 が Ag Tech 表示を Phase 2 に回したのと同じ扱いとし、本書では触れない）。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 技術グラフの終点 | `chemicalIndustryFoundation` → `industrialSulfuricAcid` が era 6 の最後のノード。後続ノードは存在しない。 | [technologyDefinitions.ts:610-633](../../src/generators/technologyDefinitions.ts#L610-L633) |
| `Sulfuric Acid` の出口 | `demandCoverage: {}`、`recipes` はあるが `requiredTechnology: "industrialSulfuricAcid"` を消費する後続 Good が存在しない。 | [goods-generator.ts:2596-2611](../../src/extensions/economy/generators/goods-generator.ts#L2596-L2611) |
| 「一つの Good・二つの供給経路」の先例 | `Sulfuric Acid` は (a) 職人レシピによる通常の worker-loop 生産 (b) `AcidPlants.settleAnnual()` という State資金の資本設備、の両方から生産される。`Sulfur`/`Stone`/`Marble` も同じ二経路パターンを持つ。 | [production-generator.ts:1699-1727](../../src/extensions/economy/generators/production-generator.ts#L1699-L1727)、[acidPlants.ts](../../src/extensions/economy/generators/acidPlants.ts)、[goods-generator.ts:940-945](../../src/extensions/economy/generators/goods-generator.ts#L940-L945) |
| State資本設備のテンプレート | `AcidPlant`（`burgId`/`stateId`/`role: "trial"\|"service"`/`active`/`utilization`/`documentedRuns`/`lastFundedYear`）と共通ヘルパー `consumeNamed`/`addNamedStock`/`debitTreasury`/`marketIdForBurg`/`pickSponsorBurg` がそのまま再利用できる。 | [chemistryTypes.ts:62-70](../../src/extensions/economy/generators/chemistryTypes.ts#L62-L70)、[chemMedCommon.ts](../../src/extensions/economy/generators/chemMedCommon.ts) |
| 鉱物カタログ | `MineralCommodity` は `iron/copper/tin/lead/silver/gold`（要製錬）+ `coal/saltpeter/sulfur`（製錬不要、直接市場供給）のみ。リン鉱石に相当する項目はない。 | [mineralResourcesTypes.ts:1-10](../../src/extensions/economy/generators/mineralResourcesTypes.ts#L1-L10) |
| 鉱床生成 | `DISTRICT_PROFILES`（province × district type × commodity）と `baseAnnualCapacity` は完全にデータ駆動。新しい `MineralDistrictType`/`DistrictProfile`/容量値を足すだけで `MineOperations.produceMonth()` 側の変更は不要。 | [mineralResources.ts:69-100](../../src/extensions/economy/generators/mineralResources.ts#L69-L100)、[mineralResources.ts:474-499](../../src/extensions/economy/generators/mineralResources.ts#L474-L499) |
| 鉱山→市場の自動供給 | `MineOperations.produceMonth()` は `getMinedGoodName(commodity)` で Good を解決し `isGoodEnabled` を満たせば自動的に `Markets.addMineSupply()` する。新規コモディティ追加時に個別の分岐は不要。 | [mineOperations.ts:416-455](../../src/extensions/economy/generators/mineOperations.ts#L416-L455) |
| 農村技術投資の型 | `Market.agTechStock`（0..1 EWMA）→ `AgTechInvestment.settleAnnual()`（`Markets.consumeForMarketInvestment()` で Tools を購入）→ `developmentPotential.ts` の `resolveAgTechStockByCell()` → `agriculturalLandUse.ts` の `calculateYieldKgPerHectare()` に `AGTECH_YIELD_BONUS_MAX` として乗算。 | [agTechInvestment.ts:85-113](../../src/extensions/economy/generators/agTechInvestment.ts#L85-L113)、[developmentPotential.ts:83-95](../../src/extensions/economy/generators/developmentPotential.ts#L83-L95)、[agriculturalLandUse.ts:598-614](../../src/extensions/economy/generators/agriculturalLandUse.ts#L598-L614) |
| 収量式の既存項 | `calculateYieldKgPerHectare()` は `AGTECH_YIELD_BONUS_MAX`(0.4)・`STATE_YIELD_BONUS_MAX`(0.15)・`FOUR_COURSE_YIELD_BONUS_MAX`(0.12) を掛け合わせる乗算チェーン。新しい肥料項もこの形に合わせる。 | [agriculturalLandUse.ts:598-614](../../src/extensions/economy/generators/agriculturalLandUse.ts#L598-L614) |
| `soilFertility` の回復経路 | マメ科比率と四圃式ボーナスのみ。化学肥料の入力スロットは無い（`docs/temp/foods/化学肥料.md` の指摘通り）。本書は `soilFertility` には触れず、収量式への直接乗算で対応する（§3.7で理由を説明）。 | [agriculturalLandUse.ts:940-993](../../src/extensions/economy/generators/agriculturalLandUse.ts#L940-L993) |
| 需要シグナル | `foodFertilizerPressure` は都市の食料輸入ギャップ比率、`lateChemistryDemandPressure` はその加重和。`sulfurAccess`/`acidPlantTrialYears`/`acidPlantInstallations` は市場在庫・`ChemistryTrial`・`AcidPlant` 配列から算出。 | [technologyProgress.ts:754-862](../../src/generators/technologyProgress.ts#L754-L862) |
| 世帯消費 Good にしない契約 | `Phosphate Fertilizer` は「農村の施肥普及ストックを増やす。世帯消費 Good にはしない」と明記されている。 | [steam-industrial-goods-and-technology-chain.md:125](./steam-industrial-goods-and-technology-chain.md#L125) |
| セーブ互換性 | 新規 Good はカタログへの単純追加では既存セーブに反映されないため `migrateXGoods()` 系の関数が必要。新規配列スライスは `extensionStateSlices.ts` の `validateEconomySlice()` に登録が必要。 | [goods-generator.ts:3194-3224](../../src/extensions/economy/generators/goods-generator.ts#L3194-L3224)、[extensionStateSlices.ts:400-450](../../src/runtime/extensionStateSlices.ts#L400-L450) |

## 3. 設計

### 3.1 概念モデル

```
MineralResources.generate()
  "phosphorite" district (basin province)
    → Phosphate Rock deposits
        → MineOperations.produceMonth() → 市場在庫 (Phosphate Rock)   ※既存ロジックのまま自動供給

Sulfuric Acid (既存, industrialSulfuricAcid) ─┐
Phosphate Rock (新規) ──────────────────────────┼─▶ Phosphate Fertilizer
                                                │      経路A: 職人レシピ (production-generator.ts の通常 worker-loop)
                                                │      経路B: PhosphateFertilizerPlants.settleAnnual()（State資金の資本設備、AcidPlants.ts と同型）
                                                ▼
                              ChemistryTrial(kind="phosphateFertilizerPlant")
                                  → phosphateFertilizerTrialYears / phosphateFertilizerPlantCount シグナル
                                                │
                                                ▼
                        technologyDefinitions.ts "phosphateFertilizer" ノード (known/demonstrated/adopted)
                                                │
                                                ▼
                FertilizerInvestment.settleAnnual()（AgTechInvestment.settleAnnual() と同型）
                  Market が自分の marketTreasury で Phosphate Fertilizer を購入
                                                │
                                                ▼
                        Market.fertilizerStock（0..1 EWMA、agTechStock と同型）
                                                │
                                                ▼
        developmentPotential.ts resolveFertilizerStockByCell() → AgriculturalConditions.fertilizerStockByCell
                                                │
                                                ▼
    agriculturalLandUse.ts calculateYieldKgPerHectare():
      × (1 + PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX × fertilizerStockByCell[cellId])
```

新しい層は「鉱物1つ・Good2つ・State資本設備1つ・市場投資1つ・収量係数1つ」で、それより下流（食料台帳・都市労働力受け入れ）は一切変更しない。`rural-agtech-investment.md` の「既存の2本のパイプラインへ新しい入力を1つ足すだけ」という設計方針をそのまま踏襲する。

### 3.2 鉱物: Phosphate Rock

`mineralResourcesTypes.ts`:

```ts
// 既存: fuel とは呼べない Saltpeter/Sulfur も便宜上ここに含まれている。Phosphate Rock も
// 同じ「製錬不要・鉱山から直接市場供給」という性質だけを理由に加える（配列名のリネームはしない）。
export const FUEL_MINERAL_COMMODITIES = ["coal", "saltpeter", "sulfur", "phosphate rock"] as const;

export type MineralDistrictType =
  | "bandedIron" | "ironSand" | "bogIron" | "porphyry" | "skarn" | "polymetallicVein"
  | "mvt" | "sedex" | "graniteTin" | "lodeGold" | "placer" | "coalSeam" | "evaporite"
  | "phosphorite"; // 追加
```

コモディティ値をあえて `"phosphate rock"`（2語）にすることで、`getMinedGoodName()` の実装（`ORE_COMMODITIES` に含まれれば `${commodity} ore`、そうでなければ `commodity` をそのまま返す）を一切変更せずに `"Phosphate Rock".toLowerCase()` と一致させられる。`getMinedGoodName`・`isMineSuppliedGoodName` の実装変更は不要。

`mineralResources.ts`:

```ts
const DISTRICT_PROFILES: readonly DistrictProfile[] = [
  // ...既存...
  { type: "evaporite", provinces: ["basin"], primary: "sulfur", commodities: ["sulfur", "saltpeter"] },
  { type: "phosphorite", provinces: ["basin"], primary: "phosphate rock", commodities: ["phosphate rock"] } // 追加
];

const PROFILE_PRIORITY: readonly MineralDistrictType[] = [
  // ...既存...
  "evaporite",
  "phosphorite" // 追加、末尾
];
```

`createYield()` の `baseAnnualCapacity` に `"phosphate rock": 140`（calibration TBD、`coal`(160) よりやや小さい沿岸～内陸海盆堆積鉱床のスケール）を追加する。

`evaporite` と同じ `"basin"` province を使うため、既存の `sulfur`/`saltpeter` と鉱区が競合しうるが、`pickProfile()` は `districtCount`（陸地セル数に比例）に応じて複数の profile を順に採用するため、`Sulfur` 供給と共食いにはならない（既存の `evaporite` vs `coalSeam` の関係と同じ)。

`MineOperations.produceMonth()`・`drawMineralDeposits.ts`・`MineralOverviewDialog.tsx` は完全にデータ駆動（Good名・アイコン・色を動的に参照）のため、変更不要。

### 3.3 Good: Phosphate Rock / Phosphate Fertilizer

`goods-generator.ts` の `GOODS_DATA` に追加（既存 `Sulfuric Acid`/`Coal Tar` の直後、値は calibration TBD）:

```ts
{
  name: "Phosphate Rock",
  warEconomyType: "strategic",
  tags: ["mineral", "industrial"],
  icon: "good-stone", // 専用スプライト未作成。§7 フォローアップ参照
  color: "#9c8a5e",
  value: 6,
  chance: 0, // Sulfur/Saltpeter/Coal と同じ、鉱山供給のみ
  unit: "wain",
  demandCoverage: {}
},
{
  name: "Phosphate Fertilizer",
  warEconomyType: "strategic",
  tags: ["industrial", "agriculture"],
  icon: "good-salt", // 専用スプライト未作成。§7 フォローアップ参照
  color: "#c7b98a",
  value: 20,
  chance: 0,
  recipes: [{ "Phosphate Rock": 1, "Sulfuric Acid": 0.6 }], // 経路A: 職人レシピ。実比率は史実の過リン酸石灰(~1:0.6-0.7)に準拠、calibration TBD
  unit: "sack",
  // 世帯消費 Good にしない契約 (steam-industrial-goods-and-technology-chain.md:125)。
  // household demand には一切乗せない。
  demandCoverage: {},
  requiredTechnology: "phosphateFertilizer"
}
```

`trade`/`cargo` プロファイルは未指定でよい（`getDefaultGoodTradeProfile()` が `tags` から自動推定する。[goods-generator.ts:2787-2803](../../src/extensions/economy/generators/goods-generator.ts#L2787-L2803)）。

`isGoodEnabled(Phosphate Fertilizer)` はワールドのどこかで `phosphateFertilizer` が `demonstrated` になった時点で真になり、`isGoodManufacturableInState()` は生産する State で `adopted` になって初めて真になる（`Sulfuric Acid` と同じ二段階ゲート、[production-generator.ts:147-155](../../src/extensions/economy/generators/production-generator.ts#L147-L155)）。

### 3.4 セーブ互換性（Good migration）

新規 Good はカタログに足すだけでは既存セーブに反映されない。`migrateChemMedGoods()` と同型の関数を追加する:

```ts
// goods-generator.ts
const PHOSPHATE_GOOD_NAMES = ["Phosphate Rock", "Phosphate Fertilizer"] as const;

export function migratePhosphateGoods(): boolean {
  // migrateChemMedGoods() (goods-generator.ts:3194-3224) と全く同じ実装:
  // 1) 既存カタログに無い名前だけ Goods.getDefaultGood() から追加し id を採番
  // 2) GOODS_DATA テンプレートの recipes をこのセーブの Good id に解決し直す
  // 3) requiredTechnology をコピーする
}
```

`src/extensions/economy/index.tsx` の両方の呼び出し箇所（新規生成時・既存セーブロード時、`migrateChemMedGoods()` の直後）に `migratePhosphateGoods()` を追加する。

### 3.5 技術ノード: `phosphateFertilizer`

`technologyDefinitions.ts` の `ERA_6` 配列に追加:

```ts
{
  id: "phosphateFertilizer",
  label: "Phosphate fertilizer",
  era: 6,
  scope: "state",
  prerequisites: ["industrialSulfuricAcid"],
  known: {
    min: {
      sulfurAccess: 0.35,
      phosphateRockAccess: 0.25,   // 新規シグナル、§3.6
      administration: 0.4,
      foodFertilizerPressure: 0.2, // chemicalIndustryFoundation の lateChemistryDemandPressure と同じ「需要が発展を牽引する」パターン
      treasury: 130
    }
  },
  demonstrated: {
    min: { phosphateFertilizerTrialYears: 2, phosphateRockAccess: 0.3, treasury: 170 } // 新規シグナル、§3.6
  },
  adopted: {
    min: { phosphateFertilizerPlantCount: 1, phosphateRockAccess: 0.35, treasury: 210 } // 新規シグナル、§3.6
  },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

数値は `industrialSulfuricAcid` の閾値をベースにした calibration TBD。`prerequisites: ["industrialSulfuricAcid"]` により、`industrialSulfuricAcid` が世界のどこかで `known` にすらなっていない状態では `phosphateFertilizer` は一切進行しない（既存の `TechnologyDefinition` 評価ロジックと同じ）。

`agricultural chemistry`（roadマップ §9.1 の前提スキル）に相当する専用ノードは新設しない。既存の `administration` シグナルと `phosphateRockAccess`/`sulfurAccess` の組み合わせで近似する。

### 3.6 新規シグナル（`technologyTypes.ts` / `technologyProgress.ts`）

`TechnologyProgressSignals` に3フィールド追加:

```ts
phosphateRockAccess: number;          // sulfurAccess と同型: 市場在庫カバレッジ
phosphateFertilizerTrialYears: number; // acidPlantTrialYears と同型: ChemistryTrial(kind="phosphateFertilizerPlant") の documentedRuns
phosphateFertilizerPlantCount: number; // acidPlantInstallations と同型: active な PhosphateFertilizerPlant の数
```

`technologyProgress.ts` の初期化ブロック（[technologyProgress.ts:387](../../src/generators/technologyProgress.ts#L387) 付近）に `phosphateRockAccess: 0, phosphateFertilizerTrialYears: 0, phosphateFertilizerPlantCount: 0,` を追加。

`sulfurAccess` の算出（[technologyProgress.ts:751-767](../../src/generators/technologyProgress.ts#L751-L767)）と同じ形で:

```ts
const phosphateRockStockByState = stateMarketStockByGood(economy, marketOwners, phosphateRockId);
// ...
signals.phosphateRockAccess = clamp01((phosphateRockStockByState.get(stateId) ?? 0) / 2); // calibration TBD
```

`acidYears`/`acidPlantInstallations` の算出（[technologyProgress.ts:788-825](../../src/generators/technologyProgress.ts#L788-L825)）と同じ形で、`ChemistryTrial.kind === "phosphateFertilizerPlant"` と新規配列 `economy.phosphateFertilizerPlants` から集計する。

### 3.7 State資本設備: `PhosphateFertilizerPlants`（`AcidPlants.ts` を型として再利用）

`chemistryTypes.ts` に `ChemistryTrialKind` の union へ `"phosphateFertilizerPlant"` を追加し、`AcidPlant` と同一形状の `PhosphateFertilizerPlant` interface を追加する:

```ts
export type ChemistryTrialKind = "compounding" | "laboratory" | "acidPlant" | "phosphateFertilizerPlant";

export interface PhosphateFertilizerPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}
```

新規ファイル `phosphateFertilizerPlants.ts` は `acidPlants.ts`（[acidPlants.ts](../../src/extensions/economy/generators/acidPlants.ts)）と一対一で対応する構造にする:

- ゲート: `getTechnologyStage("phosphateFertilizer", state.i)` が `known` 以上になった State だけがプラントを持てる（`worldHasFoundation()` に相当する `worldHasIndustrialSulfuricAcid()` は `industrialSulfuricAcid` の世界的 `demonstrated` をチェックする — 出力が実際に生まれるのは前提技術が世界のどこかで実証されて以降、という `AcidPlants` と同じ「trial は早く始まるが output は前提が整うまで出ない」構造）。
- 資金: `chemMedCommon.ts` に `PHOSPHATE_FERTILIZER_PLANT_BUDGET`(calibration TBD、`ACID_PLANT_BUDGET`=24 よりやや高い 28 程度)を追加し、既存の `debitTreasury`/`pickSponsorBurg`/`marketIdForBurg` をそのまま使う。
- 消費: `consumeNamed(marketId, "Phosphate Rock", amount)` と `consumeNamed(marketId, "Sulfuric Acid", amount)`。
  - `Phosphate Rock` は `requiredTechnology` を持たないため `isGoodEnabled()` は常に真 — `consumeNamed` は無条件で動く。
  - `Sulfuric Acid` は既に `chemMedCommon.ts` の `consumeNamed()` に `name !== "Sulfuric Acid"` という既存の bypass がある（[chemMedCommon.ts:34](../../src/extensions/economy/generators/chemMedCommon.ts#L34)）。この一行は現状どこからも `Sulfuric Acid` を `consumeNamed` していないため意味を持っていなかったが、本スライスがこの bypass の最初の利用者になる。コード変更は不要。
- 生産: `addNamedStock(marketId, "Phosphate Fertilizer", plant.role === "trial" ? 0.2 : 0.8)`（calibration TBD、`AcidPlants` の 0.15/0.6 よりやや高い ── リン酸肥料プラントは硫酸プラントより下流でスケールが大きい）。
- `ChemistryTrial` の `trialFor()` パターンをそのまま再利用し `kind: "phosphateFertilizerPlant"` にする。

`economyContext.ts` にスライスアクセサを追加（`getAcidPlants`/`setAcidPlants` と同型、[economyContext.ts:1395-1400](../../src/extensions/economy/economyContext.ts#L1395-L1400)）:

```ts
export function getPhosphateFertilizerPlants(): PhosphateFertilizerPlant[] { return getSliceArray("phosphateFertilizerPlants"); }
export function setPhosphateFertilizerPlants(rows: readonly PhosphateFertilizerPlant[]): void { setSliceArray("phosphateFertilizerPlants", rows); }
export function getPhosphateFertilizerPlantsLastSettledYear(): number | null { /* getAcidPlantsLastSettledYear と同型 */ }
export function setPhosphateFertilizerPlantsLastSettledYear(year: number): void { /* 同型 */ }
```

`_phosphateFertilizerPlantsLastSettledYearFallback` フォールバック変数を追加し、モジュールリセット処理（[economyContext.ts:217](../../src/extensions/economy/economyContext.ts#L217) 付近の一括 `null` 代入ブロック）にも追加する。

`extensionStateSlices.ts` の `validateEconomySlice()` の配列フィールド一覧（[extensionStateSlices.ts:400-450](../../src/runtime/extensionStateSlices.ts#L400-L450)）に `"phosphateFertilizerPlants"` を追加する（追加を忘れるとセーブ／ロード検証で無視・破棄されうる）。

### 3.8 農村施肥ストック: `Market.fertilizerStock` と `FertilizerInvestment`

`marketTypes.ts` の `Market` interface に、`agTechStock` の直後へ追加:

```ts
/**
 * 0..1 の飽和ストック。Phosphate Fertilizer の年次購入カバレッジの指数移動平均(EWMA)。
 * agTechStock（Tools 投資）とは別会計・別ストック。undefined は 0 として扱う。
 * See docs/plan/phosphate-fertilizer-vertical-slice.md §3.8.
 */
fertilizerStock?: number;
```

新規ファイル `fertilizerInvestment.ts` は `agTechInvestment.ts` の `AgTechInvestment.settleAnnual()`（[agTechInvestment.ts:53-115](../../src/extensions/economy/generators/agTechInvestment.ts#L53-L115)）と同じ形にする:

```ts
export const TARGET_FERTILIZER_PER_HECTARE = 0.01; // calibration TBD — Tools(0.02)より物量が小さい消費財
export const FERTILIZER_BUDGET_SHARE_OF_TREASURY = 0.12; // calibration TBD
export const FERTILIZER_ADOPTION_RATE = 0.15; // AgTech と同じ ~7年で追従するEWMA

class FertilizerInvestmentModule {
  settleAnnual(): boolean {
    // 年次ゲート: fertilizerLastSettledYear（economyContext.ts に新規追加）
    // 市場ごとに cultivatedArea(ha) を集計 → requestedUnits = area × TARGET_FERTILIZER_PER_HECTARE
    // budget = marketTreasury.balance × FERTILIZER_BUDGET_SHARE_OF_TREASURY
    // Markets.consumeForMarketInvestment(marketId, phosphateFertilizerGoodId, requestedUnits, budget)
    // coverageThisYear = min(1, purchasedUnits / requestedUnits)
    // market.fertilizerStock = (market.fertilizerStock ?? 0) × (1 − FERTILIZER_ADOPTION_RATE) + coverageThisYear × FERTILIZER_ADOPTION_RATE
  }
}
```

財源は `AgTechInvestment` と**同じ** `market.marketTreasury.balance`。専用の別会計は作らない — Market の財布は一つであり、`rural-agtech-investment.md` §6.3 が確立した「食料生産投資が先着で治水/採鉱より優先される」という優先順位モデルをそのまま踏襲する。

呼び出し順序（`src/extensions/economy/index.tsx`、`AgTechInvestment.settleAnnual()` の呼び出し箇所、[index.tsx:2799-2805](../../src/extensions/economy/index.tsx#L2799-L2805)）:

```ts
measureTickStep("economy:annualAgTech", () => {
  AgTechInvestment.settleAnnual();
  FertilizerInvestment.settleAnnual(); // 追加。Tools購入の直後、鉱業/製錬投資より先
  IndustrialTechInvestment.settleAnnual();
  agricultureRefreshed = DevelopmentPotential.updateAnnualAgriculture();
  // ...
});
```

`PhosphateFertilizerPlants.settleAnnual()`（生産側、State資金）は `AcidPlants.settleAnnual()` の直後、別の `measureTickStep("economy:annualUrbanKnowledge", ...)` ブロック（[index.tsx:2926-2930](../../src/extensions/economy/index.tsx#L2926-L2930)）に追加する。このブロックは `annualAgTech` より**後**に実行されるため、同じ年の `FertilizerInvestment` は前年までにプラントが生産した在庫＋今年ここまでの職人レシピ生産（経路A、月次で継続的に生産される）から購入することになる。`Tools`/`AgTechInvestment` も同じ非同期関係にあり、既存の設計と矛盾しない。

### 3.9 収量への反映（`agriculturalLandUse.ts`）

`AgriculturalConditions` に追加:

```ts
/** 市場ごとの Phosphate Fertilizer 購入カバレッジ。DevelopmentPotential が市場からセルへ展開する。 */
readonly fertilizerStockByCell?: Float32Array;
```

`calculateYieldKgPerHectare()`（[agriculturalLandUse.ts:598-614](../../src/extensions/economy/generators/agriculturalLandUse.ts#L598-L614)）の乗算チェーンに1項追加:

```ts
export const PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX = 0.2; // calibration TBD。四圃式(0.12)より効くが AgTech(0.4)ほどではない

function calculateYieldKgPerHectare(/* ... */): number {
  return (
    BASE_NET_YIELD_KG_PER_SOWN_HECTARE *
    effectiveClimateYield *
    (1 + AGTECH_YIELD_BONUS_MAX * effectiveAgTech) *
    (1 + STATE_YIELD_BONUS_MAX * stateProductivity) *
    (1 + FOUR_COURSE_YIELD_BONUS_MAX * (conditions.fourCourseRotationByCell?.[cellId] ?? 0)) *
    (1 + PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX * (conditions.fertilizerStockByCell?.[cellId] ?? 0)) // 追加
  );
}
```

`soilFertility`（マメ科・四圃式でのみ回復する既存の土壌疲弊モデル）には手を入れない。理由:

1. `MAX_SOIL_FERTILITY = 1.1` という天井がすでにあり、そこへ足すと最大でも+5%程度の効果しか出せず、史実の過リン酸肥料の効果（穀物収量+15〜25%程度）を表現できない。
2. `soilFertility` は「土壌の有機的疲弊・回復」という別の物理量であり、購入財である化学肥料の効果を土壌疲弊と混線させると、`agTechStock`/`stateProductivity`/`fourCourseRotation` が既に確立している「乗算チェーンへの直接項」という一貫した設計から外れる。

`developmentPotential.ts` に `resolveFertilizerStockByCell()` を追加（`resolveAgTechStockByCell()` と同型、[developmentPotential.ts:83-95](../../src/extensions/economy/generators/developmentPotential.ts#L83-L95)）:

```ts
function resolveFertilizerStockByCell(cellCount: number): Float32Array {
  const stockByCell = new Float32Array(cellCount);
  const marketCellColumn = getMarketCellColumn();
  if (!marketCellColumn.length) return stockByCell;
  const stockByMarketId = new Map(getMarkets().map(market => [market.i, market.fertilizerStock ?? 0]));
  for (let cellId = 0; cellId < cellCount; cellId++) {
    const marketId = marketCellColumn[cellId];
    if (!marketId) continue;
    stockByCell[cellId] = stockByMarketId.get(marketId) ?? 0;
  }
  return stockByCell;
}
```

`DevelopmentPotentialModule.generate()`・`updateAnnualAgriculture()`・`getAgriculturalConditions()`（[developmentPotential.ts:156-337](../../src/extensions/economy/generators/developmentPotential.ts#L156-L337)）の3箇所に、`agTechStockByCell`/`stateProductivityByCell` と並べて `fertilizerStockByCell` を通す。

## 4. Phase分割

- **Phase 1 — 鉱物・Good・技術ノード**: §3.2〜§3.5。`Phosphate Rock` が鉱山から市場に出て、`phosphateFertilizer` ノードが評価され始める状態まで。まだ収量には影響しない。
- **Phase 2 — 生産経路**: §3.7（`PhosphateFertilizerPlants`）+ 経路Aのレシピ登録。`Phosphate Fertilizer` が実際に市場在庫として生まれる状態まで。
- **Phase 3 — 農村投資と収量接続**: §3.6（新規シグナルによる `demonstrated`/`adopted` 判定）+ §3.8（`FertilizerInvestment`）+ §3.9（収量式）。ここで初めてプレイヤーから見た効果（収量上昇）が現れる。
- **Phase 4 — セーブ互換性の仕上げ**: §3.4 の migration 関数と §3.7 の `extensionStateSlices.ts` 登録。実装上は Phase 1〜3 と並行して都度追加するのが自然だが、既存セーブでの動作確認は全Phase完了後にまとめて行う。

## 5. テスト計画

- `mineralResources.test.ts`: `phosphorite` district が `basin` province にのみ生成されること、`phosphate rock` の yield が `baseAnnualCapacity` × richness で計算されること。
- `goods-generator.test.ts`: `Phosphate Rock`/`Phosphate Fertilizer` が `GOODS_DATA` に存在し `requiredTechnology`/`demandCoverage: {}` が正しいこと。`migratePhosphateGoods()` が旧セーブへ既存 id を壊さず追加すること（`migrateChemMedGoods` の既存テストパターンを流用)。
- `phosphateFertilizerPlants.test.ts`（新規 — `acidPlants.ts` 自体には専用テストが無いため、このスライスでは新規に用意する）: `phosphateFertilizer` が `known` になった State だけがプラントを持つこと、`Sulfuric Acid`/`Phosphate Rock` 不足で `utilization` が下がること、`worldHasIndustrialSulfuricAcid()` が偽の間は消費だけして出力しないこと。
- `technologyProgress.test.ts`: `phosphateRockAccess`/`phosphateFertilizerTrialYears`/`phosphateFertilizerPlantCount` が期待通りに集計されること。
- `technologyDefinitions.test.ts`（既存の era 6 テストがあれば拡張、無ければ `technologyProgress.test.ts` 側で代替）: `phosphateFertilizer` が `industrialSulfuricAcid` 抜きでは `known` に進めないこと。
- `fertilizerInvestment.test.ts`（新規、`agTechInvestment.test.ts` と同じ形）: 予算内で購入し `fertilizerStock` が上昇すること、供給停止年は緩やかに減衰すること、`Phosphate Fertilizer` 市場在庫がゼロなら購入量もゼロになること。
- `agriculturalLandUse.test.ts`（既存に追加）: 同一セルで `fertilizerStockByCell` あり/なしを比較し `yieldPerArea` が上昇すること。第6引数省略時に既存挙動と完全一致すること（後方互換の回帰確認、`agTechStockByCell` 省略時のテストと同じ形）。

## 6. 受け入れ条件

- `industrialSulfuricAcid` が世界のどこにも存在しない状態では `phosphateFertilizer` は `known` にすら進まない。
- `Phosphate Fertilizer` は `demandCoverage` が空で、都市の一般消費財需要（`utilities` 等）には一切計上されない。
- `phosphateFertilizer` が `adopted` になっただけでは収量は変化しない。実際に `Phosphate Fertilizer` が市場で購入され `Market.fertilizerStock` が積み上がって初めて `yieldPerArea` に反映される（「技術フラグで肥料が出る」実装の禁止）。
- 既存セーブ（`Phosphate Rock`/`Phosphate Fertilizer` を持たない旧カタログ）をロードしても `migratePhosphateGoods()` により既存 Good の id がずれない。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 7. 決定事項 / Open Questions

1. `Phosphate Rock`/`Phosphate Fertilizer` の SVG アイコンは既存の `good-stone`/`good-salt` を暫定流用する。専用アイコンの新規作成は別チケット。
2. `"phosphate rock"` を `FUEL_MINERAL_COMMODITIES` に含める判断は、配列名の意味論的な緩さ（Saltpeter/Sulfur も燃料ではない）という既存の前例に従ったもので、型の分割・リネームは行わない。
3. `agricultural chemistry`（roadマップ上の前提スキル）を専用技術ノードにするかは未決のまま据え置き、既存シグナルの組み合わせで近似する。将来 `syntheticAmmonia` 側で本格的な触媒化学ドメインが必要になった時点で再検討する。
4. `foodFertilizerPressure` の意味変更（「施肥カバレッジ不足」への切り替え）は本スライスでは行わない。`syntheticAmmonia` 実装時に改めて設計する。
5. `MarketOverviewDialog` への `fertilizerStock` 表示は Phase 2 相当の追加要望として保留する（`rural-agtech-investment.md` §7 と同じ扱い）。

## 8. 関連ドキュメント

- [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) — 本スライスの発端になった現状監査メモ
- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.1–9.2 — ノード名・前提関係の一次ソース
- [steam-industrial-goods-and-technology-chain.md](./steam-industrial-goods-and-technology-chain.md) §3.5, Phase D — Good の入出力契約
- [steam-industrial-implementation.md](./steam-industrial-implementation.md) Phase 4 — 「化学・電化は第二波」という実装順序の位置づけ
- [chemistry-medicine-knowledge-accumulation.md](./chemistry-medicine-knowledge-accumulation.md) §5.2, §6–8 — `AcidPlant`/`ChemistryTrial` の設計元
- [rural-agtech-investment.md](./rural-agtech-investment.md) — `Market.agTechStock`/`AgTechInvestment` の設計元、本書の `fertilizerStock`/`FertilizerInvestment` の直接のテンプレート
- [mineral-resource-system.md](./mineral-resource-system.md) — 鉱床生成の設計元
