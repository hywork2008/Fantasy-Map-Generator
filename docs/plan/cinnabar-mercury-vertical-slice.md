# 辰砂・水銀チェーンの縦切り実装計画 (Cinnabar → Mercury Vertical Slice)

## 状態

**実装済み（2026-08-20）**。[technology-development-roadmap.md](./technology-development-roadmap.md) §9.5（L318-329）
と実装順序 Phase 6（L461-466、決定事項10・L512）を対象に、`cinnabarRoastingAndMercuryRecovery` という単一の
`TechnologyDefinition` と、その「効果」欄が明示する `Cinnabar`（鉱石 Good）→ `Mercury`（精製 Good、`MercuryPlants` の
み供給）を実装する。[electrolytic-industry-vertical-slice.md](./electrolytic-industry-vertical-slice.md) §1 非目的が
「roadmap §9.5 の水銀・辰砂チェーン。電解工業とは独立した鉱物・毒性チェーンであり、本書と技術的依存関係を持たない」
と明示的に切り離した対象が本書である。

## 1. 目的と非目的

### 目的

- roadmap §9.5 の「辰砂焙焼と水銀回収」行を `TechnologyDefinition`（id: `cinnabarRoastingAndMercuryRecovery`）として
  実装する。前提（mining・smelting・chemistry）を、chemistry は既存の `chemicalIndustryFoundation`（§9.1 の化学工業
  基礎、prerequisites に指定）、mining・smelting は era-0 から使える既存シグナル（`mineCount`/`metallurgy`）で表現する
  — 新しい「採鉱技術」「製錬技術」ノードは追加しない。
- `Cinnabar`（新規鉱物 Good、鉱山供給）→ `Mercury`（新規 Good、`MercuryPlants` という State資本設備のみが供給）を
  実装する。roadmap の「少量生産」という記述どおり、既存の四大プラント（Acid/PhosphateFertilizer/Synthetic
  Ammonia/Electrolysis）より一桁小さい消費・産出量にする。
- roadmap §15 決定事項10「辰砂と水銀は…必ず健康・環境負債を伴わせる」を、`MercuryPlant.contamination`
  （roadmap本文が名指す `MercuryContaminationStock` の実体）として実装する。運転する年ごとに必ず蓄積し、閾値を
  超えると強制的にその年の産出を停止させ、清掃費用（Treasury debit）を払わない限り蓄積が減らない — 「回避すれば
  進歩できる」形にせず、「産出には必ず対価が伴う」形にする。

### 非目的（本書の範囲外）

- roadmap §9.5 の残り3行（「錬金術・分析化学」「貴金属アマルガム」「精密計測・電気機器」）を独立した
  `TechnologyDefinition` として新設すること。「錬金術・分析化学」（laboratoryTechnique・chemistry・Academy
  Knowledge → 試薬・蒸留・分析の実験候補を増やす）は、era 4 に既存の `analyticalChemistry` ノードが同じ効果
  （`experimentRecord`/`labVesselQuality` を介した実験候補の蓄積）をすでに担っているため、新設せず流用する。
  「貴金属アマルガム」（Gold/Silver 回収の改善）と「精密計測・電気機器」（圧力・温度計測器、限られた電気部品）は
  `Mercury` Good の未実装の消費先であり、`electrolytic-industry-vertical-slice.md` §1 が「軽量構造材・導体」
  （Aluminum の未実装の消費先）を「具体的な次タスクが決まった時点で別の縦切りに委ねる」としたのと同じ判断を
  踏襲する — `Aluminum`/`Synthetic Ammonia` も現状は市場在庫として蓄積されるだけで消費先を持たない、この経済系の
  確立された「末端産業 Good」パターン。
