# 天然ガス(LNG)火力発電の縦切り実装計画 (Natural Gas / LNG Power Generation Vertical Slice)

## 状態

**実装済み（2026-08-23）**。[technology-development-roadmap.md](./technology-development-roadmap.md) §9.3（L307）が
一次資料として予告する「石炭・水力・後続の石油・ガスなどのエネルギー供給」のうち、まだ存在しなかった「ガス」を、
[petroleum-and-internal-combustion-vertical-slice.md](./petroleum-and-internal-combustion-vertical-slice.md)
（原油）・[electric-power-and-telegraph.md](./electric-power-and-telegraph.md)（発電所・送電網）の2本を土台に実装する。
天然ガスの採掘（`Natural Gas`）→ 液化（`LNGPlants` → `LNG`）→ ガス火力発電（`GasPowerStations`）という一本の縦切りを、
既存の石油チェーン・発電チェーンの精密な複製として追加する。

## 1. 目的と非目的

### 目的

- `Natural Gas`（新規鉱物 Good、鉱山供給）を実装する。district は新設せず、既存の `oilField`
  （`Crude Oil` の堆積盆地区分）に随伴ガスとして追加する — 石油随伴ガスという実際の地質学的関係をそのまま流用し、
  `evaporite` が `sulfur`/`saltpeter` の2 commodity を同一 district から産出する先例と同型にする（§3.1-3.2）。
  `Bauxite`/`Cinnabar`/`Crude Oil` と同じく `requiredTechnology` を持たない — 採掘そのものはゲートしない。
- `naturalGasLiquefaction`（天然ガス液化）ノードにより、新規 State資本設備 `LNGPlants` が `Natural Gas` を消費して
  `LNG`（液化天然ガス、資本設備のみ供給の市場 Good）を産出する — `OilRefineryPlants` の精密な複製（単一出力版）。
  「採掘」した `Natural Gas` を「流通」可能な市場 Good `LNG` に変換する工程であり、ユーザーが天然ガスに
  「(LNG)」を併記した意図（液化して初めて広域流通できる）をそのまま表現する（§3.3-3.7）。
  `Natural Gas` 自体も鉱山供給された時点で既に市場に流通する Good ではあるが、`LNG` は
  `naturalGasLiquefaction` の実運用を経て初めて手に入る、産業用途向けの高付加価値な流通形態として区別する。
- `gasFiredElectricityGeneration`（ガス火力発電）ノードにより、新規 State資本設備 `GasPowerStations` が
  `LNG` を燃料に発電容量を産出する — `PowerStations`（石炭専焼）の精密な複製。産出した `generationCapacity` は
  既存の `PowerGridInvestment` が `PowerStation`/電化済み `Dam` と全く同じプールへ合算し、`Market.electricityStock`
  へ配分する — 「発電用の燃料として使用する」という目的を、既存の発電容量プールへの実接続として満たす
  （§3.8-§3.9、Dam が既にこのプールに合流している先例をそのまま踏襲）。
- `drawPowerGrid.ts` の発電サイト種別に `"gas"` を追加し、地図レイヤー上でもガス火力発電所を⚡マーカーで
  可視化する（§3.10）。

### 非目的（本書の範囲外）

- 天然ガスの地質探査を専用ノード化すること。`Crude Oil` の随伴ガスという位置付けのため、既存の
  `petroleumGeologyAndExploration`/`modernDrillingAndFieldOperations` をそのまま探査・掘削の代理として流用する
  （§1 目的、§3.4）。非随伴（乾性）ガス田は本書の対象外。
- パイプライン網・LNGタンカー・港湾といった輸送インフラの地理的シミュレーション。石油輸送を非目的とした
  petroleum 縦切り §1 非目的6と同じ理由 — 既存のキャラバン・海運インフラがそのまま `LNG`/`Natural Gas` の
  流通を担い、追加コードは不要。
- 家庭用の都市ガス・給湯・暖房用途への `demandCoverage` 接続。`Kerosene` が家庭用照明を非目的としたのと同じ理由
  （既存の産業用専用 Good パターンを踏襲し、末端需要は持たせない）。
