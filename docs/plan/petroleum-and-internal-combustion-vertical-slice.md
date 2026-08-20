# 石油・内燃機関の縦切り実装計画 (Petroleum → Refining → Internal Combustion Vertical Slice)

## 状態

**実装済み（2026-08-20）**。[technology-development-roadmap.md](./technology-development-roadmap.md) §10（L333-345）と
実装順序 Phase 7（L472-476）を対象に、`petroleumGeologyAndExploration` / `modernDrillingAndFieldOperations` /
`oilRefiningAndFractionation` / `internalCombustionEngine` の4つの `TechnologyDefinition`（era 7）と、その「効果」欄が
明示する `Crude Oil`（鉱山供給の原油 Good）→ `Kerosene`/`Lubricating Oil`（`OilRefineryPlants` という State資本設備の
み供給する精製 Good）を実装する。

## 1. 目的と非目的

### 目的

- roadmap §10 の5行のうち最初の4行（石油地質・試掘、近代掘削・油田運営、製油・分留、内燃機関）を
  `TechnologyDefinition` として実装する。第5行（石油化学）は非目的（後述）。
- `Crude Oil`（新規鉱物 Good、鉱山供給。district `oilField`、province `basin` — coalSeam/evaporite/phosphorite と
  同じ堆積盆地区分）を実装する。`Bauxite`/`Cinnabar` と同じく `requiredTechnology` を持たない — 採掘そのものは
  ゲートしない（§3.1 の循環依存回避の理由も参照）。
- `製油・分留` ノード（`oilRefiningAndFractionation`）の実用化により、`OilRefineryPlants` という State資本設備が
  `Crude Oil` を消費して `Kerosene`（灯油・軽質燃料。roadmap の「軽質燃料」枠）と `Lubricating Oil`（潤滑油）を
  産出する。両 Good とも `Synthetic Ammonia`/`Aluminum`/`Mercury` と同じ「資本設備のみ」パターンを踏襲する。
- `内燃機関` ノード（`internalCombustionEngine`）を、精製燃料・鋼材アクセスを閾値とする技術グラフ上のノードとして
  実装する。roadmap 自身が「車両・船舶・発電・後続航空の動力」という効果を挙げているが、これらを受け取る具体的な
  消費システム（車両 Good、船舶動力ボーナスなど）は本書の対象外とし、次タスクに委ねる（§1 非目的、Mercury の
  「貴金属アマルガム」「精密計測・電気機器」を未実装消費先として次タスクに委ねた判断を踏襲）。

### 非目的（本書の範囲外）

- roadmap §10 の5行目「石油化学」（`chemicalEngineering`、`触媒化学`、大規模製油 → 合成材料・溶剤・高性能燃料など）を
  独立ノードとして新設すること。前提となる大規模製油の実運用データがまだ薄く、`catalyticChemistry`
  との具体的な接続方法（新規 Good か、既存 Good の代替供給源か）を決めるだけの後続タスクが定まっていないため
  （[speculative design を避ける] という既存の判断パターン、[[feedback_speculative_future_requirements]]）。
- §13 実装順序 Phase 7 ステップ3が挙げる「石油輸送」。Shipbuilding/Caravan 側の輸送コスト・戦略的重要性
  （roadmap §10 末尾「油田・港湾・パイプライン・海路の戦略的重要性」）への接続は、既存の海上交易・キャラバン
  インフラと具体的にどう噛み合わせるかが未決定であり、次タスクに委ねる。
- `内燃機関` の「車両・船舶・発電・後続航空の動力」という効果の具体的な実装。技術ノード自体（発見・実証・採用の
  進行、閾値ゲート）は本書で完成させるが、それを読み取る消費先（新規 Good、既存動力ボーナスの拡張など）は
  存在しない。`getInternalCombustionEngineEffect()` という 0..1 の効果クエリ関数は他ノード
  （`getMechanizedTextilesEffect`/`getAtmosphericSteamPumpingEffect`）と同じ形で公開するが、
  `getAtmosphericSteamDrainageBonus()` が現在どのモジュールからも呼ばれていないのと同様、消費先が決まるまで未接続の
  ままにする。