- `burg.sanitation` や `characterHealth.ts` の疾病モデルへの接続。`burg.sanitation` は
  `urbanWaterSystem.ts:1608`（`sanitationScoreFromSystem(system)`）が年次で無条件に上書きする値であり、他モジュール
  から外部書き込みしても同年内に上書きされ効果を持たない。`characterHealth.ts` の疾病モデルは公衆衛生（sanitation）
  駆動の感染症であり、水銀曝露という職業性・慢性の負債とは性質が異なる。健康・環境負債は
  `MercuryPlant.contamination` という、それ自体が生産を制約する自己完結した状態として実装し、既存の衛生シミュレー
  ションとは接続しない（§7 決定事項2）。
- `MercuryContaminationStock` を `TechnologySignals` の新規シグナルとして公開すること。他のどのノードもまだ
  水銀汚染に反応する必要がないため、[speculative design を避ける] という既存の判断パターンに従い、実際に読み取る
  消費先が決まるまで `MercuryPlant.contamination` は経済状態としてのみ存在させる。
- 塩素アルカリ・電解工業と同様の「二重供給経路」（craft レシピ + State資本設備）。`Mercury` は
  `Synthetic Ammonia`/`Aluminum` と同じ「資本設備のみ」パターンを踏襲する（§7 決定事項1）。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 「錬金術・分析化学」に相当する既存ノード | `analyticalChemistry`（era 4）が `laboratoryGlassware`/`experimentalNaturalPhilosophy` を前提に、`experimentRecord`/`labVesselQuality`/`naturalPhilosophy` を効果として持つ。roadmap §9.5 の「試薬・蒸留・分析の実験候補を増やす」「汎用『研究力』倍率にはしない」という記述と完全に一致する。 | [technologyDefinitions.ts:442-451](../../src/generators/technologyDefinitions.ts#L442-L451) |
| chemistry ドメインの既存の写像先 | `chemicalIndustryFoundation`（era 6）が `analyticalChemistry` を前提とし、`experimentRecord`/`sulfurAccess`/`treasury` を閾値とする。`Alumina` の `requiredTechnology` としてすでに再利用されている「化学工業の基礎」の代表ノード。 | [technologyDefinitions.ts:648-657](../../src/generators/technologyDefinitions.ts#L648-L657) |
| mining・smelting の既存シグナル | `mineCount`/`deepMineCount`/`coalMineCount`/`metallurgy`/`smelterWorkers` が era 0 から蓄積されており、`mineSurveyAndDrainage` など複数ノードがこれらを直接閾値に使っている。「採鉱技術」「製錬技術」という専用 `TechnologyDefinition` は存在しない。 | [technologyTypes.ts:40-56](../../src/generators/technologyTypes.ts#L40-L56)、[technologyDefinitions.ts:400-409](../../src/generators/technologyDefinitions.ts#L400-L409) |
| chemistry ドメインの State資本設備テンプレート | `AcidPlant`/`PhosphateFertilizerPlant` が `ChemistryTrial`（kind別）を介して `documentedRuns`/`operatingYears`/`failureCount`/`lastFailureReason` を記録する。両者とも「trial は前提が `known` になれば早期着工できるが、産出は別ノードが `demonstrated` になるまで待つ」という2段階ゲートを持つ（`worldHasFoundation()`/`worldHasIndustrialSulfuricAcid()`）。 | [acidPlants.ts](../../src/extensions/economy/generators/acidPlants.ts)、[phosphateFertilizerPlants.ts](../../src/extensions/economy/generators/phosphateFertilizerPlants.ts) |
| 未使用の `ChemistryFailureReason` | `"contamination"` が `chemistryTypes.ts` の型に存在するが、`AcidPlant`/`PhosphateFertilizerPlant`/`ChlorinePlant`/`SyntheticAmmoniaPlant` のどの実装コードからも参照されていない — 本書が初めてこの値を使う。 | [chemistryTypes.ts:14-20](../../src/extensions/economy/generators/chemistryTypes.ts#L14-L20) |
| 鉱物 district の地質区分 | `GeologicalProvinceKind` に `"volcanic"` が存在し、`classifyProvince()` が実際の火山バイオームタグ（`HeightmapModule.finalizeVolcanoes` → `biomeAssignment.ts`）から判定する。ただし火山は「本当に少ない」（`volcanicOperations.ts` のコメント「scarcity comes from how few real volcanoes exist on a given map」）ため、`DISTRICT_PROFILES` はまだ `"volcanic"` を使う district を1つも持たない。 | [mineralResourcesTypes.ts:17](../../src/extensions/economy/generators/mineralResourcesTypes.ts#L17)、[mineralResources.ts:253-274](../../src/extensions/economy/generators/mineralResources.ts#L253-L274) |
| `burg.sanitation` の書き込み元 | `urbanWaterSystem.ts` の `settleAnnual()` が `sanitationScoreFromSystem(system)` から毎年無条件に再計算・上書きする。外部モジュールからの手動デクリメントは同年内に上書きされ効果を持たない。 | [urbanWaterSystem.ts:1608](../../src/extensions/economy/generators/urbanWaterSystem.ts#L1608) |
| Good 新設時のセーブ互換性 | `migrateElectrolyticIndustryGoods()` が `GOOD_NAMES` 定数 + 追記のみの共通形。`Alumina`/`Aluminum` はいずれも `recipes` を持つ／持たないが `template?.recipes` チェックで安全に分岐する。 | [goods-generator.ts:3588-3624](../../src/extensions/economy/generators/goods-generator.ts#L3588-L3624) |

結論として、State資本設備・鉱物 district・Good カタログという3層は `AcidPlant`/`Bauxite`/`Synthetic Ammonia` の3つの
先例からそのまま複製できる。本書で実質的に新しいのは「① 未使用だった `ChemistryFailureReason: "contamination"` を
使う、②鉱物 district が単一でなく複数 province（`volcanic`・`orogen`）にまたがる、③ `analyticalChemistry` を
新規ノードなしに roadmap の1行として再利用する」の3点に限定される。

## 3. 設計

### 3.1 概念モデル

```text
既存の化学枝（chemicalIndustryFoundation まで実装済み。Alumina の前提としてすでに再利用中）:
  laboratoryGlassware ─┐
  experimentalNaturalPhilosophy ─┴─> analyticalChemistry ─> chemicalIndustryFoundation
                                                                    │
本書が追加するノード（mining/smelting は既存シグナルで表現、chemistry のみを prerequisite に取る）:
                                                                    │
  cinnabarRoastingAndMercuryRecovery（新規）
    prerequisites: [chemicalIndustryFoundation]
    known/demonstrated/adopted の閾値に mineCount・metallurgy（mining/smelting の代理）を直接使用
        │
        ▼
  MercuryPlants（新規、State資本設備、ChemistryTrial(kind="mercuryPlant") を介する — chemistry ドメイン）
    Cinnabar（新規鉱物 Good、鉱山供給。district "cinnabarVein"、province ["volcanic","orogen"]）
      → Mercury（新規、requiredTechnology: cinnabarRoastingAndMercuryRecovery、MercuryPlants のみが供給）
        制約: Cinnabar/Coal/Firebrick 在庫（他プラントの1/3〜1/6程度の少量）
        副作用: MercuryPlant.contamination が運転年ごとに必ず蓄積し、閾値超で
                その年の utilization を強制的に 0 にする（roadmap §15 決定事項10）
```

`Mercury` は `Synthetic Ammonia`/`Aluminum` と同じ「資本設備のみ」パターンを踏襲する — 密閉した retort と蒸気凝縮
機構を必要とする蒸留プロセスであり、家内制手工業のレシピには存在しない。ただし産出量そのものは他の四大プラントより
一桁小さく設定し、roadmap の「少量生産」という記述を反映する。

### 3.2 新規鉱物: `Cinnabar`

`mineralResourcesTypes.ts` の `FUEL_MINERAL_COMMODITIES` に `"cinnabar"` を追加する:

```ts
export const FUEL_MINERAL_COMMODITIES = ["coal", "saltpeter", "sulfur", "phosphate rock", "bauxite", "cinnabar"] as const;
```

`MineralDistrictType` に `"cinnabarVein"` を追加する。`mineralResources.ts` の `DISTRICT_PROFILES` に、
`laterite`（`Bauxite`）が単一 province だったのに対し、複数 province を挙げる:

```ts
// Hydrothermal cinnabar deposits form in both active-volcanic and orogenic-belt settings
// historically (Almadén/Idrija sit in tectonic uplift zones, not active volcanoes) — unlike
// laterite's single "shield" province, this profile lists two so the entire Mercury chain does
// not depend on a map actually generating a volcano (volcanicOperations.ts: real volcanoes are
// deliberately scarce). docs/plan/cinnabar-mercury-vertical-slice.md §3.2.
{ type: "cinnabarVein", provinces: ["volcanic", "orogen"], primary: "cinnabar", commodities: ["cinnabar"] }
```

`PROFILE_PRIORITY` の末尾（`"laterite"` の直後）に `"cinnabarVein"` を追加する。`createYield()` の
`baseAnnualCapacity` に追加する:

```ts
cinnabar: 5 // calibration TBD — rare hydrothermal ore, well below Sulfur(15)/Saltpeter(12)
```

`getMinedGoodName("cinnabar")` は非 `OreCommodity` のため `"cinnabar"` をそのまま返し（`Bauxite` と同じ経路）、
`MineOperations.produceMonth()` が既存ロジックのまま自動供給する。追加のコード変更は不要。

`goods-generator.ts` に `Aluminum` の直後へ追加する（`Bauxite` と同型 — 鉱山供給のみ、`chance: 0`、
`requiredTechnology` なし、`demandCoverage: {}`）。

### 3.3 新規 Good: `Mercury`

`goods-generator.ts` に `Cinnabar` の直後へ追加する。`Synthetic Ammonia`/`Aluminum` と同じく `recipes` を持たない —
`MercuryPlants`（§3.7）だけが供給する。`requiredTechnology: "cinnabarRoastingAndMercuryRecovery"`。

### 3.4 新規シグナル: `cinnabarAccess`

`technologyTypes.ts` の `TechnologySignals` に1フィールド追加（`phosphateRockAccess`/`steelAccess`/
`copperWireAccess` と同型 — 市場在庫カバレッジ、軍需アナログなし）:

```ts
/** 0..1 market-stock coverage of Cinnabar, same shape as phosphateRockAccess/steelAccess. */
cinnabarAccess: number;
```

`mercuryPlantTrialYears`/`mercuryPlantInstallations` も追加する（`acidPlantTrialYears`/`acidPlantInstallations`
と同型 — `ChemistryTrial(kind="mercuryPlant")` の documentedRuns 州内最大値 / active な `MercuryPlant` の件数）。

`mercuryContaminationPressure` のようなシグナルは追加しない（§1 非目的）。

### 3.5 技術ノード: `cinnabarRoastingAndMercuryRecovery`

`technologyDefinitions.ts` の `ERA_6` 配列、`chemicalIndustryFoundation` を prerequisite に取る他ノード
（`industrialSulfuricAcid`/`Alumina` の間接的な参照元）と並べて追加する:

```ts
// docs/plan/cinnabar-mercury-vertical-slice.md §3.5. roadmap §9.5 row 1's "mining、smelting、
// chemistry" — chemistry is chemicalIndustryFoundation (already Alumina's requiredTechnology
// proxy); mining/smelting have no dedicated TechnologyDefinition of their own anywhere in this
// graph (mineSurveyAndDrainage uses the same mineCount/metallurgy signals directly), so this node
// does the same rather than inventing new prerequisite nodes. Every threshold sits above
// chemicalIndustryFoundation's own adopted floor (experimentRecord 0.55/sulfurAccess
// 0.35/treasury 140) to avoid an automatic pass-through the instant the prerequisite adopts.
{
  id: "cinnabarRoastingAndMercuryRecovery",
  label: "Cinnabar roasting and mercury recovery",
  era: 6,
  scope: "state",
  prerequisites: ["chemicalIndustryFoundation"],
  known: { min: { cinnabarAccess: 0.15, mineCount: 1, metallurgy: 0.3, treasury: 150 } },
  demonstrated: { min: { mercuryPlantTrialYears: 2, cinnabarAccess: 0.2, metallurgy: 0.35, treasury: 180 } },
  adopted: { min: { mercuryPlantInstallations: 1, cinnabarAccess: 0.25, administration: 0.5, treasury: 220 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

### 3.6 新規型: `MercuryPlant`（`chemistryTypes.ts`）

`ChemistryTrialKind` に `"mercuryPlant"` を追加する。`AcidPlant`/`PhosphateFertilizerPlant` と同じ形に、roadmap が
名指す `MercuryContaminationStock` を実現する `contamination` フィールドを1つ追加する:

```ts
/**
 * Same shape as AcidPlant/PhosphateFertilizerPlant — cinnabar roasting is a genuinely chemical
 * process (mercury-vapor condensation), so it uses the ChemistryTrial indirection.
 * `contamination` is the "MercuryContaminationStock" roadmap §9.5 requires: an unavoidable,
 * monotonically-accumulating byproduct of every operating year (never reduced by avoiding
 * production — only partially relieved by a funded containment shutdown; see mercuryPlants.ts).
 * Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.6-3.7.
 */
export interface MercuryPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  /** 0..1 cumulative local health/environment debt. */
  contamination: number;
}
```

### 3.7 State資本設備: `MercuryPlants`

`chemMedCommon.ts` に定数追加（既存の最小予算 `APOTHECARY_BUDGET(12)` と `EXPERIMENTAL_BUDGET(16)` の間 —
少量生産の専門プラントであり、四大プラント（24〜42）より軽い）:

```ts
/** calibration TBD — lightest State capital budget in the economy: a small cinnabar-roasting
 *  retort, not a bulk chemical works. See docs/plan/cinnabar-mercury-vertical-slice.md §3.7. */
export const MERCURY_PLANT_BUDGET = 14;
```

新規モジュール `mercuryPlants.ts`（`phosphateFertilizerPlants.ts` と同型構造。決定的な違いは①消費・産出量が
一桁小さいこと、②`contamination` を追跡し閾値超過時にその年の `utilization` を強制的に 0 にすることの2点）:

```ts
export class MercuryPlantsModule {
  settleAnnual(): boolean {
    // phosphateFertilizerPlants.ts と同型:
    // 1. 年次自己ゲート（getMercuryPlantsLastSettledYear）
    // 2. cinnabarRoastingAndMercuryRecovery が "known" 以上の State だけがプラントを持てる
    // 3. plant新設/継続ごとに MERCURY_PLANT_BUDGET を debitTreasury
    // 4. Cinnabar 0.3 / Coal 0.15 / Firebrick 0.05 を consumeNamed で消費し coverage を求める
    //    （AcidPlants の 0.5/0.3/0.1 相当より一桁小さい — 少量生産）
    // 5. 新規: coverage >= 0.5 の年は必ず contamination を加算する（role が "service" なら
    //    +0.08、"trial" なら +0.048 — 産出しない年は加算しない）。
    // 6. contamination が 0.6 を超えたら「封じ込め事故」を発動: その年の utilization を強制的に
    //    0 にする（在庫がどれだけ潤沢でも、その年は完全停止扱い）。追加清掃費
    //    （MERCURY_PLANT_BUDGET * 1.5）を debitTreasury できれば contamination を 0.35 分だけ
    //    緩和する（できなければ蓄積したまま）。この清掃費が払えるかどうかに関わらず、その年の
    //    完全停止は必ず適用される — 「在庫さえあれば回避できる」形にしない。
    // 7. utilization が 0.5 以上なら通常どおり documentedRuns を進め、chemicalIndustry-
    //    Foundation が世界のどこかで demonstrated なら Mercury を産出する
    //    （role === "trial" ? 0.05 : 0.2 flask — 他プラントの半分以下の産出率）。
    //    0.5 未満なら trial.lastFailureReason を "contamination"（封じ込め事故発動時）または
    //    "materialShortage"（それ以外）に設定する。
    // 8. adoptedに達したらroleを"trial"→"service"に昇格
  }
}
export const MercuryPlants = new MercuryPlantsModule();
```

`economyContext.ts` にスライスアクセサを追加する（`getPhosphateFertilizerPlants`/`setPhosphateFertilizerPlants`/
`getPhosphateFertilizerPlantsLastSettledYear`/`setPhosphateFertilizerPlantsLastSettledYear` と同型）:
`getMercuryPlants`/`setMercuryPlants`/`getMercuryPlantsLastSettledYear`/`setMercuryPlantsLastSettledYear`。
`_mercuryPlantsLastSettledYearFallback` フォールバック変数と、モジュールリセット処理にも追加する。
`extensionStateSlices.ts` の `validateEconomySlice()` 配列フィールド一覧に `"mercuryPlants"` を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、era-6 プラントブロックの末尾、`ChlorAlkaliPlants.settleAnnual()`
の直後、`settleChemMedPracticeDecay()` の直前）:

```ts
ChlorAlkaliPlants.settleAnnual();
// Cinnabar/Coal/Firebrick only, independent of every other era-6 plant above — a small,
// deliberately minor-scale chemistry plant (§9.5's "少量生産"), not a bulk industrial process.
// docs/plan/cinnabar-mercury-vertical-slice.md §3.7.
MercuryPlants.settleAnnual();
settleChemMedPracticeDecay();
```

### 3.8 セーブ互換性

`MERCURY_CHAIN_GOOD_NAMES = ["Cinnabar", "Mercury"] as const` を `goods-generator.ts` に追加し、
`migrateMercuryChainGoods()` を実装する（`migrateElectrolyticIndustryGoods()` と同形だが、どちらの Good も
`recipes` を持たないため、ingredient-id 解決ループは不要）。`index.tsx` の両方の呼び出し箇所（生成時・ロード時）に
`migrateElectrolyticIndustryGoods()` の直後で追加する。

新規配列 `mercuryPlants` は §3.7 のとおり `extensionStateSlices.ts` へ登録する。

`src/i18n/locales/en.json`/`ja.json` の `economy.goods.names` に `"Cinnabar"`/`"Mercury"`（辰砂／水銀）を追加する。

## 4. テスト計画

- `mercuryPlants.test.ts`（新規、`phosphateFertilizerPlants.test.ts` と同じ形 + 2ケース追加）:
  `cinnabarRoastingAndMercuryRecovery` が未 `known` の州はプラントを持たないこと、Cinnabar/Coal/Firebrick 不足で
  `utilization` が下がり `documentedRuns` が増えないこと（`lastFailureReason: "materialShortage"`）、
  `chemicalIndustryFoundation` が世界のどこにも demonstrated でない間は産出しないこと、**contamination が運転年
  ごとに蓄積すること、閾値超過でその年の utilization が強制的に 0 になり `lastFailureReason: "contamination"` に
  なること、清掃費を払えれば contamination が緩和されること**（新規ケース）、`adopted` 昇格で `role` が `service`
  になること、年次自己ゲート、`Mercury` 市場在庫への出力量。
- `technologyProgress.test.ts`: `cinnabarRoastingAndMercuryRecovery` の era・prerequisites・閾値キーの静的
  チェック。`chemicalIndustryFoundation` が adopted していない状態では一切進行しないこと。
  `cinnabarAccess`/`mercuryPlantTrialYears`/`mercuryPlantInstallations` が正しく集計されること。
- `goods-generator.test.ts`: `Cinnabar`/`Mercury` が `GOODS_DATA` に存在し、`Mercury` が `recipes` を持たないこと、
  `migrateMercuryChainGoods()` が旧セーブへ既存 id を壊さず追加すること。
- `mineralResources.test.ts`: `getMinedGoodName("cinnabar")` が `"cinnabar"` を返し、
  `isMineSuppliedGoodName("Cinnabar")` が `true` になること（`Bauxite` と同じ経路）。

## 5. 受け入れ条件

- `chemicalIndustryFoundation` が世界のどこにも `adopted` していない状態では `cinnabarRoastingAndMercuryRecovery`
  は `known` にすら進まない。
- `cinnabarRoastingAndMercuryRecovery` が `adopted` になっただけでは `Mercury` の市場在庫は変化しない。実際に
  `MercuryPlant` が稼働し、Cinnabar/Coal/Firebrick を消費しなければ `utilization` は 0.5 を下回り出力されない。
- `MercuryPlant` が稼働するたび `contamination` が必ず増加する — production を避ける以外に蓄積を止める方法がない。
- `contamination` が閾値を超えると、その年の産出は強制的に停止する（`utilization` が 0 になる）。清掃費を払える
  かどうかに関わらずこの停止は適用される（払えれば `contamination` が緩和されるだけで、その年の産出量そのものへの
  猶予にはならない）。
- `Mercury` は `recipes` を持たない — 家内制手工業の供給経路は存在しない。
- `Cinnabar` は `Bauxite`/`Phosphate Rock` と同じ「鉱山供給のみ」パターンで、鉱山生成ロジックへの追加変更なしに
  自動供給される。
- 既存セーブ（`Cinnabar`/`Mercury` を持たない旧カタログ、`mercuryPlants` 配列を持たない旧セーブ）をロードしても、
  既存 Good の id がずれず、新規配列が空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・関連ユニットテストがすべて通過する。

## 6. 決定事項 / Open Questions

1. **`Mercury` は職人レシピを持たない**。`Synthetic Ammonia`/`Aluminum` と同じ「資本設備のみ」パターン — 密閉retort
   による蒸留は家内制手工業に存在しない。
2. **健康・環境負債を既存の `burg.sanitation`／`characterHealth.ts` 疾病モデルに接続しない**。前者は年次で無条件
   上書きされるため外部からの手動デクリメントが無効化される。後者は公衆衛生駆動の感染症モデルであり、職業性の
   慢性水銀曝露とは性質が異なる。`MercuryPlant.contamination` という自己完結した状態として実装し、実際に読み取る
   消費先（キャラクター疾病、都市衛生、外交など）が具体的に決まった時点で別の縦切りに委ねる。
3. **「錬金術・分析化学」を独立ノードとして新設しない**。既存の `analyticalChemistry`（era 4）が同じ効果
   （`experimentRecord`/`labVesselQuality` を介した実験候補の蓄積、「汎用研究力倍率にはしない」という制約含む）
   をすでに担っている。
4. **「貴金属アマルガム」「精密計測・電気機器」を実装しない**。`Mercury` の未実装消費先であり、`Aluminum` の
   「軽量構造材・導体」と同じ理由で次タスクに委ねる。
5. **`cinnabarVein` district は `laterite` と異なり複数 province（`volcanic`・`orogen`）を持つ**。実際の火山
   バイオームは意図的に希少（`volcanicOperations.ts`）であり、単一 province にすると水銀チェーン全体が
   「火山が生成されたマップだけの機能」になってしまうため。
6. **既存の未使用 `ChemistryFailureReason: "contamination"` を初めて使用する**。他のどのプラントにも当てはまら
   なかった値であり、本チェーンのために予約されていたと判断した。