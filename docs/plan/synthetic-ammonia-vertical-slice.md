# 合成アンモニア(ハーバー・ボッシュ法)の縦切り実装計画 (Synthetic Ammonia Vertical Slice)

## 状態

**実装済み（2026-08-20）**。[docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md)の「実装するならこの順」の4・5番目
（「合成アンモニア — 試作工場（Coke＋エネルギー＋鋼＋触媒）、少量 Synthetic Ammonia、demonstrated」
「窒素肥料工場と流通 — adopted 条件。市場在庫 → 農村施肥。State 全体倍率は禁止」）を対象とする。
era 6 の技術グラフを実際に完結させる最終ノードであり、
[phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md)（1番目）・
[modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md)（2番目）・
[catalytic-chemistry.md](./catalytic-chemistry.md)（3番目、実装済み）の直後の縦切りである。

対応する一次資料:

- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.1「合成アンモニア」のノード表（前提知識
  `chemicalEngineering`・`触媒化学`・`高圧化学装置`、資源・制度「水素源、窒素、大規模エネルギー、国家／企業資本」、結果「工業的窒素肥料と軍需原料」）
- 同 §9.2「合成アンモニアの採用条件」: `demonstrated` は限られた国家・企業の少量生産、`adopted` には肥料工場と市場・農村への流通が必要。
  農業上の利益と軍事上の利益は別の消費先・予算で評価する。
- [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) §「設計自体がまだ薄い穴」1–6: 水素源・窒素・触媒材料・
  `foodFertilizerPressure` の意味・demonstrated/adopted 分離・Steam Power 容量、という本書が解決すべき6つの未決契約。

## 1. 目的と非目的

### 目的

- `syntheticAmmonia`（era 6）を新設し、`catalyticChemistry`（実装済み、era 6 の現状の終点）の先に技術グラフを1段延ばす。
- `Synthetic Ammonia` を新しい中間 Good として追加する。史実のハーバー・ボッシュ法に対応する唯一の生産経路として、
  State資金の高圧触媒プラント（`SyntheticAmmoniaPlants`、新規）だけから生む——`Sulfuric Acid`/`Steel`/`Phosphate Fertilizer`と異なり、
  職人レシピ（経路A）は持たせない（§3.2, §7 決定事項1）。
- `Nitrogen Fertilizer` を新しい Good として追加する。`Synthetic Ammonia` を原料とする職人レシピ（経路Aのみ）で生産し、
  `NitrogenFertilizerInvestment`（新規、`FertilizerInvestment` と同型）を通じて `Market.nitrogenFertilizerStock` という
  市場ごとの飽和ストックに変換、収量へ接続する。`Phosphate Fertilizer` と同じく State全体への一括倍率にはしない。
- `Market.fertilizerStock`（`phosphateFertilizer` 由来、実装済み）から、新しい需要シグナル `fertilizerCoverageGap`
  （「施肥カバレッジ不足」）を算出し、`syntheticAmmonia` の `known` 閾値に使う——
  [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) 開設問題4「`foodFertilizerPressure` の意味 —
  リン酸肥料以降は『施肥カバレッジ不足』へ切り替える必要がある」への回答（§3.5, §7 決定事項4）。
- 水素源・窒素・触媒材料という3つの未決契約を、新しい Good やストックを増やさずに解決する（§7 決定事項1–3）。

### 非目的（本書の範囲外）

- 軍需硝酸・爆薬 Good（`Nitric Acid` 等）の新設と、農業／軍需の予算分離機構。`Synthetic Ammonia` の消費先は現時点で
  `Nitrogen Fertilizer` の職人レシピ1本のみであり、競合する消費先が存在しない以上、ロードマップ §9.2 が要求する
  「農業上の利益と軍事上の利益は別の消費先・予算で評価する」という制約は自明に満たされる。軍需硝酸は将来、実際に
  第二の消費先を足す時点で改めて設計する（[docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md)
  「実装するならこの順」6番目、`（任意）`指定と同じ扱い）。
