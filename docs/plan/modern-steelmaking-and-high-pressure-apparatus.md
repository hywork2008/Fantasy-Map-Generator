# 量産鋼と高圧装置 実装計画 (Modern Steelmaking & High-Pressure Chemical Apparatus)

## 状態

**設計案（未実装）**。[docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md)の「実装するならこの順」の2番目
（「量産鋼と高圧装置 — modernSteelmaking、耐圧設備の試作年数、精密計測（当面は Machine Parts 代用可）」）を対象とする。
[phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md)（1番目、実装済み）の直後の縦切りであり、
`industrialSulfuricAcid`／`phosphateFertilizer` と並ぶ era 6 の技術グラフを、`catalyticChemistry`・`syntheticAmmonia`（3・4番目、本書の範囲外）が
乗る土台まで伸ばす。

対応する一次資料:

- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.1: 「近代製鋼」「高圧化学装置」のノード表
- [steam-industrial-technology-history.csv](./data/steam-industrial-technology-history.csv) 行16: `modernSteelmaking`（1856年、ベッセマー法、出力 `Steel`）
- [steam-industrial-implementation.md](./steam-industrial-implementation.md) Phase 4（化学・電化、第二波）

## 1. 目的と非目的

### 目的

- `modernSteelmaking`（era 6）を新設し、CSV行16（ベッセマー法、1856年、"Bulk steel"／"量産鋼"）を技術グラフに反映する。
- 既存の `Steel` Good（`standardMachineWorks` ゲート、職人レシピのみ）に、`Sulfuric Acid`/`Phosphate Fertilizer` と同じ「一つの Good・二つの供給経路」パターンで、State資金の転炉（Bessemer converter）による量産経路を追加する。
- `highPressureChemicalApparatus`（era 6）を新設し、`catalyticChemistry`/`syntheticAmmonia`（将来の縦切り）が要求する「高圧反応の安定運用」という前提を、新しい Good や設備を作らずに既存シグナル＋新規1シグナル（`steelAccess`）だけで表現する。
- Grok メモの「精密計測（当面は Machine Parts 代用可）」という判断をそのまま踏襲し、`Precision Instruments` Good は導入しない。

### 非目的（本書の範囲外）