- `Kerosene` を家庭用の照明・暖房燃料（史実のランプ油用途）として `demandCoverage` に接続すること。既存の `Oil`
  Good（オリーブ・鯨油ベースの家内制手工業）が既にこの役割を担っており、`Kerosene` は産業用の資本設備供給専用
  Good として単純化する（Mercury/Synthetic Ammonia と同じ「市場在庫として蓄積されるだけで末端需要を持たない」
  パターン）。
- `Crude Oil` の採掘技術そのもののゲート。§3.1 で詳述するとおり、`modernDrillingAndFieldOperations` の閾値に
  `petroleumAccess`（`Crude Oil` の市場在庫カバレッジ）を使うため、`Crude Oil` 自体を `requiredTechnology` で
  ゲートすると「産出されない限りアクセス指標が上がらず、アクセス指標が上がらない限り産出が解禁されない」という
  循環依存に陥る。`Bauxite`/`Cinnabar` と同じ「原鉱石はゲートなし、精製 Good のみゲート」パターンを踏襲する。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 鉱物 district の堆積盆地区分 | `coalSeam`/`evaporite`/`phosphorite` がいずれも `provinces: ["basin"]` で、堆積岩起源の資源を同じ地質区分に置く先例がある。石油の根源岩も堆積盆地であり、新しい `GeologicalProvinceKind` は不要。 | [mineralResources.ts:84-88](../../src/extensions/economy/generators/mineralResources.ts#L84-L88) |
| 「原鉱石はゲートなし、精製 Good のみゲート」パターン | `Bauxite`/`Cinnabar` はいずれも `requiredTechnology` を持たず、`Alumina`/`Mercury` のみが持つ。`isGoodEnabled()` は `MineOperation.produceMonth()` から呼ばれ、ゲートされた Good は鉱山産出そのものが止まる。 | [goods-generator.ts:2815-2824](../../src/extensions/economy/generators/goods-generator.ts#L2815-L2824)、[mineOperations.ts:435-436](../../src/extensions/economy/generators/mineOperations.ts#L435-L436) |
| 市場在庫カバレッジ信号のテンプレート | `sulfurAccess`/`phosphateRockAccess`/`steelAccess`/`copperWireAccess`/`cinnabarAccess` はいずれも `clamp01(stock / 2)` という同一の形で、`applyChemistryMedicineSignals()` 内の1本の `stateMarketStockByGood()` パスで計算される。 | [technologyProgress.ts:756-845](../../src/generators/technologyProgress.ts#L756-L845) |
| ChemistryTrial 経由の State資本設備テンプレート | `AcidPlant`/`PhosphateFertilizerPlant`/`SyntheticAmmoniaPlant`/`MercuryPlant` はいずれも同一の `{burgId, stateId, role, active, utilization, documentedRuns, lastFundedYear}` 形（Mercury のみ `contamination` を追加）。`settleAnnual()` は「年次自己ゲート → 前提ノードが `known` 以上の State だけプラント新設 → 資材消費→ coverage → utilization → documentedRuns → 前提ノードが世界のどこかで `demonstrated` なら産出」という同一の8ステップを踏む。単一 Good 産出のみで、複数 Good を同時産出するプラントの先例はまだない。 | [mercuryPlants.ts](../../src/extensions/economy/generators/mercuryPlants.ts)、[chemistryTypes.ts:69-139](../../src/extensions/economy/generators/chemistryTypes.ts#L69-L139) |
| 技術効果クエリ関数の「未接続」先例 | `getAtmosphericSteamDrainageBonus(stateId)` は `technologyProgress.ts` からエクスポートされているが、`grep` でリポジトリ全体を検索しても呼び出し元は自身の定義のみ — 消費先が決まるまで技術効果を関数として公開だけしておくパターンが既に存在する。 | [technologyProgress.ts:192-194](../../src/generators/technologyProgress.ts#L192-L194) |
| `TechnologyEraBand` の上限 | `0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 6` — era 7 はまだ型に存在しない。 | [technologyTypes.ts:17](../../src/generators/technologyTypes.ts#L17) |

結論として、State資本設備・鉱物 district・Good カタログ・市場在庫カバレッジ信号という4層は
`AcidPlant`/`Bauxite`/`Cinnabar`/`Mercury` の先例からそのまま複製できる。本書で実質的に新しいのは
「①単一プラントが2つの Good（Kerosene・Lubricating Oil）を同時産出する、②市場在庫カバレッジ信号
（`petroleumAccess`）を『ゲートされていない Good』の閾値として使うことで循環依存を避ける、③ `TechnologyEraBand`
に 7 を追加する」の3点に限定される。

## 3. 設計

### 3.1 概念モデル

```text
既存の資源採掘レイヤ（Bauxite/Cinnabar と同型、新しい GeologicalProvinceKind は不要）:
  oilField district (province: "basin", 既存の coalSeam/evaporite/phosphorite と同区分)
    → Crude Oil（新規、requiredTechnology なし — 採掘そのものはゲートしない）

本書が追加する技術ノード（era 7）:
  petroleumGeologyAndExploration（新規、知識蓄積のみ。Good ゲートなし）
    prerequisites: [mineSurveyAndDrainage, precisionBoringAndMeasurement]
        │ (地質調査・測量の知見 + 精密削孔装置 = 石油地質・試掘の代理信号)
        ▼
  modernDrillingAndFieldOperations（新規、Good ゲートなし。petroleumAccess を実質的なゲートにする）
    prerequisites: [petroleumGeologyAndExploration]
    known/demonstrated/adopted すべてが petroleumAccess（Crude Oil 市場在庫カバレッジ）を要求する
    → Crude Oil が実際に採掘・流通していない State はここで足止めされる
        │
        ▼
  oilRefiningAndFractionation（新規、chemicalEngineering/thermodynamics の代理として highPressureChemicalApparatus）
    prerequisites: [modernDrillingAndFieldOperations, highPressureChemicalApparatus]
        │
        ▼
  OilRefineryPlants（新規、State資本設備。ChemistryTrial(kind="oilRefineryPlant")）
    Crude Oil + Coal + Firebrick
      → Kerosene（requiredTechnology: oilRefiningAndFractionation、resulting bulk output）
      → Lubricating Oil（requiredTechnology: oilRefiningAndFractionation、resulting小量副産物）
        │
        ▼
  internalCombustionEngine（新規、mechanics/precisionMachining の代理として standardMachineWorks）
    prerequisites: [oilRefiningAndFractionation, standardMachineWorks]
    known/demonstrated/adopted は refinedFuelAccess（Kerosene 市場在庫カバレッジ）+ steelAccess を要求する
    効果: getInternalCombustionEngineEffect()（未接続、§1 非目的）
```

`petroleumAccess`（`Crude Oil` の市場在庫カバレッジ）を `modernDrillingAndFieldOperations`
の閾値に使うことで、「実際に石油が採れて市場に流通している State だけが近代掘削へ進める」という roadmap の
「安定した Crude Oil 生産」を、`Crude Oil` 自体をゲートすることなく表現する。`Crude Oil` は
`requiredTechnology` を持たないため、この信号は循環依存に陥らない（§1 非目的）。

### 3.2 新規鉱物: `Crude Oil`

`mineralResourcesTypes.ts` の `FUEL_MINERAL_COMMODITIES` に `"crude oil"` を追加する:

```ts
export const FUEL_MINERAL_COMMODITIES = [
  "coal", "saltpeter", "sulfur", "phosphate rock", "bauxite", "cinnabar", "crude oil"
] as const;
```

`MineralDistrictType` に `"oilField"` を追加する。`mineralResources.ts` の `DISTRICT_PROFILES` に、
`coalSeam`/`evaporite`/`phosphorite` と同じ `"basin"` province を使うプロファイルを追加する（新しい
`GeologicalProvinceKind` は不要 — 石油の根源岩は史実でも堆積盆地に形成される）:

```ts
// Sedimentary source-rock petroleum, same "basin" province as coalSeam/evaporite/phosphorite —
// no new GeologicalProvinceKind. docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.2.
{ type: "oilField", provinces: ["basin"], primary: "crude oil", commodities: ["crude oil"] }
```

`PROFILE_PRIORITY` の `"phosphorite"` の直後に `"oilField"` を追加する。`createYield()` の
`baseAnnualCapacity` に追加する:

```ts
"crude oil": 70 // calibration TBD — bulk fuel mineral like Coal(160)/Bauxite(120), but scarcer at this era
```

`getMinedGoodName("crude oil")` は非 `OreCommodity` のため `"crude oil"` をそのまま返し（`Bauxite`/`Cinnabar` と
同じ経路）、`MineOperations.produceMonth()` が既存ロジックのまま自動供給する。追加のコード変更は不要。

`goods-generator.ts` に `Mercury` の直後へ追加する（`Bauxite`/`Cinnabar` と同型 — 鉱山供給のみ、`chance: 0`、
`requiredTechnology` なし、`demandCoverage: {}`）。

### 3.3 新規 Good: `Kerosene` / `Lubricating Oil`

`goods-generator.ts` に `Crude Oil` の直後へ追加する。`Mercury`/`Synthetic Ammonia`/`Aluminum` と同じく
`recipes` を持たない — `OilRefineryPlants`（§3.7）だけが供給する。両方とも
`requiredTechnology: "oilRefiningAndFractionation"`。既存の `Oil`（オリーブ・鯨油ベースの家内制手工業）とは
別の Good であり、名前も衝突しない。

### 3.4 新規シグナル: `petroleumAccess` / `refinedFuelAccess` / `oilRefineryTrialYears` / `oilRefineryInstallations`

`technologyTypes.ts` の `TechnologySignals` に4フィールド追加する:

```ts
/** 0..1 market-stock coverage of Crude Oil, same shape as cinnabarAccess/steelAccess. */
petroleumAccess: number;
/** 0..1 market-stock coverage of Kerosene, same shape as petroleumAccess — the demand-pull for internalCombustionEngine. */
refinedFuelAccess: number;
/** OilRefineryPlant's ChemistryTrial documentedRuns state max, same shape as mercuryPlantTrialYears. */
oilRefineryTrialYears: number;
/** Count of active OilRefineryPlant entries, same shape as mercuryPlantInstallations. */
oilRefineryInstallations: number;
```

`petroleumAccess`/`refinedFuelAccess` は `sulfurAccess`/`cinnabarAccess` と同じ「比率」信号のため
`COUNT_SIGNAL_KEYS`/`AMOUNT_SIGNAL_KEYS` への追加は不要（`signalRequirementKind()` のデフォルト `"ratio"` に
自然に収まる）。`oilRefineryTrialYears`/`oilRefineryInstallations` は `mercuryPlantTrialYears`/
`mercuryPlantInstallations` と同じ「件数」信号のため `COUNT_SIGNAL_KEYS` に追加する。

### 3.5 技術ノード（era 7、4件）

`technologyDefinitions.ts` に新規 `ERA_7` 配列を追加する:

```ts
{
  id: "petroleumGeologyAndExploration",
  label: "Petroleum geology and exploratory drilling",
  era: 7,
  scope: "state",
  prerequisites: ["mineSurveyAndDrainage", "precisionBoringAndMeasurement"],
  known: { min: { mineCount: 2, treasury: 140 } },
  demonstrated: { min: { mineCount: 2, deepMineCount: 2, treasury: 190 } },
  adopted: { min: { mineCount: 3, deepMineCount: 2, administration: 0.4, treasury: 240 } }
},
{
  id: "modernDrillingAndFieldOperations",
  label: "Modern drilling and oil-field operations",
  era: 7,
  scope: "state",
  prerequisites: ["petroleumGeologyAndExploration"],
  known: { min: { petroleumAccess: 0.15, treasury: 200 } },
  demonstrated: { min: { petroleumAccess: 0.25, administration: 0.45, treasury: 260 } },
  adopted: { min: { petroleumAccess: 0.35, administration: 0.5, treasury: 320 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
},
{
  id: "oilRefiningAndFractionation",
  label: "Oil refining and fractional distillation",
  era: 7,
  scope: "state",
  prerequisites: ["modernDrillingAndFieldOperations", "highPressureChemicalApparatus"],
  known: { min: { petroleumAccess: 0.3, experimentRecord: 0.68, treasury: 320 } },
  demonstrated: { min: { oilRefineryTrialYears: 2, petroleumAccess: 0.35, treasury: 380 } },
  adopted: { min: { oilRefineryInstallations: 1, administration: 0.62, treasury: 450 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
},
{
  id: "internalCombustionEngine",
  label: "Internal combustion engine",
  era: 7,
  scope: "state",
  prerequisites: ["oilRefiningAndFractionation", "standardMachineWorks"],
  known: { min: { refinedFuelAccess: 0.15, steelAccess: 0.35, treasury: 300 } },
  demonstrated: { min: { refinedFuelAccess: 0.25, steelAccess: 0.4, treasury: 360 } },
  adopted: { min: { refinedFuelAccess: 0.35, steelAccess: 0.45, administration: 0.5, treasury: 430 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

各ノードの `known` 閾値は前提ノード自身の `adopted` 閾値より高く設定し、前提が `adopted` になった瞬間に
自動通過しないようにする（`industrialSulfuricAcid` が `chemicalIndustryFoundation` の閾値を再掲しない、という
既存パターンと同じ理由）。`petroleumGeologyAndExploration` は「石油地質・試掘」という探査活動そのものに
Petroleum 固有のゲートを持たせない（`mineSurveyAndDrainage`/`coalFuelSupply` が特定鉱石固有のゲートを持たない
のと同じ判断）— 実際に石油が採れるかどうかのゲートは `modernDrillingAndFieldOperations` の `petroleumAccess`
が担う。

`technologyTypes.ts` の `TechnologyEraBand` に `7` を追加する。

### 3.6 新規型: `OilRefineryPlant`（`chemistryTypes.ts`）

`ChemistryTrialKind` に `"oilRefineryPlant"` を追加する。`PhosphateFertilizerPlant`/`SyntheticAmmoniaPlant` と
同じ形（`contamination` のような追加負債フィールドは持たない — 精製自体に Mercury のような不可避負債の設定は
roadmap に明記されていない）:

```ts
/** Same shape as PhosphateFertilizerPlant/SyntheticAmmoniaPlant. Unlike MercuryPlant, this plant
 *  yields two Goods (Kerosene bulk + Lubricating Oil byproduct) from one Crude Oil input — the
 *  first two-output plant in this economy. Design: petroleum-and-internal-combustion-vertical-
 *  slice.md §3.6-3.7. */
export interface OilRefineryPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}
```

### 3.7 State資本設備: `OilRefineryPlants`

`chemMedCommon.ts` に定数追加（`PHOSPHATE_FERTILIZER_PLANT_BUDGET(28)` と `CHLOR_ALKALI_PLANT_BUDGET(34)` の間 —
分留塔を備えた本格的な工業プラントであり、Mercury の小型レトルトより大きいが、電解プラントほどではない）:

```ts
/** calibration TBD — a fractional-distillation refinery: heavier than PHOSPHATE_FERTILIZER_PLANT_
 *  BUDGET(28), lighter than CHLOR_ALKALI_PLANT_BUDGET(34). See petroleum-and-internal-combustion-
 *  vertical-slice.md §3.7. */
export const OIL_REFINERY_PLANT_BUDGET = 30;
```

新規モジュール `oilRefineryPlants.ts`（`mercuryPlants.ts` と同型構造、`contamination` を持たない代わりに
一度に2つの Good を産出する）:

```ts
export class OilRefineryPlantsModule {
  settleAnnual(): boolean {
    // mercuryPlants.ts と同型:
    // 1. 年次自己ゲート（getOilRefineryPlantsLastSettledYear）
    // 2. oilRefiningAndFractionation が "known" 以上の State だけがプラントを持てる
    // 3. plant新設/継続ごとに OIL_REFINERY_PLANT_BUDGET を debitTreasury
    // 4. Crude Oil 1.0 / Coal 0.2 / Firebrick 0.1 を consumeNamed で消費し coverage を求める
    //    （AcidPlant の 0.5/0.3/0.1 よりやや大きい — Crude Oil は Coal/Bauxite と同スケールのバルク燃料鉱物）
    // 5. utilization が 0.5 以上なら documentedRuns を進め、modernDrillingAndFieldOperations が
    //    世界のどこかで demonstrated なら Kerosene と Lubricating Oil を産出する
    //    （trial: Kerosene 0.4 / Lubricating Oil 0.08、service: Kerosene 1.2 / Lubricating Oil 0.25
    //    — 分留の主留分（灯油）と副産物（潤滑油）の比率を大まかに反映）。
    //    0.5 未満なら trial.lastFailureReason を "materialShortage" に設定する。
    // 6. adoptedに達したらroleを"trial"→"service"に昇格
  }
}
export const OilRefineryPlants = new OilRefineryPlantsModule();
```

`economyContext.ts` にスライスアクセサを追加する（`getMercuryPlants`/`setMercuryPlants`/
`getMercuryPlantsLastSettledYear`/`setMercuryPlantsLastSettledYear` と同型）:
`getOilRefineryPlants`/`setOilRefineryPlants`/`getOilRefineryPlantsLastSettledYear`/
`setOilRefineryPlantsLastSettledYear`。`_oilRefineryPlantsLastSettledYearFallback` フォールバック変数と、
モジュールリセット処理にも追加する。`extensionStateSlices.ts` の `validateEconomySlice()` 配列フィールド一覧に
`"oilRefineryPlants"` を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、era-6/7 プラントブロックの末尾、`MercuryPlants.settleAnnual()`
の直後、`settleChemMedPracticeDecay()` の直前）:

```ts
MercuryPlants.settleAnnual();
// Crude Oil/Coal/Firebrick only, independent of every other plant above — the era-7 refining step.
// petroleum-and-internal-combustion-vertical-slice.md §3.7.
OilRefineryPlants.settleAnnual();
settleChemMedPracticeDecay();
```

### 3.8 セーブ互換性

`PETROLEUM_CHAIN_GOOD_NAMES = ["Crude Oil", "Kerosene", "Lubricating Oil"] as const` を `goods-generator.ts` に
追加し、`migratePetroleumChainGoods()` を実装する（`migrateMercuryChainGoods()` と同形 — どの Good も `recipes`
を持たないため、ingredient-id 解決ループは不要）。`index.tsx` の両方の呼び出し箇所（生成時・ロード時）に
`migrateMercuryChainGoods()` の直後で追加する。

新規配列 `oilRefineryPlants` は §3.7 のとおり `extensionStateSlices.ts` へ登録する。

`src/i18n/locales/en.json`/`ja.json` の `economy.goods.names` に `"Crude Oil"`/`"Kerosene"`/`"Lubricating Oil"`
（原油／灯油／潤滑油）を追加する。

## 4. テスト計画

- `oilRefineryPlants.test.ts`（新規、`mercuryPlants.test.ts` と同じ形。ただし contamination ケースの代わりに
  「2つの Good を同時産出すること」を確認するケースを追加）: `oilRefiningAndFractionation` が未 `known` の州は
  プラントを持たないこと、Crude Oil/Coal/Firebrick 不足で `utilization` が下がり `documentedRuns` が増えないこと
  （`lastFailureReason: "materialShortage"`）、`modernDrillingAndFieldOperations` が世界のどこにも demonstrated
  でない間は産出しないこと、**産出時に Kerosene と Lubricating Oil の両方が同時に市場在庫へ加算されること**
  （新規ケース）、`adopted` 昇格で `role` が `service` になること、年次自己ゲート。
- `technologyProgress.test.ts`: 4ノードの era・prerequisites・閾値キーの静的チェック。
  `modernDrillingAndFieldOperations` が `petroleumGeologyAndExploration` の adopted 前には一切進行しないこと。
  `petroleumAccess`/`refinedFuelAccess`/`oilRefineryTrialYears`/`oilRefineryInstallations` が正しく集計される
  こと。
- `goods-generator.test.ts`: `Crude Oil`/`Kerosene`/`Lubricating Oil` が `GOODS_DATA` に存在し、`Crude Oil` が
  `requiredTechnology` を持たず、`Kerosene`/`Lubricating Oil` がいずれも `recipes` を持たないこと、
  `migratePetroleumChainGoods()` が旧セーブへ既存 id を壊さず追加すること。
- `mineralResources.test.ts`: `getMinedGoodName("crude oil")` が `"crude oil"` を返し、
  `isMineSuppliedGoodName("Crude Oil")` が `true` になること（`Bauxite`/`Cinnabar` と同じ経路）。

## 5. 受け入れ条件

- `petroleumGeologyAndExploration` が `adopted` になるまで `modernDrillingAndFieldOperations` は `known` にすら
  進まない。
- `modernDrillingAndFieldOperations` は、その State の市場に `Crude Oil` が実際に流通していない限り（
  `petroleumAccess` が閾値未満の限り）進行しない — `Crude Oil` 自体は `requiredTechnology` を持たないため、
  この判定は循環依存に陥らない。
- `oilRefiningAndFractionation` が `adopted` になっただけでは `Kerosene`/`Lubricating Oil` の市場在庫は変化
  しない。実際に `OilRefineryPlant` が稼働し、Crude Oil/Coal/Firebrick を消費しなければ `utilization` は 0.5
  を下回り出力されない。
- `OilRefineryPlant` が稼働した年は `Kerosene` と `Lubricating Oil` の両方が同時に市場在庫へ加算される —
  この経済における最初の「1入力・2出力」プラント。
- `Kerosene`/`Lubricating Oil` はいずれも `recipes` を持たない — 家内制手工業の供給経路は存在しない。
- `Crude Oil` は `Bauxite`/`Cinnabar` と同じ「鉱山供給のみ」パターンで、鉱山生成ロジックへの追加変更なしに
  自動供給される。
- 既存セーブ（`Crude Oil`/`Kerosene`/`Lubricating Oil` を持たない旧カタログ、`oilRefineryPlants` 配列を持たない
  旧セーブ）をロードしても、既存 Good の id がずれず、新規配列が空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・関連ユニットテストがすべて通過する。

## 6. 決定事項 / Open Questions

1. **`Crude Oil` は `requiredTechnology` を持たない**。`Bauxite`/`Cinnabar` と同じ「原鉱石はゲートなし」
   パターン。`modernDrillingAndFieldOperations` の `petroleumAccess` 閾値と組み合わせた場合の循環依存を避ける
   ためでもある（§1 非目的）。
2. **`OilRefineryPlant` は Mercury のような不可避負債（contamination 相当）を持たない**。roadmap §10 は石油精製
   に健康・環境負債を明記しておらず、Mercury の §15 決定事項10のような設計要求が存在しない。
3. **`Kerosene`/`Lubricating Oil` を家庭用 `demandCoverage` に接続しない**。既存の `Oil`
   Good（オリーブ・鯨油）が家庭用途を既に担っており、産業用の資本設備供給専用 Good として単純化する。
4. **「石油化学」（roadmap §10 5行目）を実装しない**。大規模製油の実運用データが薄く、`catalyticChemistry` との
   具体的な接続方法が未決定のため次タスクに委ねる。
5. **`internalCombustionEngine` の「車両・船舶・発電・後続航空の動力」効果を実装しない**。技術ノード自体は
   完成させるが、消費先（新規 Good、既存動力ボーナスの拡張）が未定のため、`getAtmosphericSteamDrainageBonus()`
   と同じ「未接続の効果クエリ関数」として公開するに留める。
6. **「石油輸送」（§13 Phase 7 ステップ3）を実装しない**。Shipbuilding/Caravan との具体的な接続方法が未決定。