- グアノ・チリ硝石などの前化学窒素経路、および extra-European 交易品の追加。
- `Steam Power` / `Electricity` の容量サービス化。`modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項5・
  `catalytic-chemistry.md` の非目的が既に確立した「電力網を必須前提にしない」という判断をそのまま踏襲する。
- 触媒材料（オスミウム／ウラン／鉄触媒等）の希少鉱物 Good 化。`catalytic-chemistry.md` §1 非目的が
  「`syntheticAmmonia` 側の検討事項として残す」としていたものへの回答——本書は導入しない、という結論を下す（§7 決定事項3）。
- `foodFertilizerPressure`/`lateChemistryDemandPressure` 自体の意味変更や再計算。両シグナルは既存の
  `chemicalIndustryFoundation`/`phosphateFertilizer` が使用中で校正済みのため、値・使用箇所とも変更しない。
  「施肥カバレッジ不足」は既存シグナルを再定義せず、新しいシグナル `fertilizerCoverageGap` を追加して表現する（§7 決定事項4）。
- era 帯の拡張（`TechnologyEraBand` は `0..6` のまま）。ロードマップ §9 は合成アンモニアを段階6（電化・近代化学）に
  留めており、石油化学（段階7）以降とは切り離されている。
- `good-ammonia`/`good-nitrogen-fertilizer` のような専用 SVG アイコンの新規作成。`phosphate-fertilizer-vertical-slice.md`
  §7 決定事項1と同じ扱いで既存アイコンを暫定流用し、フォローアップとして記録するに留める。
- `MarketOverviewDialog` への `nitrogenFertilizerStock` 表示。`rural-agtech-investment.md` §7・
  `phosphate-fertilizer-vertical-slice.md` §7 決定事項5と同じ扱いで保留する。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| era 6 の技術グラフの終点 | `chemicalIndustryFoundation` → `industrialSulfuricAcid` →（`phosphateFertilizer` / `modernSteelmaking` → `highPressureChemicalApparatus`）→ `catalyticChemistry` まで実装済み。後続ノードは存在しない。 | [technologyDefinitions.ts:612-709](../../src/generators/technologyDefinitions.ts#L612-L709) |
| `prerequisitesMet()` の意味論 | 前提技術は必ず `adopted` まで到達していないと、依存ノードは `known` にすら進まない。`catalyticChemistry` の前提は `highPressureChemicalApparatus` 単独であり、その前提の前提（`modernSteelmaking`/`industrialSulfuricAcid`/`chemicalIndustryFoundation`）を再掲していない。 | [technologyProgress.ts:964-966](../../src/generators/technologyProgress.ts#L964-L966)、[catalytic-chemistry.md](./catalytic-chemistry.md) §3 |
| 「一つの Good・二つの供給経路」の先例 | `Sulfuric Acid`/`Phosphate Fertilizer`/`Steel` はいずれも (a) 職人レシピ (b) State資金の資本設備（`AcidPlant`/`PhosphateFertilizerPlant`/`SteelConverterPlant`、共通形状 `burgId`/`stateId`/`role`/`active`/`utilization`/`documentedRuns`/`lastFundedYear`）の両方から生産される。 | [chemistryTypes.ts:62-81](../../src/extensions/economy/generators/chemistryTypes.ts#L62-L81)、[steelConverterTypes.ts](../../src/extensions/economy/generators/steelConverterTypes.ts) |
| State資本設備の共通ヘルパー | `chemMedCommon.ts` の `debitTreasury`/`pickSponsorBurg`/`marketIdForBurg`/`consumeNamed`/`addNamedStock` が3例（`AcidPlants`/`PhosphateFertilizerPlants`/`SteelConverters`）で共有されている。`addNamedStock` は `isGoodEnabled` を一切見ないため、出力側の requiredTechnology 状態に関わらず市場在庫へ直接足す。 | [chemMedCommon.ts](../../src/extensions/economy/generators/chemMedCommon.ts) |
| `PhosphateFertilizerPlants` の完全な先例 | 前提技術（`industrialSulfuricAcid`）が世界のどこかで `demonstrated` になるまで出力を止める `worldHasIndustrialSulfuricAcid()`、`ChemistryTrial(kind="phosphateFertilizerPlant")` 経由の試作年数トラッキング、`role: "trial"→"service"` の `adopted` 昇格、という3つの機構が完全に実装済みで、そのまま踏襲できる。 | [phosphateFertilizerPlants.ts](../../src/extensions/economy/generators/phosphateFertilizerPlants.ts) |
| より単純な「`ChemistryTrial` を介さない」先例 | `SteelConverterPlant` は冶金ドメインという理由で `ChemistryTrial` 型を使わず `documentedRuns` を自分自身に持つ（`HospitalInstallation` 型）。本書の `SyntheticAmmoniaPlant` は化学ドメインの施設のため、この例外ではなく `AcidPlant`/`PhosphateFertilizerPlant` 側（`ChemistryTrial` 経由）を踏襲する。 | [steelConverterTypes.ts:1-15](../../src/extensions/economy/generators/steelConverterTypes.ts#L1-L15) |
| 農村施肥ストックの先例 | `Market.fertilizerStock`（`agTechStock` と同型・別会計の 0..1 EWMA）→ `FertilizerInvestment.settleAnnual()`（`Markets.consumeForMarketInvestment()` で `Phosphate Fertilizer` を購入）→ `developmentPotential.ts` の `resolveFertilizerStockByCell()` → `agriculturalLandUse.ts` の `calculateYieldKgPerHectare()` に `PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX`(0.2) として乗算、という縦のパイプラインが完全に実装済み。 | [marketTypes.ts:45-52](../../src/extensions/economy/generators/marketTypes.ts#L45-L52)、[fertilizerInvestment.ts](../../src/extensions/economy/generators/fertilizerInvestment.ts)、[developmentPotential.ts:101, 354](../../src/extensions/economy/generators/developmentPotential.ts#L101)、[agriculturalLandUse.ts:90, 127, 612-629](../../src/extensions/economy/generators/agriculturalLandUse.ts#L612-L629) |
| `foodFertilizerPressure` の現在の意味 | いまも都市の食料輸入ギャップ比率（`ledger.importNeed - ledger.satisfiedImport` を `urbanNeed` で正規化した州内平均）のままで、`Market.fertilizerStock` を一切参照していない。`phosphateFertilizer` の `known` 閾値と `chemicalIndustryFoundation` 由来の `lateChemistryDemandPressure` が既にこの値で校正済み。 | [technologyProgress.ts:886-914](../../src/generators/technologyProgress.ts#L886-L914) |
| `isGoodEnabled`/`isGoodManufacturableInState` の二段階ゲート | `isGoodEnabled` は Good 自身の `requiredTechnology` が世界のどこかで `demonstrated` なら真（レシピ入力側の `requiredTechnology` は個別には再チェックされない）。`isGoodManufacturableInState` は生産する州でその Good の `requiredTechnology` が `adopted` なら真。これにより `demonstrated`＝世界のどこかで少量生産、`adopted`＝自国の工場が稼働、という roadmap §9.2 の区分が Good の二段階ゲートだけで自然に表現できる。 | [goods-generator.ts:133-139](../../src/extensions/economy/generators/goods-generator.ts#L133-L139)、[production-generator.ts:147-155](../../src/extensions/economy/generators/production-generator.ts#L147-L155) |
| `Coke` の現状 | `Coal: 1.4` の職人レシピのみ、`requiredTechnology: "coalCarbonization"`（era 4/5 相当、era 6 の時点ではほぼ全州で adopted 済み）。専用の「アクセス」シグナルは無い。 | [goods-generator.ts:2457-2468](../../src/extensions/economy/generators/goods-generator.ts#L2457-L2468) |
| セーブ互換性 | 新規 Good は `migratePhosphateGoods()` と同型の migration 関数が必要、新規配列スライスは `extensionStateSlices.ts` への登録が必要。両方とも `index.tsx` の呼び出し順序（生成時・ロード時の2箇所）にフックが既にある。 | [goods-generator.ts:3264](../../src/extensions/economy/generators/goods-generator.ts#L3264)、[index.tsx:2459-2460, 3129-3130](../../src/extensions/economy/index.tsx#L2459-L2460)、[extensionStateSlices.ts:438-439](../../src/runtime/extensionStateSlices.ts#L438-L439) |

結論として、State資本設備・農村投資・収量接続という3つの層はすべて `phosphateFertilizer` スライスで確立済みの型をそのまま複製でき、本書の実質的なスコープは「新しい Good 2つ・技術ノード1つ・シグナル3つ・プラント1つ・投資モジュール1つ」に限定できる。

## 3. 設計

### 3.1 概念モデル

```
生産経路（供給側）:

Coke（既存、coalCarbonization 由来）───┐
                                        ├─▶ SyntheticAmmoniaPlants.settleAnnual()（新規、State資金）
catalyticChemistry が known 以上 ───────┘      → Synthetic Ammonia（新規Good、プラント専用生産。職人レシピなし）
（世界のどこかで demonstrated するまで出力停止）
                                                       │
                                                       ▼
                                    Nitrogen Fertilizer（新規Good、職人レシピのみ = 経路Aのみ、
                                                          requiredTechnology="syntheticAmmonia"）
                                                       │
                                                       ▼
                        NitrogenFertilizerInvestment.settleAnnual()（新規、FertilizerInvestment と同型）
                          Market が自分の marketTreasury で Nitrogen Fertilizer を購入
                                                       │
                                                       ▼
                      Market.nitrogenFertilizerStock（新規、0..1 EWMA。fertilizerStock とは別会計）
                                                       │
                                                       ▼
      developmentPotential.ts resolveNitrogenFertilizerStockByCell()
                                                       │
                                                       ▼
    agriculturalLandUse.ts calculateYieldKgPerHectare():
      × (1 + NITROGEN_FERTILIZER_YIELD_BONUS_MAX × nitrogenFertilizerStockByCell[cellId])


需要側（technologyDefinitions.ts "syntheticAmmonia" の known 閾値を駆動）:

Market.fertilizerStock（既存、phosphateFertilizer 由来）
  → technologyProgress.ts: fertilizerCoverageGap = 1 − 州内平均 fertilizerStock（新規シグナル、§3.4）
  → syntheticAmmonia の known 閾値の一つとして使用
```

`Phosphate Fertilizer` の縦切りと違い、原料鉱物の追加は無い（`Coke` は既存）。新しい層は「Good2つ・State資本設備1つ・
市場投資1つ・収量係数1つ・需要シグナル1つ」で、`AgTechInvestment`/`FertilizerInvestment` が確立した
「既存の2本のパイプラインへ新しい入力を1つ足すだけ」という設計方針をそのまま踏襲する。

### 3.2 Good: Synthetic Ammonia / Nitrogen Fertilizer

`goods-generator.ts` の `GOODS_DATA` に追加（`Phosphate Fertilizer` の直後、値は calibration TBD）:

```ts
{
  // Haber-Bosch の高圧触媒工程には職人レシピの対応物が無い(§7 決定事項1)。Sulfuric
  // Acid/Steel/Phosphate Fertilizer と異なり、経路A(recipes)を持たない――生産は
  // SyntheticAmmoniaPlants(§3.6)経由の一本のみ。
  name: "Synthetic Ammonia",
  warEconomyType: "strategic",
  tags: ["industrial", "chemical"],
  icon: "good-unknown", // 専用スプライト未作成。§1 非目的参照
  color: "#8fb8c9",
  value: 26,
  chance: 0,
  unit: "barrel",
  demandCoverage: {},
  requiredTechnology: "syntheticAmmonia"
},
{
  // Synthetic Ammonia からの職人レシピ(経路Aのみ)。Ammonia合成そのものと違い、肥料への
  // 配合・造粒は既存の worker-loop 生産で十分に表現できる(§7 決定事項5)。
  // 世帯消費 Good にしない契約: Phosphate Fertilizer と同じ(steam-industrial-goods-and-
  // technology-chain.md:125)。
  name: "Nitrogen Fertilizer",
  warEconomyType: "strategic",
  tags: ["industrial", "agriculture"],
  icon: "good-salt", // 専用スプライト未作成。§1 非目的参照
  color: "#a8c76a",
  value: 24,
  chance: 0,
  recipes: [{ "Synthetic Ammonia": 0.7 }], // 比率 calibration TBD — 過リン酸肥料の史実比率(1:0.6-0.7)のような直接の一次資料が無い
  unit: "sack",
  demandCoverage: {},
  requiredTechnology: "syntheticAmmonia"
}
```

`Synthetic Ammonia`/`Nitrogen Fertilizer` はどちらも `requiredTechnology: "syntheticAmmonia"` を共有する。
`isGoodEnabled()`（世界のどこかで `demonstrated`）と `isGoodManufacturableInState()`（生産する州で `adopted`）の
二段階ゲートにより、roadmap §9.2 の「`demonstrated` では少量生産・`adopted` で肥料工場と流通」という区分を、
新しい技術ノードを2つに分けずに1つの `TechnologyDefinition` だけで自然に表現できる（§2 表、§7 決定事項5）。

### 3.3 セーブ互換性（Good migration）

`migratePhosphateGoods()` と同型の関数を追加する:

```ts
// goods-generator.ts
const SYNTHETIC_AMMONIA_GOOD_NAMES = ["Synthetic Ammonia", "Nitrogen Fertilizer"] as const;