- `catalyticChemistry` / `syntheticAmmonia` そのもの。両ノードの前提として `highPressureChemicalApparatus` を用意するところまでで止める。
- `Precision Instruments` Good の新設。既存の `instruments`（Guild Knowledge の craft domain、現在は Liquor の蒸留装置と `experimentalWorkshops.ts` の研究者だけが積み上げている）シグナルで代用する。
- 電力・電気化学（`generatorAndMotor` 以降）。
- `Steel` の既存職人レシピ（`{ "Iron Ingot": 1, Coke: 0.6, Lime: 0.2 }`、`standardMachineWorks` ゲート）の変更。そのまま残し、転炉を並行する第二の供給経路として追加するだけにする。
- `Machine Parts`・`Stationary Steam Engine` など、`Steel` を消費する既存 Good の変更。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| `Steel` Good | `requiredTechnology: "standardMachineWorks"`（era 5）の職人レシピのみ。State資金の資本設備は無い。 | [goods-generator.ts:2470-2481](../../src/extensions/economy/generators/goods-generator.ts#L2470-L2481) |
| `standardMachineWorks` | era 5。`metallurgy`/`smelterWorkers`/`administration`/`treasury` のシグナル閾値のみで進行し、専用の設備モジュールは持たない。 | [technologyDefinitions.ts:515-523](../../src/generators/technologyDefinitions.ts#L515-L523) |
| era 6 の技術グラフ | `chemicalIndustryFoundation` → `industrialSulfuricAcid` → `phosphateFertilizer`（実装済み）で止まっている。 | [technologyDefinitions.ts:610-660](../../src/generators/technologyDefinitions.ts#L610-L660) |
| 「一つの Good・二つの供給経路」の先例 | `AcidPlant`/`PhosphateFertilizerPlant` はどちらも `burgId`/`stateId`/`role: "trial"\|"service"`/`active`/`utilization`/`documentedRuns`/`lastFundedYear` という同一形状。State資金は `chemMedCommon.ts` の `debitTreasury`/`pickSponsorBurg` で徴収し、原料は `consumeNamed`、出力は `addNamedStock`（`isGoodEnabled` チェック無し）で市場在庫に直接足す。 | [chemistryTypes.ts:62-79](../../src/extensions/economy/generators/chemistryTypes.ts#L62-L79)、[chemMedCommon.ts](../../src/extensions/economy/generators/chemMedCommon.ts) |
| より単純な「トライアル年数を自分自身で持つ」先例 | `HospitalInstallation` は別テーブル（`ChemistryTrial`）を介さず、`documentedRuns` を自分のレコードに直接持つ。シグナル計算側も1回のループで `hospitalInstallations`（件数）と `hospitalTrialYears`（`documentedRuns` の最大値）を同時に出している。 | [chemistryTypes.ts:49-60](../../src/extensions/economy/generators/chemistryTypes.ts#L49-L60)、[technologyProgress.ts:824-833](../../src/generators/technologyProgress.ts#L824-L833) |
| 検討したが採用しない先例 | `steamIndustry.ts`（鉄道・上水道）は State資金の徴収を一切せず、技術段階のゲートだけで市場在庫の燃料を無償消費する（`consumeForSmelting`、stockShare 0.5）。転炉は史実的に大きな資本投資を要するため、この「無償消費」モデルではなく `AcidPlant` 系の「State資金で建設・運転」モデルを踏襲する（§7 決定事項）。 | [steamIndustry.ts:29-33, 93-127](../../src/extensions/economy/generators/steamIndustry.ts#L29-L127) |
| `instruments` シグナル | Guild Knowledge の craft domain の一つ。現状 `Liquor`（蒸留装置）と `experimentalWorkshops.ts` の `upsertInstruments()`（研究者人数）からのみ積み上がる、既に生きているシグナル。 | [guildKnowledgeTypes.ts:2-11, 82](../../src/extensions/economy/generators/guildKnowledgeTypes.ts#L2-L11)、[guildKnowledge.ts:94-105](../../src/extensions/economy/generators/guildKnowledge.ts#L94-L105) |
| `sulfurAccess`/`phosphateRockAccess` の先例 | どちらも「州が保有する市場の該当 Good 合計在庫を `clamp01(stock / 定数)` にする」だけの市場カバレッジ・シグナル。`steelAccess` も同型で追加できる。 | [technologyProgress.ts:764-770](../../src/generators/technologyProgress.ts#L764-L770) |
| セーブ互換性 | `AcidPlant`/`PhosphateFertilizerPlant` はどちらも `economyContext.ts` にスライスアクセサ＋年次自己ゲート、`extensionStateSlices.ts` の `validateEconomySlice()` に配列名を登録済み。 | [economyContext.ts:1400-1409, 1451-1464](../../src/extensions/economy/economyContext.ts#L1400-L1464)、[extensionStateSlices.ts:437-438](../../src/runtime/extensionStateSlices.ts#L437-L438) |

## 3. 設計

### 3.1 概念モデル

```
Iron Ingot + Coke + Lime ─┐
                          ├─▶ Steel（既存 Good、requiredTechnology="standardMachineWorks"）
                          │      経路A: 職人レシピ（既存、無変更）
                          │      経路B: SteelConverters.settleAnnual()（新規、State資金の転炉）
                          ▼
                 SteelConverterPlant（新規配列。documentedRuns を自分自身で持つ、HospitalInstallation型）
                          │
                          ▼
      technologyProgress.ts: modernSteelmakingInstallations / modernSteelmakingTrialYears シグナル
                          │
                          ▼
   technologyDefinitions.ts "modernSteelmaking" ノード（known/demonstrated/adopted, era 6）
                          │
                          ▼（adopted が prerequisitesMet() の条件）
   technologyDefinitions.ts "highPressureChemicalApparatus" ノード
     known:       steelAccess（新規、市場カバレッジ） + instruments（既存） + administration（既存）
     demonstrated/adopted: experimentRecord（既存、ExperimentalWorkshops 由来）を「試作年数」の代理として使う
                          │
                          ▼
        （将来の縦切り）catalyticChemistry / syntheticAmmonia の前提ノードとして解禁
```

`highPressureChemicalApparatus` は新しい Good も新しい設備モジュールも持たない。roadmap §9.1 が要求する「高品質鋼」「計測器」「安全規制」を、それぞれ `steelAccess`（新規）・`instruments`（既存）・`administration`（既存）という既存パターンのシグナルで表現し、「試作年数」は `ExperimentalWorkshops` が既に積んでいる `experimentRecord` を転用する。これにより `phosphateFertilizer` のような専用の州資金プラントを二重に作らずに済む。

### 3.2 `Steel` の第二供給経路: `SteelConverterPlant`

新規型 `steelConverterTypes.ts`（`chemistryTypes.ts` とは別ファイル — 化学ではなく冶金のドメインなので分離する。§7 決定事項）:

```ts
export type SteelConverterFailureReason = "materialShortage" | "fundingCut";

export interface SteelConverterPlant {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  /** HospitalInstallation と同型: 別テーブルを介さず自分自身で試作年数を持つ。 */
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: SteelConverterFailureReason;
}
```

`AcidPlant`/`PhosphateFertilizerPlant` と異なり `ChemistryTrial` を経由しない（§7 決定事項）ため、`operatingYears`／`inputsConsumed`／`outputsDelivered` などの付随フィールドは持たず、`HospitalInstallation` と同じ最小限の形にする。

新規モジュール `steelConverters.ts`（`acidPlants.ts`/`phosphateFertilizerPlants.ts` と同型構造）:

```ts
// chemMedCommon.ts の再利用（§7 決定事項: 命名はそのまま、州資金の資本設備という汎用ヘルパーとして使い続ける）
import { addNamedStock, consumeNamed, debitTreasury, marketIdForBurg, pickSponsorBurg } from "./chemMedCommon";

export const STEEL_CONVERTER_PLANT_BUDGET = 32; // calibration TBD — AcidPlant(24)/PhosphateFertilizerPlant(28)より高い、量産鋼の資本規模

export class SteelConvertersModule {
  settleAnnual(): boolean {
    // AcidPlants.settleAnnual() と同型:
    // 1. 年次自己ゲート（getSteelConverterPlantsLastSettledYear）
    // 2. modernSteelmaking が "known" 以上の State だけがプラントを持てる
    // 3. plant 新設/継続ごとに STEEL_CONVERTER_PLANT_BUDGET を debitTreasury
    // 4. Iron Ingot / Coke / Lime を consumeNamed で市場から消費（既存 Steel レシピと同じ 1 : 0.6 : 0.2 比、
    //    量産鋼らしいスケールとして 3 : 1.8 : 0.6 を年間投入量とする、calibration TBD）
    // 5. utilization >= 0.5 の年だけ documentedRuns += 1、addNamedStock(marketId, "Steel", role==="trial" ? 0.6 : 2.4)
    //    （AcidPlant の 0.15/0.6 と同じ「trial は小規模、service は本格稼働」の比、量産鋼らしく4倍にスケール、calibration TBD）
    // 6. adopted に達したら role を "trial" → "service" に昇格
  }
}
export const SteelConverters = new SteelConvertersModule();
```

`Steel` は `requiredTechnology: "standardMachineWorks"` を持つが、`standardMachineWorks` は era 5 でありプレイの大半で早期に demonstrated するため、`addNamedStock` 側で `isGoodEnabled` チェックが無いことも含め、`Sulfuric Acid` が必要だった `consumeNamed` の特例（§3.7 of phosphate-fertilizer-vertical-slice.md）のような追加対応は不要。

### 3.3 新規シグナル: `steelAccess` / `modernSteelmakingTrialYears` / `modernSteelmakingInstallations`

`technologyTypes.ts` の `TechnologySignals` に3フィールド追加:

```ts
/** 0..1 市場在庫カバレッジ。sulfurAccess/phosphateRockAccess と同型。 */
steelAccess: number;
/** SteelConverterPlant.documentedRuns の州内最大値。hospitalTrialYears と同型。 */
modernSteelmakingTrialYears: number;
/** active な SteelConverterPlant の件数。hospitalInstallations と同型。 */
modernSteelmakingInstallations: number;
```

`technologyProgress.ts`:

- `steelAccess` は `sulfurAccess`/`phosphateRockAccess` と同じ `stateMarketStockByGood()` パスに `steelId = goodIdByName(economy, "Steel")` を足すだけ（[technologyProgress.ts:764-770](../../src/generators/technologyProgress.ts#L764-L770) と同じ形）。
- `modernSteelmakingTrialYears`/`modernSteelmakingInstallations` は `hospitalInstallations`/`hospitalTrialYears` の計算ブロック（[technologyProgress.ts:824-833](../../src/generators/technologyProgress.ts#L824-L833)）と全く同じ形の1ループで両方を出す（`ChemistryTrial` を経由しないため `acidPlantTrialYears` より1ブロック分短くなる）:

```ts
const steelYears = new Map<number, number>();
for (const plant of asStockArray(economy.steelConverterPlants)) {
  if (plant.active === false) continue;
  const stateId = asNumber(plant.stateId) || burgStateId(asNumber(plant.burgId));
  const signals = map.get(stateId);
  if (!signals) continue;
  signals.modernSteelmakingInstallations += 1;
  steelYears.set(stateId, Math.max(steelYears.get(stateId) ?? 0, asNumber(plant.documentedRuns)));
}
for (const [stateId, years] of steelYears) {
  const signals = map.get(stateId);
  if (signals) signals.modernSteelmakingTrialYears = years;
}
```

`COUNT_SIGNAL_KEYS`（[technologyProgress.ts:925-942](../../src/generators/technologyProgress.ts#L925-L942)、`hospitalInstallations`/`acidPlantInstallations`/`phosphateFertilizerTrialYears` などが既に登録されている）に `modernSteelmakingTrialYears`/`modernSteelmakingInstallations` を追加する。`steelAccess` は `sulfurAccess`/`phosphateRockAccess` と同じく無登録（デフォルトの "ratio" 種別のまま）。

### 3.4 技術ノード: `modernSteelmaking`

`technologyDefinitions.ts` の `ERA_6` に追加:

```ts
{
  id: "modernSteelmaking",
  label: "Modern steelmaking",
  era: 6,
  scope: "state",
  prerequisites: ["standardMachineWorks"],
  known: { min: { metallurgy: 0.75, steelAccess: 0.2, administration: 0.4, treasury: 150 } },
  demonstrated: { min: { modernSteelmakingTrialYears: 2, metallurgy: 0.8, treasury: 190 } },
  adopted: { min: { modernSteelmakingInstallations: 1, metallurgy: 0.85, treasury: 230 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`metallurgy: 0.75` は `standardMachineWorks` の adopted 閾値（0.7）より高く設定し、既に adopted な前提だけで自動的に満たされないようにする。数値は他の era 6 ノード（`industrialSulfuricAcid`: 100/140/180、`phosphateFertilizer`: 130/170/210）の並びに揃えた calibration TBD。

### 3.5 技術ノード: `highPressureChemicalApparatus`

```ts
{
  id: "highPressureChemicalApparatus",
  label: "High-pressure chemical apparatus",
  era: 6,
  scope: "state",
  prerequisites: ["modernSteelmaking", "industrialSulfuricAcid"],
  known: { min: { steelAccess: 0.3, instruments: 0.3, administration: 0.5, treasury: 190 } },
  demonstrated: { min: { experimentRecord: 0.6, steelAccess: 0.35, treasury: 240 } },
  adopted: { min: { experimentRecord: 0.65, steelAccess: 0.4, administration: 0.6, treasury: 290 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`prerequisites` に両方の親ノードを要求するため、`prerequisitesMet()`（[technologyProgress.ts:921-923](../../src/generators/technologyProgress.ts#L921-L923)）は「その州で `modernSteelmaking` と `industrialSulfuricAcid` の両方が adopted」を要求する。この時点で `metallurgy` は `modernSteelmaking` の adopted 閾値（0.85）を既に満たしているため、`known` の閾値に `metallurgy` を再掲しない（`industrialSulfuricAcid` が `chemicalIndustryFoundation` の `experimentRecord` を再掲しないのと同じ理由）。

## 4. Phase分割

- **Phase 1 — `modernSteelmaking` の技術グラフとシグナルの型**: §3.3（型のみ、シグナル計算含む）＋ §3.4。`SteelConverterPlant` 配列が空のまま `modernSteelmakingInstallations`/`modernSteelmakingTrialYears` は 0 に留まり、ノードは `known` までしか進めない状態。
- **Phase 2 — `SteelConverterPlant` 生産経路**: §3.2。`Steel` が実際に転炉から市場在庫として生まれ、`modernSteelmaking` が `demonstrated`/`adopted` まで到達可能になる。
- **Phase 3 — `highPressureChemicalApparatus`**: §3.5。新規 Good・設備は無いため、Phase 1/2 が終わっていれば単独で追加できる。

## 5. テスト計画

- `steelConverters.test.ts`（新規、`phosphateFertilizerPlants.test.ts` と同じ形）: `modernSteelmaking` が未 `known` の州はプラントを持たないこと、Iron Ingot/Coke/Lime 不足で `utilization` が下がり `documentedRuns` が増えないこと、`adopted` 昇格で `role` が `service` になること、年次自己ゲート。
- `technologyProgress.test.ts` に追加: `TECHNOLOGY_DEFINITIONS` 上の `modernSteelmaking`/`highPressureChemicalApparatus` の era・prerequisites・閾値キーの静的チェック（[technologyProgress.test.ts:446-468](../../src/generators/technologyProgress.test.ts#L446-L468) の形）。`explainTechnologyGate()` を使い、市場の `Steel` 在庫と `economy.steelConverterPlants` から `steelAccess`/`modernSteelmakingTrialYears`/`modernSteelmakingInstallations` が正しく計算されることを検証する統合テスト（phosphate-fertilizer-vertical-slice.md 実装時に追加した `technologyProgress.test.ts` の統合テストと同じ形）。

## 6. 受け入れ条件

- `standardMachineWorks` が世界のどこにも `adopted` していない状態では `modernSteelmaking` は一切進行しない。
- `modernSteelmaking` が `adopted` になっただけでは `Steel` の市場供給は増えない。実際に `SteelConverterPlant` が稼働し `addNamedStock` が呼ばれて初めて反映される（技術フラグ即座に供給が跳ねる実装の禁止 — `phosphate-fertilizer-vertical-slice.md` と同じ原則）。
- `highPressureChemicalApparatus` は `modernSteelmaking` と `industrialSulfuricAcid` の両方が `adopted` するまで `known` にすら進めない。
- 新しい Good・鉱物・農業接続は一切増えない（本書のスコープはあくまで技術グラフと `Steel` の第二供給経路のみ）。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 7. 決定事項 / Open Questions

1. **`steamIndustry.ts` の「無償消費」モデルではなく `AcidPlant` 系の「State資金で建設・運転」モデルを採用する**。転炉は史実的に大きな資本投資（Bessemer の実機建設費）を要し、鉄道・上水道のような「技術さえあれば燃料を無償消費するだけ」の運用とは性質が異なるため。
2. **`SteelConverterPlant` は `ChemistryTrial` を経由しない**（`HospitalInstallation` 型）。転炉は特定の鉱山に紐付かず、また `acidPlant`/`phosphateFertilizerPlant` のように「トライアル段階では複数の技術が同じ trial 行を共有する」必要もないため、`ChemistryTrialKind` に冶金の種別を追加する意味論的な違和感を避けた。
3. **`chemMedCommon.ts` の共有ヘルパー（`debitTreasury`/`pickSponsorBurg`/`consumeNamed`/`addNamedStock`）をそのまま再利用する**。ファイル名は「化学・医学」だが中身は完全に汎用（Good名と市場IDだけを扱う）で、`AcidPlant`/`PhosphateFertilizerPlant` に続く3例目もこのヘルパーに揃えることで、3つの「State資金の資本設備」モジュールの挙動・calibration が完全に一致する。ファイルの命名・置き場所の是正は将来の別課題とする（`FUEL_MINERAL_COMMODITIES` の命名を据え置いた `phosphate-fertilizer-vertical-slice.md` §7-2 と同じ判断）。
4. **`Precision Instruments` Good は導入しない**。既存の `instruments` craft-knowledge シグナルで代用する、という Grok メモ・roadmap 双方の判断をそのまま踏襲。将来 `catalyticChemistry`/`syntheticAmmonia` で本格的な精密機器が必要になった時点で再検討する。
5. **`highPressureChemicalApparatus` の「試作年数」に専用の設備を作らず `experimentRecord`（`ExperimentalWorkshops` 由来）を転用する**。高圧装置の安全な運用は継続的な研究・実務蓄積の性質が強く、`chemicalIndustryFoundation` が同じ `experimentRecord` を `known` 閾値に使っているのと同じ発想。

## 8. 関連ドキュメント

- [docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md) — 実装順序の一次メモ（本書は「実装するならこの順」の2番目）
- [phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md) — 1番目の縦切り。`AcidPlant`/`PhosphateFertilizerPlant`/`FertilizerInvestment` の設計・実装が本書の直接のテンプレート
- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.1 — 「近代製鋼」「高圧化学装置」のノード表
- [steam-industrial-technology-history.csv](./data/steam-industrial-technology-history.csv) 行16 — `modernSteelmaking` の史実アンカー（ベッセマー法、1856年）
- [steam-industrial-implementation.md](./steam-industrial-implementation.md) Phase 4 — 「化学・電化は第二波」という実装順序の位置づけ
- [chemistry-medicine-knowledge-accumulation.md](./chemistry-medicine-knowledge-accumulation.md) §5.2, §6–8 — `AcidPlant`/`ChemistryTrial`/`ExperimentalWorkshop` の設計元
- [knowledge-guild-system.md](./knowledge-guild-system.md) — `instruments` を含む Guild Knowledge craft domain の設計元
