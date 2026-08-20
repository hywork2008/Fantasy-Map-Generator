# 電解工業の縦切り実装計画 (Electrolytic Industry Vertical Slice)

## 状態

**実装済み（2026-08-20）**。[technology-development-roadmap.md](./technology-development-roadmap.md) §9.3（L279-291）のノード表5行目
「電解工業」（L289: `electrochemistry、chemicalEngineering、安定した電力網 | 大量電力、電極材料、化学プラント | アルミニウムなど、
電気集約型の材料生産`）と、§9.4「アルミニウム: 電力を材料へ変える産業」（L293-310）を対象に、`electrolyticIndustry` という
単一の `TechnologyDefinition` と、その「結果」欄が明示するアルミニウム生産チェーン（`Bauxite` → `Alumina` → `Aluminum`）を
実装する。

[electric-power-and-telegraph.md](./electric-power-and-telegraph.md) §1 非目的が明示的に本書へ委譲した項目である:
「電解工業・アルミニウム・水銀（roadmap §9.4-9.5）。`Electricity` を大口消費する産業は、電力網そのものが存在しない今は
導入する対象がなく、`electricityStock` という新しいカバレッジ指標だけを用意して次の縦切りに委ねる」。`powerGrid` が
既に実装済みで `Market.electricityStock` が計算され始めている今、その「次の縦切り」が本書である。

## 1. 目的と非目的

### 目的

- roadmap §9.3 L289 の「電解工業」を `TechnologyDefinition`（id: `electrolyticIndustry`）として実装する。前提3項目
  （electrochemistry / chemicalEngineering / 安定した電力網）を、既存の技術グラフの対応するノードへ写像する（§3.1）。
- roadmap §9.4 のアルミニウムチェーンを実装する: `Bauxite`（鉱石 Good、新規鉱物）→ `Alumina`（中間 Good、職人レシピ）
  → `Aluminum`（電解精錬 Good、State資本設備のみ）。
- `Market.electricityStock` を初めて実際の生産制約として消費する（§3.6）。`electric-power-and-telegraph.md` §1 非目的
  が明示的に先送りした「Electricity を大口消費する産業」を、ここで初めて接続する。
- 「発明した State 全体へ倍率を与えない」設計原則（roadmap §9.3）を踏襲する: `electrolyticIndustry` が `adopted` に
  なっただけでは何も生産されない。実際に `ElectrolysisPlant` が稼働し、`Bauxite`/`Alumina`/`Coke`/`Firebrick` の
  在庫と `Market.electricityStock` の両方を満たして初めて `Aluminum` が市場に生まれる。

### 非目的（本書の範囲外）

- roadmap §9.4 の後続ノード「電解アルミニウム」「軽量構造材・導体」を独立した `TechnologyDefinition` として新設する
  こと。roadmap のノード表は「電解アルミニウム」の前提を「電解工業、電力網、炭素電極、氷晶石または代替フラックス」と
  記載しており、`electrolyticIndustry` 自身の前提（`powerGrid` 込み）と実質的に重複する。本書は `electrolyticIndustry`
  の `requiredTechnology` を `Aluminum` Good に直接設定することで、電解アルミニウムを独立ノードに分割せず roadmap の
  「結果」欄（アルミニウムなど、電気集約型の材料生産）をそのまま体現する。「軽量構造材・導体」（送電・輸送・航空・宇宙
  機器の材料選択肢）は `Aluminum` の消費先が存在しない現状ではまだ導入対象がなく、具体的な次タスクが決まった時点で
  別の縦切りに委ねる — `electric-power-and-telegraph.md` が `Electricity` の消費先を本書に委ねたのと同じ理由。
- roadmap §9.5 の水銀・辰砂チェーン。電解工業とは独立した鉱物・毒性チェーンであり、本書と技術的依存関係を持たない。
- 塩素アルカリ電解（chlor-alkali electrolysis）。`goods-generator.ts` の `Caustic Soda` コメントが「causticization…
  the historical route to NaOH before the chlor-alkali electrolysis ChlorinePlants' design notes deferred」と明記する
  経路で、`Chlorine`/`Caustic Soda` は既に Deacon 法・causticization 法で生産できている。`electrolyticIndustry` が
  存在するようになった後でも、既存の2つの Good に**第三の供給経路**を追加することは、既存の生産量やバランスを変えず
  実益が薄いため、具体的な次タスクとして計画されるまで着手しない。