export function migrateSyntheticAmmoniaGoods(): boolean {
  // migratePhosphateGoods()（goods-generator.ts:3264）と全く同じ実装:
  // 1) 既存カタログに無い名前だけ Goods.getDefaultGood() から追加し id を採番
  // 2) GOODS_DATA テンプレートの recipes をこのセーブの Good id に解決し直す
  // 3) requiredTechnology をコピーする
}
```

`src/extensions/economy/index.tsx` の両方の呼び出し箇所（[index.tsx:2459-2460, 3129-3130](../../src/extensions/economy/index.tsx#L2459-L2460)、`migratePhosphateGoods()` の直後）に `migrateSyntheticAmmoniaGoods()` を追加する。

### 3.4 技術ノード: `syntheticAmmonia`

`technologyDefinitions.ts` の `ERA_6` 配列、`catalyticChemistry` の直後に追加:

```ts
{
  id: "syntheticAmmonia",
  label: "Synthetic ammonia",
  era: 6,
  scope: "state",
  prerequisites: ["catalyticChemistry"],
  known: {
    min: {
      fertilizerCoverageGap: 0.3,  // 新規シグナル、§3.5。「施肥カバレッジ不足」が需要を牽引する
      administration: 0.65,
      instruments: 0.45,
      treasury: 500
    }
  },
  demonstrated: {
    min: { syntheticAmmoniaTrialYears: 2, experimentRecord: 0.75, treasury: 600 } // 新規シグナル、§3.5
  },
  adopted: {
    min: { syntheticAmmoniaInstallations: 1, administration: 0.7, treasury: 700 } // 新規シグナル、§3.5
  },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

- `prerequisites` は `catalyticChemistry` の1本のみ。`prerequisitesMet()`（[technologyProgress.ts:964-966](../../src/generators/technologyProgress.ts#L964-L966)）は前提を必ず `adopted` まで要求するため、`catalyticChemistry`（前提: `highPressureChemicalApparatus`）→`highPressureChemicalApparatus`（前提: `modernSteelmaking`・`industrialSulfuricAcid`）→…という連鎖全体が既に `adopted` していることを間接的に要求する。`catalytic-chemistry.md` §3 の「前提は単独ノードのみ、祖先を再掲しない」という判断をそのまま踏襲する。
- `syntheticAmmonia` が `known` に進める時点で、`catalyticChemistry` 自身の `adopted` 閾値（`experimentRecord: 0.75`・`naturalPhilosophy: 0.6`・`administration: 0.65`・`treasury: 450`）は既に満たされている。`known` 閾値の `administration: 0.65`/`instruments: 0.45` はこの水準以上に設定し、`treasury: 500` で前提 `adopted` の瞬間に自動的に `known` へ進まないようにする（`catalytic-chemistry.md` §3 と同じ差別化ロジック）。
- `fertilizerCoverageGap`（§3.5）が `known` 閾値の需要ドライバーであり、`phosphateFertilizer` の `known` 閾値が `foodFertilizerPressure` を使っていたのと同じ「需要が発展を牽引する」パターンの後継。ただし対象シグナルが異なる（都市食料輸入ギャップ → 施肥カバレッジ不足）ため、既存シグナルの再定義ではなく新規追加とする（§7 決定事項4）。
- `demonstrated`/`adopted` を2つのノードに分けない。roadmap §9.2 の「`demonstrated`＝少量生産・`adopted`＝肥料工場と流通」は、既存の3段階 `TechnologyDefinition` 機構と Good の二段階ゲート（§3.2）だけで表現され、`modernSteelmaking`/`highPressureChemicalApparatus`/`catalyticChemistry` のように専用ノードを追加で割る必要がない（§7 決定事項5）。
- `minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }` は era 6 の他6ノードと完全に同一の値。

### 3.5 新規シグナル（`technologyTypes.ts` / `technologyProgress.ts`）

`TechnologySignals` に3フィールド追加:

```ts
/**
 * 0..1。1 − 州内で耕作地を持つ Market の fertilizerStock（Phosphate Fertilizer 由来）平均。
 * 「施肥カバレッジ不足」の需要シグナル。syntheticAmmonia の known 閾値に使う。
 * foodFertilizerPressure/lateChemistryDemandPressure とは独立に計算し、両者の既存の校正値は変更しない。
 */
fertilizerCoverageGap: number;
/** SyntheticAmmoniaPlant の州内 documentedRuns 最大値。phosphateFertilizerTrialYears と同型。 */
syntheticAmmoniaTrialYears: number;
/** active な SyntheticAmmoniaPlant の件数。phosphateFertilizerPlantCount と同型。 */
syntheticAmmoniaInstallations: number;
```

`technologyProgress.ts` の初期化ブロック（`phosphateRockAccess: 0, ...` の並び）に3フィールドとも `0` で追加する。

`fertilizerCoverageGap` は既存の `foodFertilizerPressure` 計算ループ（[technologyProgress.ts:886-914](../../src/generators/technologyProgress.ts#L886-L914)）をそのまま拡張し、新しいマップ・新しいループを増やさずに同じ1パスで計算する:

```ts
let fertilizerCount = 0;
const fertilizerByState = new Map<number, { sum: number; n: number; gapSum: number }>(); // gapSum 追加
for (const market of asStockArray(economy.markets)) {
  const ledger = isRecord(market.foodLedger) ? market.foodLedger : null;
  if (!ledger) continue;
  // ...既存の stateId/need/gap/ratio 計算はそのまま...
  const entry = fertilizerByState.get(stateId) ?? { sum: 0, n: 0, gapSum: 0 };
  entry.sum += ratio;
  entry.gapSum += 1 - clamp01(asNumber(market.fertilizerStock)); // 追加
  entry.n += 1;
  fertilizerByState.set(stateId, entry);
  fertilizerCount += 1;
}
if (fertilizerCount > 0) {
  for (const [stateId, entry] of fertilizerByState) {
    const signals = map.get(stateId);
    if (!signals || entry.n <= 0) continue;
    signals.foodFertilizerPressure = clamp01(entry.sum / entry.n);           // 既存、変更なし
    signals.fertilizerCoverageGap = clamp01(entry.gapSum / entry.n);          // 追加
    signals.lateChemistryDemandPressure = clamp01(/* 既存の式、変更なし */); // 既存、変更なし
  }
}
```

`foodLedger` を持つ Market（＝人口を抱える市場）だけを対象にする既存フィルタをそのまま流用する。`cultivatedArea`/`marketCellColumn` の新規プラミングは不要。

`syntheticAmmoniaTrialYears`/`syntheticAmmoniaInstallations` は `phosphateFertilizerTrialYears`/`phosphateFertilizerPlantCount` の計算ブロック（[technologyProgress.ts:805-819, 828-831](../../src/generators/technologyProgress.ts#L805-L819)、[871-877](../../src/generators/technologyProgress.ts#L871-L877)）と全く同じ形で追加する: `ChemistryTrial.kind === "syntheticAmmoniaPlant"` から年数を、`economy.syntheticAmmoniaPlants` の active 件数からインストール数を集計する。

`COUNT_SIGNAL_KEYS`（[technologyProgress.ts:968-989](../../src/generators/technologyProgress.ts#L968-L989)）に `syntheticAmmoniaTrialYears`/`syntheticAmmoniaInstallations` を追加する。`fertilizerCoverageGap` は `sulfurAccess`/`foodFertilizerPressure` と同じく無登録（デフォルトの "ratio" 種別のまま）。

### 3.6 State資本設備: `SyntheticAmmoniaPlants`

`chemistryTypes.ts` の `ChemistryTrialKind` union に `"syntheticAmmoniaPlant"` を追加し、`PhosphateFertilizerPlant` と同一形状の `SyntheticAmmoniaPlant` interface を追加する（冶金ドメインの `SteelConverterPlant` ではなく、化学ドメインの `AcidPlant`/`PhosphateFertilizerPlant` 側を踏襲する。§7 決定事項6）:

```ts
export type ChemistryTrialKind =
  | "compounding" | "laboratory" | "acidPlant" | "phosphateFertilizerPlant" | "syntheticAmmoniaPlant";

export interface SyntheticAmmoniaPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
}
```

`chemMedCommon.ts` に定数追加:

```ts
/** calibration TBD — 4つの State資本設備で最大。ACID_PLANT_BUDGET(24) < PHOSPHATE_FERTILIZER_PLANT_BUDGET(28)
 *  < STEEL_CONVERTER_PLANT_BUDGET(32) < この値。高圧触媒プラントは史実的に最も資本集約的。 */
export const SYNTHETIC_AMMONIA_PLANT_BUDGET = 40;
```

新規ファイル `syntheticAmmoniaPlants.ts`（`phosphateFertilizerPlants.ts` と一対一で対応する構造）:

```ts
/**
 * demonstrated 段階の判定に使う世界ゲート。catalyticChemistry が世界のどこかで demonstrated に
 * なるまで出力を止める — worldHasIndustrialSulfuricAcid() と同型。
 */
function worldHasCatalyticChemistry(): boolean {
  return getTechnologyProgressEntries().some(
    entry => entry.technologyId === "catalyticChemistry" && isTechnologyStageAtLeast(entry.stage, "demonstrated")
  );
}

export class SyntheticAmmoniaPlantsModule {
  settleAnnual(): boolean {
    // PhosphateFertilizerPlants.settleAnnual() と同型:
    // 1. 年次自己ゲート（getSyntheticAmmoniaPlantsLastSettledYear）
    // 2. syntheticAmmonia が"known"以上のStateだけがプラントを持てる
    // 3. plant新設/継続ごとにSYNTHETIC_AMMONIA_PLANT_BUDGETをdebitTreasury
    // 4. Coke だけを consumeNamed で市場から消費する（§7 決定事項1: 水素源＋工程エネルギーの代理として
    //    Coke単独消費、専用のHydrogen Goodは追加しない）。量は calibration TBD、1.2/年。
    // 5. utilization >= 0.5 の年だけ documentedRuns += 1、trialFor(kind="syntheticAmmoniaPlant")で
    //    ChemistryTrialを更新、worldHasCatalyticChemistry() が真の間だけ
    //    addNamedStock(marketId, "Synthetic Ammonia", role==="trial" ? 0.1 : 0.4)
    //    （AcidPlantの0.15/0.6よりやや小さい — 史実のHaber 1909年実証がベンチスケールだったことを反映。calibration TBD）
    // 6. adoptedに達したらroleを"trial"→"service"に昇格
  }
}
export const SyntheticAmmoniaPlants = new SyntheticAmmoniaPlantsModule();
```

`economyContext.ts` にスライスアクセサを追加（`getPhosphateFertilizerPlants`/`setPhosphateFertilizerPlants` と同型、[economyContext.ts:1407-1414](../../src/extensions/economy/economyContext.ts#L1407-L1414)）:

```ts
export function getSyntheticAmmoniaPlants(): SyntheticAmmoniaPlant[] { return getSliceArray("syntheticAmmoniaPlants"); }
export function setSyntheticAmmoniaPlants(rows: readonly SyntheticAmmoniaPlant[]): void { setSliceArray("syntheticAmmoniaPlants", rows); }
export function getSyntheticAmmoniaPlantsLastSettledYear(): number | null { /* getPhosphateFertilizerPlantsLastSettledYear と同型 */ }
export function setSyntheticAmmoniaPlantsLastSettledYear(year: number): void { /* 同型 */ }
```

`_syntheticAmmoniaPlantsLastSettledYearFallback` フォールバック変数を追加し、モジュールリセット処理（[economyContext.ts:210-227](../../src/extensions/economy/economyContext.ts#L210-L227) の一括 `null` 代入ブロック）にも追加する。

`extensionStateSlices.ts` の `validateEconomySlice()` の配列フィールド一覧（[extensionStateSlices.ts:437-439](../../src/runtime/extensionStateSlices.ts#L437-L439)）に `"syntheticAmmoniaPlants"` を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、[index.tsx:2940-2947](../../src/extensions/economy/index.tsx#L2940-L2947) の era 6 プラント群の末尾、`SteelConverters.settleAnnual()` の直後）:

```ts
AcidPlants.settleAnnual();
PhosphateFertilizerPlants.settleAnnual();
SteelConverters.settleAnnual();
// Coke だけを消費し、AcidPlants/PhosphateFertilizerPlants/SteelConverters のいずれの出力にも
// 依存しない — 順序上の制約はないが、era 6 プラント群としてここにまとめる。
SyntheticAmmoniaPlants.settleAnnual();
```

### 3.7 農村施肥ストック: `Market.nitrogenFertilizerStock` と `NitrogenFertilizerInvestment`

`marketTypes.ts` の `Market` interface に、`fertilizerStock` の直後へ追加:

```ts
/**
 * 0..1の飽和ストック。Nitrogen Fertilizerの年次購入カバレッジのEWMA。
 * fertilizerStock（Phosphate Fertilizer由来）とは別会計・別ストック。undefinedは0として扱う。
 * See docs/plan/synthetic-ammonia-vertical-slice.md §3.7.
 */
nitrogenFertilizerStock?: number;
```

新規ファイル `nitrogenFertilizerInvestment.ts` は `fertilizerInvestment.ts` とほぼ同一の実装にする（Good名と Market フィールド名だけを置き換える）:

```ts
export const TARGET_NITROGEN_FERTILIZER_PER_HECTARE = 0.008; // calibration TBD — Phosphate Fertilizer(0.01)よりやや小さい物量（高濃度品と想定）
export const NITROGEN_FERTILIZER_BUDGET_SHARE_OF_TREASURY = 0.12; // FertilizerInvestmentと同じ優先度の階層
export const NITROGEN_FERTILIZER_ADOPTION_RATE = 0.15; // 同じEWMA速度

class NitrogenFertilizerInvestmentModule {
  settleAnnual(): boolean {
    // FertilizerInvestment.settleAnnual() と全く同じ実装（fertilizerInvestment.ts）:
    // "Nitrogen Fertilizer" Good・market.nitrogenFertilizerStock に置き換えるだけ。
  }
}
export const NitrogenFertilizerInvestment = new NitrogenFertilizerInvestmentModule();
```

財源は `AgTechInvestment`/`FertilizerInvestment` と**同じ** `market.marketTreasury.balance`。専用の別会計は作らない。

呼び出し順序（`src/extensions/economy/index.tsx`、[index.tsx:2806-2813](../../src/extensions/economy/index.tsx#L2806-L2813)、`FertilizerInvestment.settleAnnual()` の直後・`IndustrialTechInvestment.settleAnnual()` の前）:

```ts
AgTechInvestment.settleAnnual();
FertilizerInvestment.settleAnnual();
// Nitrogen Fertilizer購入。FertilizerInvestmentと同じ「農地投資は鉱業/製錬投資より先」という
// 優先順位を維持するため、IndustrialTechInvestmentの直前に置く（rural-agtech-investment.md §6.3）。
NitrogenFertilizerInvestment.settleAnnual();
IndustrialTechInvestment.settleAnnual();
```

`SyntheticAmmoniaPlants.settleAnnual()`（生産側）は §3.6 の通り era 6 プラント群のブロック（`annualUrbanKnowledge` 相当、[index.tsx:2940-2947](../../src/extensions/economy/index.tsx#L2940-L2947)）に置くため、`annualAgTech` ブロックより**後**に実行される。`FertilizerInvestment`/`Phosphate Fertilizer` と同じ非同期関係——今年の `NitrogenFertilizerInvestment` は前年までにプラントが生産した在庫から購入する——であり、既存の設計と矛盾しない。

### 3.8 収量への反映（`agriculturalLandUse.ts`）

`AgriculturalConditions` に、`fertilizerStockByCell` の直後へ追加:

```ts
/** 市場ごとの Nitrogen Fertilizer 購入カバレッジ。DevelopmentPotential が市場からセルへ展開する。 */
readonly nitrogenFertilizerStockByCell?: Float32Array;
```

`calculateYieldKgPerHectare()`（[agriculturalLandUse.ts:612-629](../../src/extensions/economy/generators/agriculturalLandUse.ts#L612-L629)）の乗算チェーンに1項追加:

```ts
// PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX(0.2)より大きく、AGTECH_YIELD_BONUS_MAX(0.4)より小さい
// — 窒素は収量の主要な律速要因であるという史実のHaber-Boschの重みづけ。calibration TBD。
export const NITROGEN_FERTILIZER_YIELD_BONUS_MAX = 0.3;

function calculateYieldKgPerHectare(/* ... */): number {
  return (
    BASE_NET_YIELD_KG_PER_SOWN_HECTARE *
    effectiveClimateYield *
    (1 + AGTECH_YIELD_BONUS_MAX * effectiveAgTech) *
    (1 + STATE_YIELD_BONUS_MAX * stateProductivity) *
    (1 + FOUR_COURSE_YIELD_BONUS_MAX * (conditions.fourCourseRotationByCell?.[cellId] ?? 0)) *
    (1 + PHOSPHATE_FERTILIZER_YIELD_BONUS_MAX * (conditions.fertilizerStockByCell?.[cellId] ?? 0)) *
    (1 + NITROGEN_FERTILIZER_YIELD_BONUS_MAX * (conditions.nitrogenFertilizerStockByCell?.[cellId] ?? 0)) // 追加
  );
}
```

`soilFertility` には手を入れない。理由は `phosphate-fertilizer-vertical-slice.md` §3.9 と同一（`MAX_SOIL_FERTILITY` の天井に足すと史実の効果を表現できない、購入財の効果を土壌疲弊モデルと混線させない）。

`developmentPotential.ts` に `resolveNitrogenFertilizerStockByCell()` を追加する（`resolveFertilizerStockByCell()` と同型、[developmentPotential.ts:101](../../src/extensions/economy/generators/developmentPotential.ts#L101)）:

```ts
function resolveNitrogenFertilizerStockByCell(cellCount: number): Float32Array {
  const stockByCell = new Float32Array(cellCount);
  const marketCellColumn = getMarketCellColumn();
  if (!marketCellColumn.length) return stockByCell;
  const stockByMarketId = new Map(getMarkets().map(market => [market.i, market.nitrogenFertilizerStock ?? 0]));
  for (let cellId = 0; cellId < cellCount; cellId++) {
    const marketId = marketCellColumn[cellId];
    if (!marketId) continue;
    stockByCell[cellId] = stockByMarketId.get(marketId) ?? 0;
  }
  return stockByCell;
}
```

`DevelopmentPotentialModule` が `fertilizerStockByCell` を通す3箇所——`AgriculturalConditions` フィールド宣言（[agriculturalLandUse.ts:127](../../src/extensions/economy/generators/agriculturalLandUse.ts#L127)）・`resolveFertilizerStockByCell()` の呼び出し（[developmentPotential.ts:354](../../src/extensions/economy/generators/developmentPotential.ts#L354)）・`getAgriculturalConditions()` が返すオブジェクトへの配線——と全く同じ位置に `nitrogenFertilizerStockByCell` を並べて追加する。

## 4. Phase分割

- **Phase 1 — 技術グラフとシグナルの型**: §3.4（`syntheticAmmonia` ノード）＋ §3.5（`fertilizerCoverageGap`/`syntheticAmmoniaTrialYears`/`syntheticAmmoniaInstallations`）。`SyntheticAmmoniaPlant` 配列が空のまま `syntheticAmmoniaInstallations`/`syntheticAmmoniaTrialYears` は 0 に留まり、ノードは `fertilizerCoverageGap` 次第で `known` までしか進めない状態。
- **Phase 2 — `SyntheticAmmoniaPlants` 生産経路**: §3.2（`Synthetic Ammonia` Good）＋ §3.6。`Synthetic Ammonia` が実際に市場在庫として生まれ、`syntheticAmmonia` が `demonstrated`/`adopted` まで到達可能になる。
- **Phase 3 — `Nitrogen Fertilizer` と農村投資と収量接続**: §3.2（`Nitrogen Fertilizer` Good）＋ §3.7（`NitrogenFertilizerInvestment`）＋ §3.8（収量式）。ここで初めてプレイヤーから見た効果（収量上昇）が現れる。
- **Phase 4 — セーブ互換性の仕上げ**: §3.3 の migration 関数と §3.6 の `extensionStateSlices.ts` 登録。Phase 1〜3 と並行して都度追加するのが自然だが、既存セーブでの動作確認は全 Phase 完了後にまとめて行う。

## 5. テスト計画

- `syntheticAmmoniaPlants.test.ts`（新規、`phosphateFertilizerPlants.test.ts` と同じ形）: `syntheticAmmonia` が未 `known` の州はプラントを持たないこと、`Coke` 不足で `utilization` が下がり `documentedRuns` が増えないこと、`worldHasCatalyticChemistry()` が偽の間は消費だけして出力しないこと、`adopted` 昇格で `role` が `service` になること、年次自己ゲート。
- `nitrogenFertilizerInvestment.test.ts`（新規、`fertilizerInvestment.test.ts` と同じ形）: 予算内で購入し `nitrogenFertilizerStock` が上昇すること、供給停止年は緩やかに減衰すること、`Nitrogen Fertilizer` 市場在庫がゼロなら購入量もゼロになること。
- `goods-generator.test.ts`: `Synthetic Ammonia`/`Nitrogen Fertilizer` が `GOODS_DATA` に存在し `requiredTechnology`/`demandCoverage: {}` が正しいこと。`migrateSyntheticAmmoniaGoods()` が旧セーブへ既存 id を壊さず追加すること。
- `technologyProgress.test.ts`: `syntheticAmmonia` が `TECHNOLOGY_DEFINITIONS` 上で era・prerequisites・閾値キーが正しいこと。`catalyticChemistry` が世界のどこにも `adopted` していない状態では `syntheticAmmonia` が一切進行しないこと（`explainTechnologyGate()` を使った統合テスト）。`fertilizerCoverageGap` が `Market.fertilizerStock` フィクスチャから正しく `1 - 平均` として計算されること（`foodFertilizerPressure` の既存値が変化しないことも合わせて確認）。`syntheticAmmoniaTrialYears`/`syntheticAmmoniaInstallations` が `economy.chemistryTrials`/`economy.syntheticAmmoniaPlants` から正しく集計されること。
- `agriculturalLandUse.test.ts`（既存に追加）: 同一セルで `nitrogenFertilizerStockByCell` あり/なしを比較し `yieldPerArea` が上昇すること。第7引数省略時に既存挙動と完全一致すること（`fertilizerStockByCell` 省略時のテストと同じ形）。

## 6. 受け入れ条件

- `catalyticChemistry` が世界のどこにも `adopted` していない状態では `syntheticAmmonia` は `known` にすら進まない。
- `Synthetic Ammonia`/`Nitrogen Fertilizer` はどちらも `demandCoverage` が空で、都市の一般消費財需要には一切計上されない。
- `syntheticAmmonia` が `adopted` になっただけでは収量は変化しない。実際に `Nitrogen Fertilizer` が市場で購入され `Market.nitrogenFertilizerStock` が積み上がって初めて `yieldPerArea` に反映される（「技術フラグで肥料が出る」実装の禁止 — `phosphate-fertilizer-vertical-slice.md` と同じ原則）。
- `fertilizerCoverageGap` の追加後も、`foodFertilizerPressure`/`lateChemistryDemandPressure` の既存の値・使用箇所（`chemicalIndustryFoundation`/`phosphateFertilizer`）は一切変化しない。
- `Synthetic Ammonia` の消費先は `Nitrogen Fertilizer` の職人レシピのみであり、軍需（Gunpowder/Saltpeter チェーン）とは完全に独立している。
- 既存セーブ（`Synthetic Ammonia`/`Nitrogen Fertilizer` を持たない旧カタログ）をロードしても `migrateSyntheticAmmoniaGoods()` により既存 Good の id がずれない。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 7. 決定事項 / Open Questions

以下は [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) 「設計自体がまだ薄い穴」1〜6の各項目への回答である。

1. **水素源は明示 Good にしない。`SyntheticAmmoniaPlants` が `Coke` を直接消費する**（設計自体がまだ薄い穴 1）。
   同メモ自身が「後者の方が市場を汚さない」と結論していた案を採用する。専用の `Hydrogen` Good・専用のアクセスシグナルは追加しない。
2. **窒素は Good 化しない**（設計自体がまだ薄い穴 2）。空気は無尽蔵という前提のまま、`SyntheticAmmoniaPlants` の
   `treasury`/`Coke` 消費（圧縮動力の代理）だけで表現する。専用のエネルギー在庫は作らない。
3. **触媒材料（オスミウム／ウラン／鉄触媒等）の希少鉱物 Good は導入しない**（設計自体がまだ薄い穴 3）。
   `catalyticChemistry` という前提技術ノード自体（研究年数＋`experimentRecord`）が触媒化学の確立を表現しており、
   `syntheticAmmonia` 側で追加の消費資源にはしない——`catalytic-chemistry.md` §1 非目的が持ち越した検討事項への回答。
4. **`foodFertilizerPressure` は再定義しない。新しいシグナル `fertilizerCoverageGap` を追加する**（設計自体がまだ薄い穴 4）。
   `Market.fertilizerStock` は `phosphateFertilizer` 実装以前には存在しなかったため、当時は「施肥カバレッジ不足」を
   計算する材料が無かった。今は存在するため、既存シグナルを書き換えて `phosphateFertilizer`/`chemicalIndustryFoundation`
   の校正済みの閾値を壊すのではなく、新しいシグナルを追加して `syntheticAmmonia` 側だけで使う。
5. **ハーバー（`demonstrated`）とボッシュ（`adopted`）は工場ノードを分けず、単一の `syntheticAmmonia` ノードのまま
   3段階機構（known/demonstrated/adopted）と Good の二段階ゲート（`isGoodEnabled`/`isGoodManufacturableInState`）だけで表現する**
   （設計自体がまだ薄い穴 5）。`modernSteelmaking`/`highPressureChemicalApparatus`のように意味的に異なる複数ノードへ
   分割する理由が無く、`AcidPlant`系の `role: "trial"→"service"` 昇格だけで「少量生産→工場と流通」の質的差を表現できる。
6. **`Steam Power` 容量サービスを前提にしない**（設計自体がまだ薄い穴 6）。`modern-steelmaking-and-high-pressure-apparatus.md`
   §7 決定事項5・`catalytic-chemistry.md` の非目的が既に確立した判断をそのまま踏襲し、`Coke` 消費と `treasury` だけで
   エネルギー・水素源の両方を代理する。
7. **`SyntheticAmmoniaPlant` は `ChemistryTrial` を経由する**（`AcidPlant`/`PhosphateFertilizerPlant` 型）。
   `SteelConverterPlant` が採用した「`ChemistryTrial` を経由しない」例外は、冶金ドメインという理由による特例
   （`modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項2）であり、`SyntheticAmmoniaPlant` は正真正銘の
   化学プラントのため、この特例を継承しない。
8. **`chemMedCommon.ts` の共有ヘルパーをそのまま再利用する**。4例目の「State資金の資本設備」としても
   `debitTreasury`/`pickSponsorBurg`/`consumeNamed`/`addNamedStock` の挙動・calibration を完全に一致させる。
9. **軍需硝酸・爆薬 Good は本書の範囲外とする**。`Synthetic Ammonia` の消費先が `Nitrogen Fertilizer` の1本のみである間は、
   roadmap §9.2 が要求する農業／軍事の予算分離は自明に満たされる。実際に軍需消費先を追加する時点で、
   別スライスとして予算分離機構を設計する。

## 8. 関連ドキュメント

- [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) — 本スライスの発端になった現状監査メモ。「実装するならこの順」4・5番目、「設計自体がまだ薄い穴」1〜6番
- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.1–9.2 — ノード名・前提関係・採用条件の一次ソース
- [phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md) — 直接のテンプレート。`AcidPlant`/`PhosphateFertilizerPlant`/`FertilizerInvestment`/`fertilizerStockByCell` の設計が本書の§3.6-3.8の型
- [modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md) — `SteelConverterPlant`（`ChemistryTrial`を経由しない例外）との対比、Steam Power非依存の判断の先例
- [catalytic-chemistry.md](./catalytic-chemistry.md) — 直前の前提ノード。`highPressureChemicalApparatus`との差別化ロジック、触媒材料を導入しない判断の起点
- [rural-agtech-investment.md](./rural-agtech-investment.md) — `Market.agTechStock`/`AgTechInvestment` の設計元。`marketTreasury`優先順位モデルの一次ソース
- [chemistry-medicine-knowledge-accumulation.md](./chemistry-medicine-knowledge-accumulation.md) — `AcidPlant`/`ChemistryTrial`/`ExperimentalWorkshop` の設計元