- ガスタービン・複合サイクル発電のような発電方式の違いによる効率差のモデル化。`GasPowerStation` は
  `PowerStation` と同じ抽象化レベル（燃料と資材を消費して `generationCapacity` を産出するだけの State資本設備）に
  留め、石炭とガスの間で発電効率そのものに優劣をつけない。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| `oilField` district の随伴資源パターン先例 | `evaporite` district は `primary: "sulfur"`、`commodities: ["sulfur", "saltpeter"]` の2 commodity 構成で、`getCommodities()` は非 placer district のプロファイルの `commodities` を全てそのまま返す（ランダム選択しない）。`createYield()` は `commodity === profile.primary` で `primary` bool を決め、非 primary は `capacity = baseAnnualCapacity[commodity] * richness * 0.25` — 4分の1スケールで自動的に算出される。 | [mineralResources.ts:96-97, 206, 361-364, 510-543](../../src/extensions/economy/generators/mineralResources.ts#L96) |
| `Crude Oil`「原鉱石はゲートなし」パターン | `requiredTechnology` を持たず、`chance: 0`・`demandCoverage: {}`・鉱山供給のみ。`getMinedGoodName()`/`isMineSuppliedGoodName()` は `FUEL_MINERAL_COMMODITIES` に追加するだけで自動的にマッチする（`MineOperations.produceMonth()` の `goodsByName` は Good名を小文字化してマッチするため、大文字の Good名と小文字の commodity名は自動で一致する）。 | [goods-generator.ts:3080-3096](../../src/extensions/economy/generators/goods-generator.ts#L3080)、[mineOperations.ts:417-436](../../src/extensions/economy/generators/mineOperations.ts#L417) |
| `OilRefineryPlants`「State資本設備のみが Good を供給する」パターン | `ChemistryTrial(kind="oilRefineryPlant")` 経由、`Crude Oil`/`Coal`/`Firebrick` を `consumeNamed` で消費して `coverage` を求め、`utilization>=0.5` の年だけ `documentedRuns` を進め、前提ノード（`modernDrillingAndFieldOperations`）が世界のどこかで `demonstrated` なら出力する。`Kerosene`/`Lubricating Oil` は `recipes` を持たない資本設備専用 Good。 | [oilRefineryPlants.ts](../../src/extensions/economy/generators/oilRefineryPlants.ts) |
| `PowerStations`「石炭専焼のみ」だった制約 | `PowerStation` は `Coal`/`Copper Wire`/`Machine Parts`/`Firebrick` を消費し `generationCapacity` を毎年再計算する（在庫Goodとして累積しない）。electric-power-and-telegraph.md §1 非目的は「水力は将来の別縦切りで追加」と明記し、燃料多様化を将来タスクとして残していた。 | [powerStations.ts](../../src/extensions/economy/generators/powerStations.ts)、[electric-power-and-telegraph.md §1](./electric-power-and-telegraph.md) |
| `PowerGridInvestment` が複数の発電源を同一プールへ合算する先例 | `capacityByMarket`/`capacityByState` は `PowerStation.generationCapacity` に加え、電化済み `Dam.generationCapacity`（`dam.electrified` の場合のみ）を同じループ構造で合算する — 「複数の発電源が同じ電力プールに合流する」設計は dam-flood-control-and-hydropower.md で既に確立済み。 | [powerGridInvestment.ts:60-81](../../src/extensions/economy/generators/powerGridInvestment.ts#L60) |
| `drawPowerGrid.ts` の発電サイト抽象化 | `GenerationSite.kind: "coal" \| "hydro"` は既に複数燃料種別を表現できる形になっており、`collectGenerationSites()` は `PowerStation`/`Dam` をそれぞれ別のマッパー関数でこの共通形へ変換して1本の配列にまとめる。 | [drawPowerGrid.ts:23-96](../../src/extensions/economy/renderers/drawPowerGrid.ts#L23) |
| `chemMedCommon.ts` の budget 定数順序 | `OIL_REFINERY_PLANT_BUDGET(30) < CHLOR_ALKALI_PLANT_BUDGET(34) < POWER_STATION_BUDGET(36)`。 | [chemMedCommon.ts:12-81](../../src/extensions/economy/generators/chemMedCommon.ts#L12) |
| `TechnologyEraBand` の上限 | `0\|1\|...\|8` — era 7（石油と同era）で追加ノードを作れる。ERA_7配列は末尾に単純追加すれば、`stageOf` クロージャの「配列内で自分より前の技術は今年の更新値、後の技術は前年値」という順序依存を壊さない（`internalCombustionEngine` の直後に追加すれば `modernDrillingAndFieldOperations`/`highPressureChemicalApparatus`/`generatorAndMotor` はいずれも自分より前）。 | [technologyTypes.ts:17](../../src/generators/technologyTypes.ts#L17)、[technologyDefinitions.ts:909-975](../../src/generators/technologyDefinitions.ts#L909) |

結論として、鉱物 district・Good カタログ・State資本設備・市場在庫カバレッジ信号・発電容量プールという5層は
すべて `Crude Oil`/`OilRefineryPlants`/`PowerStations`/`PowerGridInvestment`/`Dam` の先例からそのまま複製できる。
本書で実質的に新しいのは「①既存 district への随伴commodity追加という初めての petroleum-chain 拡張、②石炭に続く
2つ目の発電燃料が既存の発電容量プールへ実接続される、という初めての事例」の2点に限定される。

## 3. 設計

### 3.1 概念モデル

```text
既存チェーン（本書が土台にする、いずれも実装済み・非変更）:
  oilField district (province: "basin")
    → Crude Oil → OilRefineryPlants → Kerosene / Lubricating Oil
  generatorAndMotor → PowerStations（石炭専焼）→ generationCapacity → PowerGridInvestment → Market.electricityStock

本書が追加する縦切り:
  oilField district（既存、"basin"）に随伴ガスを追加:
    commodities: ["crude oil", "natural gas"]（primary は "crude oil" のまま）
    → Natural Gas（新規、requiredTechnology なし、随伴ガスとして0.25倍スケールで自動産出）
        │
        ▼ (modernDrillingAndFieldOperations が実質的な掘削操業ゲート、petroleum と共有)
  naturalGasLiquefaction（新規、era7）
    prerequisites: [modernDrillingAndFieldOperations, highPressureChemicalApparatus]
    — oilRefiningAndFractionation と同じ2前提の兄弟ノード（依存関係なし、並列）
    LNGPlants（新規、State資本設備、ChemistryTrial(kind="lngPlant")）
      Natural Gas + Coal + Machine Parts → LNG（単一出力、OilRefineryPlantsの単純化版）
        │
        ▼
  gasFiredElectricityGeneration（新規、era7）
    prerequisites: [naturalGasLiquefaction, generatorAndMotor]
    GasPowerStations（新規、State資本設備、PowerStationsの精密な複製）
      LNG + Copper Wire + Machine Parts → generationCapacity
        │
        ▼ (PowerGridInvestment が PowerStation/電化Damと同じプールへ合算— §3.9)
  Market.electricityStock
```

### 3.2 新規鉱物: `Natural Gas`

`mineralResourcesTypes.ts` の `FUEL_MINERAL_COMMODITIES` に `"natural gas"` を追加する:

```ts
export const FUEL_MINERAL_COMMODITIES = [
  "coal", "saltpeter", "sulfur", "phosphate rock", "bauxite", "cinnabar", "crude oil", "natural gas"
] as const;
```

`mineralResources.ts` の `DISTRICT_PROFILES` の `oilField` エントリを随伴ガス込みに拡張する（新しい district
type・`GeologicalProvinceKind`・`PROFILE_PRIORITY` エントリは不要 — 既存の `oilField` をそのまま使う）:

```ts
// Sedimentary source-rock petroleum + associated natural gas, same "basin" province as coalSeam/
// evaporite/phosphorite. Natural gas rides along as a secondary commodity (0.25x scale via
// createYield's primary flag) — the same "one district, two commodities" shape evaporite already
// uses for sulfur/saltpeter. docs/plan/natural-gas-lng-power-generation.md §3.2.
{ type: "oilField", provinces: ["basin"], primary: "crude oil", commodities: ["crude oil", "natural gas"] }
```

`createYield()` の `baseAnnualCapacity` に追加する:

```ts
"natural gas": 50 // calibration TBD — same order of magnitude as Crude Oil(70); the 0.25x
                   // secondary-commodity discount (createYield's primary flag) applies on top
```

`goods-generator.ts` に `Crude Oil` の直後へ追加する（`Bauxite`/`Cinnabar`/`Crude Oil` と同型 — 鉱山供給のみ、
`chance: 0`、`requiredTechnology` なし、`demandCoverage: {}`）。単位は `"therm"`（19世紀後半に確立した実在のガス
計量単位 — 都市ガス・天然ガスの請求慣行そのもの）を採用し、`LNG` とも共有する。

### 3.3 新規 Good: `LNG`

`goods-generator.ts` に `Natural Gas` の直後へ追加する。`Kerosene`/`Mercury`/`Aluminum` と同じく `recipes` を
持たない — `LNGPlants`（§3.7）だけが供給する。`requiredTechnology: "naturalGasLiquefaction"`。単位は
`Natural Gas` と同じ `"therm"`。

### 3.4 新規シグナル: `naturalGasAccess` / `lngAccess` / `lngPlantTrialYears` / `lngPlantInstallations` /
`gasPowerStationTrialYears` / `gasPowerStationInstallations`

`technologyTypes.ts` の `TechnologySignals` に6フィールド追加する（`petroleumAccess`/`refinedFuelAccess`/
`oilRefineryTrialYears`/`oilRefineryInstallations` の直後）:

```ts
/**
 * 0..1 market-stock coverage of Natural Gas, same shape as petroleumAccess. Natural Gas is the
 * associated/secondary commodity in oilField deposits (0.25x Crude Oil's yield scale, §3.2), so
 * naturalGasLiquefaction's thresholds read this at a lower bar than oilRefiningAndFractionation
 * reads petroleumAccess. See docs/plan/natural-gas-lng-power-generation.md §3.4.
 */
naturalGasAccess: number;
/** 0..1 market-stock coverage of LNG, same shape as refinedFuelAccess — the demand-pull for gasFiredElectricityGeneration. */
lngAccess: number;
/** LNGPlant's ChemistryTrial documentedRuns state max, same shape as oilRefineryTrialYears. */
lngPlantTrialYears: number;
/** Count of active LNGPlant entries, same shape as oilRefineryInstallations. */
lngPlantInstallations: number;
/** GasPowerStation.documentedRuns state max, same shape as powerStationTrialYears. */
gasPowerStationTrialYears: number;
/** Count of active GasPowerStation entries, same shape as powerStationInstallations. */
gasPowerStationInstallations: number;
```

`naturalGasAccess`/`lngAccess` は「比率」信号のため `COUNT_SIGNAL_KEYS`/`AMOUNT_SIGNAL_KEYS` への追加は不要。
`lngPlantTrialYears`/`lngPlantInstallations`/`gasPowerStationTrialYears`/`gasPowerStationInstallations` は
「件数」信号のため `COUNT_SIGNAL_KEYS` に追加する。

`technologyProgress.ts` の計算は既存パスへの1行追加の繰り返し:

```ts
const naturalGasId = goodIdByName(economy, "Natural Gas");
const lngId = goodIdByName(economy, "LNG");
// ...
const naturalGasStockByState = stateMarketStockByGood(economy, marketOwners, naturalGasId);
const lngStockByState = stateMarketStockByGood(economy, marketOwners, lngId);
// ...
signals.naturalGasAccess = clamp01((naturalGasStockByState.get(stateId) ?? 0) / 2);
signals.lngAccess = clamp01((lngStockByState.get(stateId) ?? 0) / 2);
```

`lngPlantTrialYears` は `economy.chemistryTrials` の `kind === "lngPlant"` を集計する1ブロック（`oilRefineryYears`
と同型）、`lngPlantInstallations` は `economy.lngPlants` の `active` 件数を数える1ループ（`oilRefineryPlants`
ブロックと同型）。`gasPowerStationTrialYears`/`gasPowerStationInstallations` は `economy.gasPowerStations` を
1回走査する1ブロック（`powerStations`/`telegraphLines` ブロックと同型）。

### 3.5 技術ノード: `naturalGasLiquefaction`（era 7）

`technologyDefinitions.ts` の `ERA_7` 配列末尾（`internalCombustionEngine` の直後）に追加する:

```ts
{
  id: "naturalGasLiquefaction",
  label: "Natural gas liquefaction",
  era: 7,
  scope: "state",
  prerequisites: ["modernDrillingAndFieldOperations", "highPressureChemicalApparatus"],
  known: { min: { naturalGasAccess: 0.1, experimentRecord: 0.68, treasury: 300 } },
  demonstrated: { min: { lngPlantTrialYears: 2, naturalGasAccess: 0.12, treasury: 360 } },
  adopted: { min: { lngPlantInstallations: 1, administration: 0.6, treasury: 420 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`oilRefiningAndFractionation` と同じ2前提（`modernDrillingAndFieldOperations` + `highPressureChemicalApparatus`）
の兄弟ノード — 互いへの依存はない。`naturalGasAccess` の閾値(0.1/0.12)は `petroleumAccess` 相当の閾値(0.3/0.35)
より意図的に低く設定する — Natural Gas は随伴ガスとして Crude Oil の0.25倍スケールでしか産出しないため
（§3.2）、同じペースで技術が進むよう閾値側で補正する。

### 3.6 技術ノード: `gasFiredElectricityGeneration`（era 7）

```ts
{
  id: "gasFiredElectricityGeneration",
  label: "Gas-fired electricity generation",
  era: 7,
  scope: "state",
  prerequisites: ["naturalGasLiquefaction", "generatorAndMotor"],
  known: { min: { lngAccess: 0.15, treasury: 440 } },
  demonstrated: { min: { gasPowerStationTrialYears: 2, lngAccess: 0.2, treasury: 500 } },
  adopted: { min: { gasPowerStationInstallations: 1, administration: 0.65, treasury: 560 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`administration`(0.65)は両前提の adopted 閾値（`naturalGasLiquefaction` の0.6、`generatorAndMotor` の0.55）を
上回るよう設定し、どちらか一方が adopted した瞬間の自動通過を避ける。`internalCombustionEngine` と異なり、
`gasFiredElectricityGeneration` の効果（`GasPowerStations`、§3.9）は実接続する — roadmap §9.3 の「後続の
石油・ガスなどのエネルギー供給」という一次資料の予告を、未接続のクエリ関数ではなく実際の発電容量として
初めて実装する。

### 3.7 新規型: `LNGPlant`（`chemistryTypes.ts`）

`ChemistryTrialKind` に `"lngPlant"` を追加する。`OilRefineryPlant` から二重出力を除いた単純形（単一出力、
`PhosphateFertilizerPlant`/`SyntheticAmmoniaPlant` と同じ最小形）:

```ts
export interface LNGPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}
```

### 3.8 State資本設備: `LNGPlants`

`chemMedCommon.ts` に定数追加（`OIL_REFINERY_PLANT_BUDGET(30)` の直後、`CHLOR_ALKALI_PLANT_BUDGET(34)` の前）:

```ts
/** calibration TBD — a cryogenic liquefaction plant: compressor/refrigeration machinery is
 *  heavier capital than fractional distillation alone (OIL_REFINERY_PLANT_BUDGET 30), but lighter
 *  than brine electrolysis (CHLOR_ALKALI_PLANT_BUDGET 34).
 *  See docs/plan/natural-gas-lng-power-generation.md §3.8. */
export const LNG_PLANT_BUDGET = 32;
```

新規モジュール `lngPlants.ts`（`oilRefineryPlants.ts` と同型構造、単一出力）。`worldHasModernDrilling()` と同じ
ローカルヘルパーを複製し（`modernDrillingAndFieldOperations` が世界のどこかで `demonstrated` かを判定）、
`Natural Gas 1.0 / Coal 0.3 / Machine Parts 0.15` を `consumeNamed` で消費して `coverage` を求め、
`utilization>=0.5` の年に `LNG`（trial: 0.4、service: 1.2 — `Kerosene` と同じ比率）を `addNamedStock` で産出する。
Firebrick の代わりに Machine Parts を使う（炉ではなく圧縮機・冷凍機が主要設備のため）。

`economyContext.ts`/`extensionStateSlices.ts` へ `getOilRefineryPlants`/`setOilRefineryPlants` と同型の
アクセサ・年次自己ゲート・配列登録を追加する。

### 3.9 State資本設備: `GasPowerStations`

`electricalTypes.ts` に追加（`PowerStation` と同じ形、`PowerFailureReason` を共有）:

```ts
/** Same shape as PowerStation — the second fuel source feeding the same generationCapacity pool
 *  (PowerGridInvestment, §3.9-3.10). See docs/plan/natural-gas-lng-power-generation.md §3.9. */
export interface GasPowerStation {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  generationCapacity: number;
  lastFailureReason?: PowerFailureReason;
}
```

`chemMedCommon.ts` に定数追加（`CHLOR_ALKALI_PLANT_BUDGET(34)` の直後、`POWER_STATION_BUDGET(36)` の前）:

```ts
/** calibration TBD — a gas-turbine hall is lighter capital than a full coal-fired boiler+turbine
 *  plant (POWER_STATION_BUDGET 36), but still a serious power-generation asset above
 *  CHLOR_ALKALI_PLANT_BUDGET(34). See docs/plan/natural-gas-lng-power-generation.md §3.9. */
export const GAS_POWER_STATION_BUDGET = 33;
```

新規モジュール `gasPowerStations.ts`（`powerStations.ts` の精密な複製）:

```ts
export const GAS_POWER_STATION_BASE_CAPACITY = 2; // same abstract unit as POWER_STATION_BASE_CAPACITY
```

`gasFiredElectricityGeneration` が `known` 以上の State だけがプラントを持てる。`LNG 3 / Copper Wire 1 /
Machine Parts 1.5` を年間投入量とする（Firebrick は消費しない — ガスタービンは石炭ボイラーのような炉内耐火煉瓦の
定期補修を必要としない、という現実の設備差を反映）。`utilization>=0.5` の年だけ `documentedRuns` を進め、
`generationCapacity = GAS_POWER_STATION_BASE_CAPACITY * (role==="trial" ? 0.25 : 1) * utilization` を再計算し、
`upsertInstruments(plant.burgId, 2)` を呼ぶ（`PowerStations` と同じ `instruments` Guild Knowledge 波及）。

`economyContext.ts`/`extensionStateSlices.ts` へ `getPowerStations`/`setPowerStations` と同型のアクセサ・
年次自己ゲート・配列登録を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、era 6/7 プラント群ブロック）:

```ts
PowerStations.settleAnnual();
// LNG/Copper Wire/Machine Parts only — the second fuel source joining the same generationCapacity
// pool via PowerGridInvestment (§3.9-3.10). docs/plan/natural-gas-lng-power-generation.md §3.9.
GasPowerStations.settleAnnual();
TelegraphLines.settleAnnual();
// ...(既存の era6/7 プラント群)...
OilRefineryPlants.settleAnnual();
// Natural Gas/Coal/Machine Parts only, independent of every other plant above — the era-7
// liquefaction step. docs/plan/natural-gas-lng-power-generation.md §3.8.
LNGPlants.settleAnnual();
```

### 3.10 `PowerGridInvestment` の発電容量プール拡張

`powerGridInvestment.ts` に、既存の `Dam` ループと同型の `GasPowerStation` ループを追加する（`PowerStation`
ループの直後）:

```ts
// GasPowerStation joins the same pool as coal PowerStations and electrified Dams — the "later
// oil/gas energy supply" roadmap §9.3 promises. docs/plan/natural-gas-lng-power-generation.md §3.10.
for (const plant of getGasPowerStations()) {
  if (!plant.active) continue;
  const marketId = marketIdForBurg(plant.burgId);
  if (marketId) capacityByMarket.set(marketId, (capacityByMarket.get(marketId) ?? 0) + plant.generationCapacity);
  if (plant.stateId) {
    capacityByState.set(plant.stateId, (capacityByState.get(plant.stateId) ?? 0) + plant.generationCapacity);
  }
}
```

石炭・水力・ガスの3種の発電源が同じ `Market.electricityStock` へ合算される — `powerGrid` 未採用の州では
同一Burg内のみ、採用済みの州では州全体プールという既存の2段階抽象化（§3.10、electric-power-and-telegraph.md
§3.10）を変更しない。

### 3.11 地図レイヤー: `drawPowerGrid.ts`

`GenerationSite.kind` に `"gas"` を追加し、`getGasPowerStations()` から `fromGasStation()` マッパーで変換する
ループを `collectGenerationSites()` に追加する。`stationMarkup()` のアイコン分岐に `"gas"` を追加する
（🔥⚡、燃料ラベル "gas-fired"）。送電網（`transmissionLinesMarkup`）は `kind` を区別しないため無変更で
ガス火力発電所からの送電線も自動的に描画される。

### 3.12 セーブ互換性

`NATURAL_GAS_CHAIN_GOOD_NAMES = ["Natural Gas", "LNG"] as const` を `goods-generator.ts` に追加し、
`migrateNaturalGasChainGoods()` を実装する（`migratePetroleumChainGoods()` と同形）。`index.tsx` の両方の
呼び出し箇所（生成時・ロード時）に `migratePetroleumChainGoods()` の直後で追加する。

新規配列 `lngPlants`/`gasPowerStations` は §3.8-3.9 のとおり `extensionStateSlices.ts` へ登録する。

`src/i18n/locales/en.json`/`ja.json` の `economy.goods.names` に `"Natural Gas"`/`"LNG"`
（天然ガス／LNG）を、`technology.names`（実際のキーパス、§4 参照）に `"naturalGasLiquefaction"`/
`"gasFiredElectricityGeneration"`（天然ガス液化／ガス火力発電）を追加する。

## 4. テスト計画

- `mineralResources.test.ts`: `getMinedGoodName("natural gas")` が `"natural gas"` を返し、
  `isMineSuppliedGoodName("Natural Gas")` が `true` になること。
- `goods-generator.test.ts`: `Natural Gas`/`LNG` が `GOODS_DATA` に存在し、`Natural Gas` が `requiredTechnology`
  を持たず、`LNG` が `recipes` を持たないこと、`migrateNaturalGasChainGoods()` が旧セーブへ既存 id を壊さず
  追加すること。
- `technologyProgress.test.ts`: 2ノードの era・prerequisites・閾値キーの静的チェック。
  `naturalGasAccess`/`lngAccess`/`lngPlantTrialYears`/`lngPlantInstallations`/`gasPowerStationTrialYears`/
  `gasPowerStationInstallations` が正しく集計されること。
- `lngPlants.test.ts`（新規、`oilRefineryPlants.test.ts` と同じ形。ただし単一出力の `LNG` のみ）:
  `naturalGasLiquefaction` が未 `known` の州はプラントを持たないこと、Natural Gas/Coal/Machine Parts 不足で
  `utilization` が下がり `documentedRuns` が増えないこと、`modernDrillingAndFieldOperations` が世界のどこにも
  demonstrated でない間は産出しないこと、`adopted` 昇格で `role` が `service` になること、年次自己ゲート。
- `gasPowerStations.test.ts`（新規、`powerStations.test.ts` と同じ形。燃料が `LNG` である点のみ異なる）。
- `powerGridInvestment.test.ts`: `GasPowerStation` の `generationCapacity` が `PowerStation`/電化`Dam`と同じ
  プールへ合算されること（既存の Dam プール合算テストと同型のケースを追加）。
- `drawPowerGrid.test.ts`: `"gas"` kind の `GasPowerStation` がアイコン付きマーカーとして描画されること。

## 5. 受け入れ条件

- `Natural Gas` は `oilField` district から `Crude Oil` と同時に、0.25倍スケールで自動供給される — 鉱山生成
  ロジックへの追加変更なしに。
- `naturalGasLiquefaction`/`gasFiredElectricityGeneration` は前提ノードの adopted だけでは自動通過しない。
- `LNGPlants` が稼働した年だけ `LNG` の市場在庫が増加する。
- `GasPowerStations` が産出した `generationCapacity` は、`PowerStation`/電化`Dam` と同じ
  `PowerGridInvestment` のプールへ合算され、翌年の `Market.electricityStock` に反映される — 石炭専焼だった
  発電チェーンに、初めて実接続された2つ目の燃料源が加わる。
- `Natural Gas`/`LNG` はいずれも家庭用 `demandCoverage` を持たない。
- 既存セーブ（`Natural Gas`/`LNG` を持たない旧カタログ、`lngPlants`/`gasPowerStations` 配列を持たない旧セーブ）
  をロードしても、既存 Good の id がずれず、新規配列が空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・関連ユニットテストがすべて通過する。

## 6. 決定事項 / Open Questions

1. **`Natural Gas` は新しい district type を持たない**。既存の `oilField` へ随伴ガスとして追加し、
   `evaporite` の sulfur/saltpeter と同型の「1 district・2 commodity」パターンを踏襲する。非随伴（乾性）ガス田は
   非目的。
2. **`naturalGasLiquefaction` は `oilRefiningAndFractionation` に依存しない**。同じ2前提を共有する兄弟ノードとし、
   石油精製が未実装/未進行の State でも天然ガス液化だけ単独で進められる。
3. **`GasPowerStation` は `PowerStation` と同一抽象化レベルに留める**。ガスタービン特有の効率優位性・起動速度は
   モデル化しない — 石炭・ガスの間で発電方式の優劣をつけない。
4. **地図レイヤー（`drawPowerGrid.ts`）は実装範囲に含める**。既存の `"coal" | "hydro"` 抽象化が既に複数燃料を
   想定した形になっており、3つ目の kind を追加するコストが小さいため（他の縦切りが UI を非目的とする理由 —
   専用レイヤーが存在しない — とは事情が異なる）。