- 水力発電。`electric-power-and-telegraph.md` §7 決定事項6を継承し、`PowerStation`（延いては `Market.electricityStock`）
  は石炭専焼のみのまま変更しない。
- `MarketOverviewDialog` などの UI 表示。既存の `Sulfuric Acid`/`Steel`/`Copper Wire` と同じく、市場在庫パネルへの
  自動反映に任せ、専用の表示コンポーネントは追加しない。
- `good-unknown` に代わる専用 SVG アイコンの新規作成。`Steel`/`Chlorine`/`Synthetic Ammonia` と同じ扱いとし、
  フォローアップ課題として記録するに留める。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| era 6 の技術グラフの2つの独立枝の終端 | 化学枝: `chemicalIndustryFoundation` → `industrialSulfuricAcid` → (`phosphateFertilizer` / `modernSteelmaking` → `highPressureChemicalApparatus` → `catalyticChemistry` → `syntheticAmmonia`/`Chlorine`)。電化枝: `electricalExperiments` → `practicalElectrochemistry` → (`electricTelegraph` / `generatorAndMotor` → `powerGrid`)。両枝の合流点は存在しない。 | [technologyDefinitions.ts:609-814](../../src/generators/technologyDefinitions.ts#L609-L814) |
| `Market.electricityStock` の唯一の消費者 | 存在しない。`PowerGridInvestment.settleAnnual()` が値を書き込むだけで、読み取って生産を制約する経路は未実装。 | [technologyProgress.ts:991-1016](../../src/generators/technologyProgress.ts#L991-L1016)（signals へのコピーのみ）、`powerGridInvestment.ts` 全体 |
| `chemicalEngineering` ドメインの既存の写像先 | roadmap の「化学工学」という知識ドメインは専用シグナルを持たず、`highPressureChemicalApparatus`（高圧化学装置）ノード自体がそのプロキシとして再利用されている。`catalyticChemistry` が `highPressureChemicalApparatus` 単独を前提とするのがその先例。 | [technologyDefinitions.ts:680-709](../../src/generators/technologyDefinitions.ts#L680-L709) |
| 「一つの Good・容量サービス外部制約で生産が減る」先例 | 存在しない。`SteelConverterPlant`/`ChlorinePlant`/`PowerStation` はいずれも Good 在庫（`consumeNamed`）だけで utilization を決めており、`Market` の容量サービス系フィールド（`electricityStock`）を読む資本設備は本書が最初。 | [steelConverters.ts](../../src/extensions/economy/generators/steelConverters.ts)、[chlorinePlants.ts](../../src/extensions/economy/generators/chlorinePlants.ts)、[powerStations.ts](../../src/extensions/economy/generators/powerStations.ts) |
| 「Good が資本設備からのみ生産され、職人レシピを持たない」先例 | `Synthetic Ammonia` は `recipes` フィールドを持たず、`SyntheticAmmoniaPlants` のみが供給する。電解還元も史実上、産業革命以前の手工業には存在しないプロセスであるため、`Aluminum` も同じ「資本設備のみ」パターンを踏襲する。 | [goods-generator.ts:2828-2838](../../src/extensions/economy/generators/goods-generator.ts#L2828-L2838) |
| 鉱物 Good 新設の先例（district → mine → market） | `Phosphate Rock` が `MineralDistrictType: "phosphorite"`、`GeologicalProvinceKind: "basin"` を使い、`DISTRICT_PROFILES`/`PROFILE_PRIORITY`/`baseAnnualCapacity` にエントリを追加するだけで `MineOperations.produceMonth()` 側の変更なしに自動供給される。 | [mineralResources.ts:69-100, 474-499](../../src/extensions/economy/generators/mineralResources.ts#L69-L100) |
| State資本設備のテンプレート（`ChemistryTrial` 非経由） | `SteelConverterPlant`（`burgId`/`stateId`/`role`/`active`/`utilization`/`documentedRuns`/`lastFundedYear`/`lastFailureReason`、化学ドメイン外のため `ChemistryTrial` を経由しない）。`chemMedCommon.ts` の `consumeNamed`/`addNamedStock`/`debitTreasury`/`marketIdForBurg`/`pickSponsorBurg` がそのまま再利用できる。 | [steelConverterTypes.ts](../../src/extensions/economy/generators/steelConverterTypes.ts)、[steelConverters.ts](../../src/extensions/economy/generators/steelConverters.ts) |
| Good 新設時のセーブ互換性 | `migrateXGoods()`（`migratePhosphateGoods`/`migrateElectricalGoods`/`migrateSyntheticAmmoniaGoods` など）が `index.tsx` の2箇所（生成時・ロード時）から呼ばれる、`GOOD_NAMES` 定数 + 追記のみの共通形。**注**: 直近の `Steel`/`Chlorine`/`Soda Ash`/`Caustic Soda`/`Firebrick`/`Nitric Acid` の追加はこのマイグレーション関数を持たない — 既存の欠落であり本書のスコープ外だが、本書自身の新規 Good は正しくこのパターンに従う。 | [goods-generator.ts:3458-3532](../../src/extensions/economy/generators/goods-generator.ts#L3458-L3532)、[index.tsx:2468-2470, 3175-3177](../../src/extensions/economy/index.tsx#L2468-L2470) |
| `extensionStateSlices.ts` の配列登録 | `validateEconomySlice()` に `"steelConverterPlants"`/`"powerStations"`/`"telegraphLines"` は登録済みだが、**`"chlorinePlants"` は登録されていない**（既存の欠落、本書のスコープ外）。本書の新規配列 `"electrolysisPlants"` は正しく登録する。 | [extensionStateSlices.ts:437-441](../../src/runtime/extensionStateSlices.ts#L437-L441) |
| era 6 State資本設備の呼び出し順序 | `index.tsx` の生産ブロック: `ExperimentalWorkshops` → `AcidPlants` → `PhosphateFertilizerPlants` → `ChlorinePlants` → `SteelConverters` → `SyntheticAmmoniaPlants` → `PowerStations` → `TelegraphLines`。`PowerGridInvestment`（投資ブロック、生産ブロックより前）が同じ年内に `Market.electricityStock` を更新済みのため、生産ブロック内のどの位置でも当年の値を読める。 | [index.tsx:2963-2987](../../src/extensions/economy/index.tsx#L2963-L2987) |

結論として、State資本設備・鉱物 district・Good カタログという3層はすべて `SteelConverterPlant`/`Phosphate Rock`/`Synthetic Ammonia` の3つの先例からそのまま複製できる。本書で実質的に新しいのは「① `ElectrolysisPlant.utilization` が Good 在庫だけでなく `Market.electricityStock` にも制約される、②電解精錬という産業革命以前に存在しないプロセスとして `Aluminum` が職人レシピを持たない」の2点に限定される。

## 3. 設計

### 3.1 概念モデル

```text
既存の電化枝（powerGrid まで実装済み）:
  electricalExperiments → practicalElectrochemistry → generatorAndMotor → powerGrid
                                    │
既存の化学枝（catalyticChemistry まで実装済み）:                │
  chemicalIndustryFoundation → industrialSulfuricAcid           │
    → modernSteelmaking → highPressureChemicalApparatus         │
        → catalyticChemistry                                    │
                                                                  │
本書が追加する合流ノード（3前提すべての adopted を要求）:         │
  practicalElectrochemistry ───────────────────────────────────┤
  highPressureChemicalApparatus（chemicalEngineering の代理） ──┤
  powerGrid（安定した電力網） ────────────────────────────────┘
        │
        ▼
  electrolyticIndustry（新規）
    ElectrolysisPlants（新規、State資本設備）
      Bauxite（新規鉱物 Good、鉱山供給）
        → Alumina（新規、職人レシピ: Bauxite + Caustic Soda + Coal, requiredTechnology: chemicalIndustryFoundation）
          → Aluminum（新規、requiredTechnology: electrolyticIndustry、ElectrolysisPlants のみが供給）
            制約: Alumina/Coke/Firebrick 在庫  ×  Market.electricityStock カバレッジ
    → electrolysisPlantTrialYears / electrolysisPlantInstallations
```

`Alumina` はアルカリ化学（Caustic Soda、`chemicalIndustryFoundation` の既存出口）と熱源（Coal）だけで作れるボーキサイト
精製（バイヤー法）であり、電解を必要としない — roadmap §9.4 の「Bauxite + アルカリ化学 + 熱 → Alumina」のとおり。電解を
必要とするのは `Alumina + 氷晶石・炭素電極 + 大量かつ安定した Electricity → Aluminum` の最終段だけであり、これを
`ElectrolysisPlant` が体現する。「炭素電極」は `Coke`（既存 Good、電解精錬でも実際に炭素陽極として使われる）、
「氷晶石・耐食容器」は `Firebrick`（既存 Good、AcidPlants/SteelConverters/ChlorinePlants/PowerStations が炉・反応槽の
内張りとして共通利用している、この経済系の一般的な「炉・槽の消耗品」プロキシ）で代替する。新しい Good は追加しない
— `modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項4 の「既存シグナル・既存 Good で代用する」判断を
踏襲する。

### 3.2 新規鉱物: `Bauxite`

`mineralResourcesTypes.ts` の `FUEL_MINERAL_COMMODITIES` に `"bauxite"` を追加する（コメントの「fuel でなくても
このバケツに入る」という既存の注記どおり — 命名は歴史的経緯であり、Phosphate Rock と同じ扱い）:

```ts
export const FUEL_MINERAL_COMMODITIES = ["coal", "saltpeter", "sulfur", "phosphate rock", "bauxite"] as const;
```

`mineralResourcesTypes.ts` の `MineralDistrictType` に `"laterite"` を追加する。`mineralResources.ts` の
`DISTRICT_PROFILES`/`PROFILE_PRIORITY`/`baseAnnualCapacity` に1行ずつ追加する（`phosphorite`/`basin` の直接の
複製で、新しい `GeologicalProvinceKind` は追加しない — ボーキサイトは楯状地の風化殻に生成されるため、既存の
`"shield"` province を再利用する。`bandedIron`/`lodeGold` も同じ province を使う）:

```ts
// mineralResources.ts DISTRICT_PROFILES
{ type: "laterite", provinces: ["shield"], primary: "bauxite", commodities: ["bauxite"] }

// PROFILE_PRIORITY: phosphorite の直後に追加

// createYield() baseAnnualCapacity
bauxite: 120 // calibration TBD — 塊状の低品位鉱石、Iron(180)より少なくPhosphate Rock(140)よりやや少ない
```

`getMinedGoodName("bauxite")` は非 `OreCommodity` のため `"bauxite"` をそのまま返し（`Phosphate Rock` と同じ経路）、
`MineOperations.produceMonth()` が既存ロジックのまま `isGoodEnabled` を満たせば自動的に市場供給する。追加のコード
変更は不要。

`goods-generator.ts` に `Bauxite` Good を `Phosphate Rock` の直後へ追加する（`Phosphate Rock` と同型 — 鉱山供給のみ、
`chance: 0`、`requiredTechnology` なし、`demandCoverage: {}`）:

```ts
{
  // Raw bauxite ore. Cell placement comes from MineralDeposit/MineOperation ("laterite" districts
  // on "shield" provinces, mineralResources.ts), same convention as Phosphate Rock. See
  // docs/plan/electrolytic-industry-vertical-slice.md §3.2.
  name: "Bauxite",
  warEconomyType: "strategic",
  tags: ["mineral", "industrial"],
  icon: "good-stone",
  color: "#a8826a",
  value: 5,
  chance: 0,
  unit: "wain",
  demandCoverage: {}
}
```

### 3.3 新規 Good: `Alumina`

`goods-generator.ts` に、`Bauxite` の直後へ追加する（職人レシピのみ、`chemicalIndustryFoundation` の既存出口 —
`Coal Tar`/`Soda Ash`/`Caustic Soda` と同型）:

```ts
{
  // Bayer-process alumina refining: Bauxite digested with an alkali (Caustic Soda) and heat
  // yields alumina, the feedstock for electrolytic reduction below. No electricity required at
  // this stage — see docs/plan/technology-development-roadmap.md §9.4 ("Bauxite + アルカリ化学
  // + 熱 → Alumina"). See docs/plan/electrolytic-industry-vertical-slice.md §3.3.
  name: "Alumina",
  warEconomyType: "strategic",
  tags: ["industrial", "mineral"],
  icon: "good-unknown",
  color: "#e8e4dc",
  value: 16,
  chance: 0,
  recipes: [{ Bauxite: 1, "Caustic Soda": 0.3, Coal: 0.2 }],
  unit: "sack",
  demandCoverage: {},
  requiredTechnology: "chemicalIndustryFoundation"
}
```

craft-worker の生産経路（production-generator.ts の worker loop）は `recipes` フィールドだけで自動的に有効になる
— `Soda Ash`/`Caustic Soda` が追加時に production-generator.ts 側の変更を必要としなかったのと同じ、完全にデータ
駆動のパターン。

### 3.4 新規 Good: `Aluminum`

`goods-generator.ts` に `Alumina` の直後へ追加する。`Synthetic Ammonia` と同じく `recipes` を持たない — 電解還元は
産業革命以前の職人技法に存在しないプロセスであるため、`ElectrolysisPlants`（§3.6）だけが供給する:

```ts
{
  // Electrolytically reduced from Alumina — no craft-worker recipe exists (unlike Steel/
  // Sulfuric Acid/Chlorine's dual-route pattern): electrolytic reduction has no pre-industrial
  // artisanal equivalent, same reasoning as Synthetic Ammonia's capital-only supply. Value set
  // high, reflecting aluminum's real 19th-century cost before Hall-Héroult mass production (once
  // priced above silver). See docs/plan/electrolytic-industry-vertical-slice.md §3.4.
  name: "Aluminum",
  warEconomyType: "strategic",
  tags: ["metal", "industrial"],
  icon: "good-unknown",
  color: "#c7c9cc",
  value: 34,
  chance: 0,
  unit: "bar",
  demandCoverage: {},
  requiredTechnology: "electrolyticIndustry"
}
```

### 3.5 新規シグナル

`technologyTypes.ts` の `TechnologySignals` に2フィールド追加（`modernSteelmakingTrialYears`/`Installations`,
`powerStationTrialYears`/`Installations` と同型）:

```ts
/** ElectrolysisPlant.documentedRuns の州内最大値。modernSteelmakingTrialYears/powerStationTrialYears と同型。 */
electrolysisPlantTrialYears: number;
/** active な ElectrolysisPlant の件数。modernSteelmakingInstallations/powerStationInstallations と同型。 */
electrolysisPlantInstallations: number;
```

`technologyProgress.ts` の初期化ブロックに2フィールドとも `0` で追加し、`modernSteelmaking`/`powerStations` の集計
ブロック（[technologyProgress.ts:878-909](../../src/generators/technologyProgress.ts#L878-L909)）と全く同型のループを
`economy.electrolysisPlants` に対して1つ追加する。`COUNT_SIGNAL_KEYS` にも両方追加する。

`bauxiteAccess` のような市場在庫カバレッジ信号は追加しない — `electrolyticIndustry` 自体は「電解という産業能力を
持つか」を表し、原料の地理的偏在は `ElectrolysisPlant.utilization`（§3.6、Bauxite/Alumina 由来の市場在庫が乏しければ
自然に低下する）を通じて `electrolysisPlantTrialYears`/`Installations` の伸びを間接的に抑制する。これは
`generatorAndMotor` が `copperWireAccess`（発電機本体への直接投入材）を明示的にゲートに使う一方、その先の消費財
（`Aluminum` の川上である `Bauxite`）までは遡らない、という既存の書き分けと整合する。

### 3.6 技術ノード: `electrolyticIndustry`

`technologyDefinitions.ts` の `ERA_6` 配列、`powerGrid` の直後（配列末尾）に追加する:

```ts
// docs/plan/electrolytic-industry-vertical-slice.md §3.6. Three prerequisites converge here —
// practicalElectrochemistry (electrochemistry), highPressureChemicalApparatus (the existing
// chemicalEngineering proxy catalyticChemistry already reuses), and powerGrid (a stable
// electricity network) — matching roadmap §9.3 L289's three-item prerequisite list exactly.
// prerequisitesMet() requires all three adopted, so every threshold below is set above the
// highest of their own adopted thresholds (powerGrid's administration 0.68/treasury 500/
// electricityCoverage 0.35 dominate) to avoid an automatic pass-through the instant the last
// prerequisite adopts.
{
  id: "electrolyticIndustry",
  label: "Electrolytic industry",
  era: 6,
  scope: "state",
  prerequisites: ["practicalElectrochemistry", "highPressureChemicalApparatus", "powerGrid"],
  known: { min: { electricityCoverage: 0.4, administration: 0.7, treasury: 550 } },
  demonstrated: { min: { electrolysisPlantTrialYears: 2, electricityCoverage: 0.45, treasury: 650 } },
  adopted: { min: { electrolysisPlantInstallations: 1, administration: 0.75, treasury: 800 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`ElectrolysisPlants.settleAnnual()`（§3.7）は他の全 State資本設備と同じく、State の `electrolyticIndustry` が
`known` 以上に達した時点でプラントを持てる（`known` に到達するまでは `electrolysisPlantTrialYears`/`Installations`
はゼロのままなので、`demonstrated`/`adopted` は自動的に `known` の後にしか進まない — `modernSteelmaking`/
`generatorAndMotor` と同じブートストラップ順序）。

### 3.7 State資本設備: `ElectrolysisPlants`

新規型ファイル `electrolysisTypes.ts`（`steelConverterTypes.ts` と同型 — 電解冶金ドメインであり `ChemistryTrial` を
経由しない、`modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項2 と同じ理由）:

```ts
/**
 * Electrolytic reduction plants — the sole supply route for the Aluminum Good.
 * Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7. Same minimal shape as
 * SteelConverterPlant/PowerStation — no ChemistryTrial indirection.
 */

export type ElectrolysisFailureReason = "materialShortage" | "powerShortage" | "fundingCut";

export interface ElectrolysisPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: ElectrolysisFailureReason;
}
```

`chemMedCommon.ts` に定数追加（4つの既存 budget の最高額、`SYNTHETIC_AMMONIA_PLANT_BUDGET(40)` より上に配置）:

```ts
/**
 * calibration TBD — the highest State capital budget in the economy: electrolytic reduction is
 * both the most electricity-intensive and (historically) most capital-intensive process in the
 * chemistry/metallurgy chain, above even SYNTHETIC_AMMONIA_PLANT_BUDGET(40).
 * See docs/plan/electrolytic-industry-vertical-slice.md §3.7.
 */
export const ELECTROLYSIS_PLANT_BUDGET = 42;
```

新規モジュール `electrolysisPlants.ts`（`steelConverters.ts` と同型構造。決定的な違いは Alumina/Coke/Firebrick の
在庫制約に加えて `Market.electricityStock` カバレッジで utilization を追加制約する点のみ）:

```ts
export class ElectrolysisPlantsModule {
  settleAnnual(): boolean {
    // steelConverters.ts と同型:
    // 1. 年次自己ゲート（getElectrolysisPlantsLastSettledYear）
    // 2. electrolyticIndustry が "known" 以上の State だけがプラントを持てる
    // 3. plant新設/継続ごとに ELECTROLYSIS_PLANT_BUDGET を debitTreasury
    // 4. Alumina 2 / Coke 0.4 / Firebrick 0.3 を consumeNamed で消費し materialCoverage を求める
    //    (Alumina:Aluminum 実質量比 ~2:1 という史実比を反映。calibration TBD)
    // 5. 新規: marketId の Market.electricityStock を読み、powerCoverage = clamp01(...) とする。
    //    coverage = min(materialCoverage, powerCoverage)。
    //    powerCoverage < materialCoverage なら lastFailureReason = "powerShortage"、
    //    そうでなく utilization < 0.5 なら "materialShortage"（steelConverters.ts と同型の分岐）。
    // 6. utilization >= 0.5 の年だけ documentedRuns += 1、
    //    addNamedStock(marketId, "Aluminum", role === "trial" ? 0.1 : 0.4)
    //    （Chlorine の 0.15/0.6 よりやや少ない量 — Aluminum は高価値・低嵩の金属という位置づけ）
    // 7. adoptedに達したらroleを"trial"→"service"に昇格
  }
}
export const ElectrolysisPlants = new ElectrolysisPlantsModule();
```

`Market.electricityStock` の読み取りは `getMarkets()`（`economyContext.ts`、既存 export）から `marketId` で1件
検索するだけで、新しいヘルパーを `chemMedCommon.ts` に追加する必要はない（`PowerStation`/`TelegraphLine` はこの値を
書き込むだけで読まないため、既存の共通ヘルパーには読み取り関数が存在しなかった）。

`economyContext.ts` にスライスアクセサを追加する（`getSteelConverterPlants`/`setSteelConverterPlants`/
`getSteelConverterPlantsLastSettledYear`/`setSteelConverterPlantsLastSettledYear` と同型）: `getElectrolysisPlants`/
`setElectrolysisPlants`/`getElectrolysisPlantsLastSettledYear`/`setElectrolysisPlantsLastSettledYear`。
`_electrolysisPlantsLastSettledYearFallback` フォールバック変数と、モジュールリセット処理にも追加する。
`extensionStateSlices.ts` の `validateEconomySlice()` 配列フィールド一覧に `"electrolysisPlants"` を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、生産ブロックの末尾、`TelegraphLines.settleAnnual()` の直後）:

```ts
PowerStations.settleAnnual();
TelegraphLines.settleAnnual();
// Reads this year's Market.electricityStock, already written by PowerGridInvestment earlier in
// this same annual tick (investment block runs before the production block — see the call-order
// comment there). Alumina/Coke/Firebrick consumption is independent of the other era-6 plants
// above. docs/plan/electrolytic-industry-vertical-slice.md §3.7.
ElectrolysisPlants.settleAnnual();
```

### 3.8 セーブ互換性

`ELECTROLYTIC_GOOD_NAMES = ["Bauxite", "Alumina", "Aluminum"] as const` を `goods-generator.ts` に追加し、
`migrateElectricalGoods()`（[goods-generator.ts:3496-3532](../../src/extensions/economy/generators/goods-generator.ts#L3496-L3532)）
と同型の `migrateElectrolyticIndustryGoods()` を実装する。`index.tsx` の両方の呼び出し箇所（生成時・ロード時）に
`migrateElectricalGoods()` の直後で追加する。

新規配列 `electrolysisPlants` は §3.7 のとおり `extensionStateSlices.ts` へ登録する。

## 4. Phase分割

- **Phase 1 — 鉱物・シグナル・技術ノード**: §3.2（Bauxite 鉱物）＋ §3.5（2シグナル）＋ §3.6（`electrolyticIndustry`）。
  `ElectrolysisPlant` 配列が空のまま `electrolysisPlantTrialYears`/`Installations` は 0 に留まり、ノードは `known`
  までしか進めない状態。
- **Phase 2 — `Alumina`/`Aluminum` と `ElectrolysisPlants`**: §3.3・§3.4（Good）＋ §3.7（State資本設備）。
  `electrolyticIndustry` が `demonstrated`/`adopted` まで到達可能になり、`Aluminum` が初めて市場在庫として生まれる。
- **Phase 3 — セーブ互換性の仕上げ**: §3.8 の migration 関数と `extensionStateSlices.ts` 登録。Phase 1〜2 と並行して
  都度追加するのが自然だが、既存セーブでの動作確認は全 Phase 完了後にまとめて行う。

本書は実装を1コミットにまとめる — Phase 分割は電気・電信スライスと同じ記述形式を踏襲したレビュー単位であり、
複数 PR に分割する意図はない。

## 5. テスト計画

- `electrolysisPlants.test.ts`（新規、`steelConverters.test.ts` と同じ形 + 2ケース追加）: `electrolyticIndustry`
  が未 `known` の州はプラントを持たないこと、Alumina/Coke/Firebrick 不足で `utilization` が下がり `documentedRuns`
  が増えないこと（`lastFailureReason: "materialShortage"`）、**`Market.electricityStock` が低い場合に
  `lastFailureReason: "powerShortage"` となり、材料が潤沢でも utilization が電力カバレッジで頭打ちになること**
  （新規ケース）、`adopted` 昇格で `role` が `service` になること、年次自己ゲート、`Aluminum` 市場在庫への出力量。
- `technologyProgress.test.ts`: `electrolyticIndustry` の era・prerequisites・閾値キーの静的チェック。
  `practicalElectrochemistry`/`highPressureChemicalApparatus`/`powerGrid` のいずれか1つでも adopted していない
  状態では一切進行しないこと（`syntheticAmmonia`/`generatorAndMotor` 実装時と同じ形の統合テスト）。
  `electrolysisPlantTrialYears`/`electrolysisPlantInstallations` が `economy.electrolysisPlants` フィクスチャから
  正しく集計されること。
- `goods-generator.test.ts`: `Bauxite`/`Alumina`/`Aluminum` が `GOODS_DATA` に存在し、`Aluminum` が `recipes` を
  持たないこと（`Synthetic Ammonia` と同型の契約）、`migrateElectrolyticIndustryGoods()` が旧セーブへ既存 id を
  壊さず追加すること。
- `mineralResources.test.ts`（既存があれば追加、なければ省略可）: `laterite` district が `shield` province にのみ
  生成されること、`bauxite` commodity が `MINE_SUPPLIED_GOOD_NAMES` に含まれること。

## 6. 受け入れ条件

- `practicalElectrochemistry`/`highPressureChemicalApparatus`/`powerGrid` のいずれかが世界のどこにも `adopted`
  していない状態では `electrolyticIndustry` は `known` にすら進まない。
- `electrolyticIndustry` が `adopted` になっただけでは `Aluminum` の市場在庫は変化しない。実際に `ElectrolysisPlant`
  が稼働し、Alumina/Coke/Firebrick を消費し、かつ `Market.electricityStock` が十分でなければ `utilization` は
  0.5 を下回り出力されない。
- `Market.electricityStock` が低い State では、Alumina/Coke/Firebrick 在庫が十分でも `ElectrolysisPlant` の
  utilization は電力カバレッジで頭打ちになる（`lastFailureReason: "powerShortage"`）— roadmap §9.4 の「電力不足で
  停止・減産する」という要求を満たす。
- `Aluminum` は `recipes` を持たない — 電解還元に職人レシピの供給経路は存在しない。
- `Alumina` は `chemicalIndustryFoundation` が世界のどこにも存在しない状態では生産されない（既存の
  `requiredTechnology` ゲート機構をそのまま利用）。
- `Bauxite` は `Phosphate Rock` と同じ「鉱山供給のみ」パターンで、鉱山生成ロジックへの追加変更なしに自動供給される。
- 既存セーブ（`Bauxite`/`Alumina`/`Aluminum` を持たない旧カタログ、`electrolysisPlants` 配列を持たない旧セーブ）を
  ロードしても、既存 Good の id がずれず、新規配列が空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 7. 決定事項 / Open Questions

1. **「電解アルミニウム」を独立ノードとして新設しない**。roadmap のノード表が挙げる「電解アルミニウム」の前提
   （電解工業、電力網、炭素電極、氷晶石）は `electrolyticIndustry` 自身の前提・実装（`powerGrid` 込み、Coke/Firebrick
   による炭素電極・耐食容器の代替）と実質的に重複するため、`electrolyticIndustry` の `requiredTechnology` を
   `Aluminum` Good に直接設定する1ノード構成とする。
2. **`Aluminum` は職人レシピを持たない**。`Synthetic Ammonia` の前例と同じ理由 — 電解還元は産業革命以前の手工業に
   存在しないプロセスである。
3. **`ElectrolysisPlant` は `ChemistryTrial` を経由しない**（`SteelConverterPlant`/`PowerStation` 型）。電解冶金
   ドメインであり、`modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項2 と同じ理由でこの特例を踏襲する。
4. **`Market.electricityStock` を読むが、新しい共通ヘルパーは `chemMedCommon.ts` に追加しない**。読み取り専用の
   1箇所限定の利用であり、`electrolysisPlants.ts` 内にインライン実装する。将来2つ目の電力消費産業が追加された
   時点で共通化を検討する。
5. **塩素アルカリ電解を実装しない**。`Chlorine`/`Caustic Soda` は既に別経路（Deacon 法・causticization）で生産
   できており、電解工業の実装後に第三の供給経路を追加する実益は薄い。`goods-generator.ts` のコメントが指す
   「chlor-alkali electrolysis の設計メモ」は、具体的な次タスクとして計画されるまで着手しない。
6. **`bauxiteAccess` のような市場在庫カバレッジ信号を `electrolyticIndustry` の閾値に追加しない**。原料偏在は
   `ElectrolysisPlant.utilization`（ひいては `electrolysisPlantTrialYears`/`Installations`）を通じて間接的に
   ノードの進行を抑制する、というより単純な因果関係に留める。
7. **新しい `GeologicalProvinceKind` を追加しない**。`Bauxite` の `laterite` district は既存の `"shield"` province
   を再利用する — `phosphorite` が新しい province を追加せず既存の `"basin"` を再利用したのと同じ判断。

## 8. 関連ドキュメント

- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.3（L279-291）, §9.4（L293-310） —
  本書が具体化する一次資料
- [electric-power-and-telegraph.md](./electric-power-and-telegraph.md) — `Market.electricityStock`/`PowerGridInvestment`
  の直接のテンプレート。§1 非目的が電解工業を本書へ委譲した先例
- [modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md) —
  `SteelConverterPlant`（`ChemistryTrial` を経由しない例外）の直接のテンプレート、`chemicalEngineering` ドメインを
  `highPressureChemicalApparatus` で代理させる判断の初出
- [phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md) — 鉱物 district（`Phosphate Rock`）
  新設の直接のテンプレート
- [chemistry-medicine-knowledge-accumulation.md](./chemistry-medicine-knowledge-accumulation.md) — `chemMedCommon.ts`
  の設計元
