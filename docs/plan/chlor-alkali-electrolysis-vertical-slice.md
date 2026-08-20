# 塩素アルカリ電解の縦切り実装計画 (Chlor-Alkali Electrolysis Vertical Slice)

## 状態

**実装済み（2026-08-20）**。[electrolytic-industry-vertical-slice.md](./electrolytic-industry-vertical-slice.md)
§7 決定事項5「塩素アルカリ電解を実装しない」判断を撤回し、本書として具体化する。

## 1. 目的と非目的

### 目的

- Salt の電解（ブライン電解: `2 NaCl + 2 H2O → Cl2 + H2 + 2 NaOH`）により `Chlorine` と `Caustic Soda` を同時
  生産する `ChlorAlkaliPlants` を新設する。両 Good にとって、craft-worker レシピに次ぐ、`Chlorine` にとっては
  `ChlorinePlants`（Deacon 法）に次ぐ「第三の供給経路」となる。
- Sulfuric Acid・Coal を一切経由しない — Salt と電力のみで完結する、史実どおりの原価構造の違いを反映する。既存の
  causticization 経路（Soda Ash 経由の多段階チェーン）や Deacon 法（Sulfuric Acid/Coal/Firebrick 依存）と比べ、
  原材料の種類数が明確に少ない。
- `electrolyticIndustry`（既存ノード）をそのまま再利用し、新しい技術ノードやシグナルは追加しない。
- `Market.electricityStock` の読み取りを `chemMedCommon.ts` の共有ヘルパーへ昇格し、2つ目の電力消費産業として
  electrolytic-industry-vertical-slice.md §7 決定事項4が予告していた共通化を実施する。

### 非目的（本書の範囲外）

- **貿易競争・雇用・外交への波及効果のシミュレーション**。本書の発端となった着想（電解法を持つ国と持たない国の
  コスト差が、貿易競争→雇用喪失→外交関係悪化という国家間関係の変化要素になり得る）は妥当だが、調査の結果
  「安価な輸入が他国の産業・雇用を駆逐する」というメカニクス自体が現状のゲームに存在しないことを確認した
  （`craftWorkers` は自国の生産サイクルから算出される値で、他国からの輸入圧力による圧迫ロジックは
  `caravans.ts`/`goodsTradeLots.ts` 等に見当たらない）。これは第三の供給経路の追加とは独立した、より大きな
  経済-外交相互作用の新設であり、別タスクの Open Question として残す。
- 新しい Good（アスベスト隔膜・水銀陰極材料など）の追加。`Firebrick` を「炉・反応槽の内張り」の既存プロキシ
  として流用する（AcidPlants/ChlorinePlants/PhosphateFertilizerPlants/ElectrolysisPlants と同じ convention）。
- `chlorine-production-vertical-slice.md` が `phosphate-fertilizer-vertical-slice.md` の内容と byte-for-byte
  一致している既知の不整合の修正。本書のスコープ外、別タスクで扱う。
- `"chlorinePlants"` が `validateEconomySlice()` に未登録という既存の欠落の修正。本書は新設する
  `"chlorAlkaliPlants"` を正しく登録するのみで、この既存ギャップは複製もしないが直しもしない。
- `electrolyticIndustry` に新しいシグナル（例: `chlorAlkaliPlantTrialYears`）を追加すること。プラント新設の
  ゲートは既存の `electrolysisPlantTrialYears`/`electrolysisPlantInstallations`（Aluminum 電解の実績）をそのまま
  流用し、技術習熟度の指標を「電解ドメイン全般の代理」として扱う。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| `Chlorine`/`Caustic Soda` の既存供給経路 | craft-worker レシピ（両 Good）＋ `ChlorinePlants`（`Chlorine` のみ、Deacon 法） | [goods-generator.ts:2692, 2780](../../src/extensions/economy/generators/goods-generator.ts#L2692), [chlorinePlants.ts](../../src/extensions/economy/generators/chlorinePlants.ts) |
| `electrolyticIndustry` ノード | 実装済み。前提 `practicalElectrochemistry`/`highPressureChemicalApparatus`/`powerGrid` | [technologyDefinitions.ts:822-832](../../src/generators/technologyDefinitions.ts#L822-L832) |
| `Market.electricityStock` の唯一の読み手 | `ElectrolysisPlants` のみ（`electrolysisPlants.ts`、`chemMedCommon.ts` に共有ヘルパーなし） | [electrolysisPlants.ts](../../src/extensions/economy/generators/electrolysisPlants.ts) |
| co-product（1回の反応で2つの named Good に `addNamedStock`）の先例 | 存在しない — 本書が最初 | 全 `addNamedStock` 呼び出し箇所の grep で確認済み |
| 出力ゲートを `worldHasXxx()` で個別に持つ先例 | `AcidPlants`/`PhosphateFertilizerPlants`/`ChlorinePlants` は持つが、`ElectrolysisPlants` は持たない（`Aluminum` の `requiredTechnology` が電解工業ノード自身と同一のため） | acidPlants.ts, phosphateFertilizerPlants.ts, chlorinePlants.ts, electrolysisPlants.ts |
| `Chlorine`/`Caustic Soda` の `requiredTechnology` | `Chlorine`: `catalyticChemistry`。`Caustic Soda`: `chemicalIndustryFoundation`。いずれも `electrolyticIndustry` の前提には含まれない | [goods-generator.ts:2699, 2790](../../src/extensions/economy/generators/goods-generator.ts#L2699) |

## 3. 設計

### 3.1 概念モデル

```
Salt (0.5) + Firebrick (0.05) + Market.electricityStock coverage
        ↓  ChlorAlkaliPlants.settleAnnual()（electrolyticIndustry >= known でプラント稼働）
        ├─→ Chlorine (0.15 trial / 0.6 service)      … catalyticChemistry >= demonstrated の年のみ加算
        └─→ Caustic Soda (0.17 trial / 0.68 service)  … chemicalIndustryFoundation >= demonstrated の年のみ加算
```

反応そのもの（utilization・documentedRuns）は `electrolyticIndustry` の稼働ゲートのみで進む。しかし2つの
出力は、それぞれの Good が既存の `requiredTechnology` で要求する世界規模の化学知識（`catalyticChemistry`／
`chemicalIndustryFoundation`）が別途 demonstrated していなければ市場在庫に反映されない — **co-product だが
両出力ゲートは非対称**という、このコードベースで初めての設計になる。`ElectrolysisPlants`（Aluminum）が唯一
ゲートなしで出力できるのは、`Aluminum` の `requiredTechnology` がプラント自身のゲート技術（`electrolyticIndustry`）
と偶然一致しているためであり、一般則ではない。

### 3.2 型: `ChlorAlkaliPlant`（`electrolysisTypes.ts`）

`ElectrolysisPlant` と同じ最小形（`ChemistryTrial` を経由しない電解ドメインの特例）。`ElectrolysisFailureReason`
型をそのまま再利用し、専用の型を新設しない（3つの失敗モードが両者で意味的に同一のため）。

### 3.3 予算定数: `CHLOR_ALKALI_PLANT_BUDGET`（`chemMedCommon.ts`）

`34` — `STEEL_CONVERTER_PLANT_BUDGET`(32) と `POWER_STATION_BUDGET`(36) の間、`CHLORINE_PLANT_BUDGET`(26) より上。
史実ではトン当たり電力消費が Hall-Héroult アルミニウム還元（~13-15 MWh/t Al）よりずっと小さく
（塩素アルカリ ~2.5-3.5 MWh/t Cl2）、高温浴も炭素電極消費も不要なため、`ELECTROLYSIS_PLANT_BUDGET`(42、現在の
上限) より明確に軽い。

### 3.4 共有ヘルパー昇格: `electricityCoverageForMarket`（`chemMedCommon.ts`）

`electrolysisPlants.ts` にインライン実装されていたものを `chemMedCommon.ts` へ昇格し、両モジュールがそこから
import する形にした。

### 3.5 State資本設備: `ChlorAlkaliPlants`（`chlorAlkaliPlants.ts`）

`electrolysisPlants.ts` と同型の `settleAnnual()`。`electrolyticIndustry` stage >= `known` でプラント新設・
稼働、`CHLOR_ALKALI_PLANT_BUDGET` で新設・年次維持費を徴収。入力は `Salt 0.5` + `Firebrick 0.05`
（`ChlorinePlants` と同じ桁数）。`materialCoverage`/`powerCoverage`/`coverage` の算出は `ElectrolysisPlants` と
同じ `Math.min` パターン。utilization >= 0.5 の年は `documentedRuns` を進め、`worldHasCatalyticChemistry()`／
`worldHasChemicalIndustryFoundation()`（`chlorinePlants.ts`/`acidPlants.ts` と同型の local ヘルパー）で個別に
ゲートされた `addNamedStock` を `Chlorine`/`Caustic Soda` それぞれに対して呼ぶ。

### 3.6 セーブ互換性（`economyContext.ts` / `extensionStateSlices.ts`）

`ElectrolysisPlant` と同型の getter/setter ペア（`getChlorAlkaliPlants`/`setChlorAlkaliPlants`）と年次ガード
（`getChlorAlkaliPlantsLastSettledYear`/`setChlorAlkaliPlantsLastSettledYear`、フォールバック変数を
`clearEconomyContext()` のリセットブロックにも追加）。`validateEconomySlice()` の `assertOptionalArrayField`
ループに `"chlorAlkaliPlants"` を登録。新設 Good はないため Good 移行関数は不要 — `getSliceArray` は未存在の
スライスキーに対し `[]` を返すため、旧セーブでも安全に初期化される。

### 3.7 `index.tsx` 呼び出し順序

`ElectrolysisPlants.settleAnnual()` の直後、`settleChemMedPracticeDecay()` の前に配置。`AcidPlants`/
`ChlorinePlants` の出力に依存せず、`Market.electricityStock`（`PowerGridInvestment` が同一年次ティック内で
先に書き込み済み）を読む点で `ElectrolysisPlants` と同じ「era-6 独立プラント群」の一員。`ChlorinePlants` および
craft-worker レシピと同じ `Salt` Good を奪い合う点はモデリング上の注記に留め、ブロッカーとしない。

## 4. Phase分割

本書は実装を1コミットにまとめる（他の縦切りと同じ記述形式）。

## 5. テスト計画

`chlorAlkaliPlants.test.ts`（`electrolysisPlants.test.ts` のセットアップを踏襲）:

1. `known` 未満ではプラントが作られない。
2. 正常系: `electrolyticIndustry` known + `catalyticChemistry`/`chemicalIndustryFoundation` 両方 demonstrated
   → Salt/Firebrick 消費、Chlorine+Caustic Soda が同一呼び出し内で共に加算され、比率が概ね 1:1.13。
3. **非対称ゲート**: `catalyticChemistry` が未達のまま `chemicalIndustryFoundation` のみ demonstrated →
   utilization/documentedRuns は進むが Chlorine 在庫は0のまま、Caustic Soda のみ加算される。
4. 原料不足で `materialShortage`、両出力とも0。
5. 電力不足で `powerShortage`、両出力とも0。
6. 財源不足で `fundingCut`。
7. `adopted` 昇格で trial→service の産出量が4倍にスケール。
8. 同年内の二重呼び出しは `false` を返す（自己ゲート）。

## 6. 受け入れ条件

- `electrolyticIndustry` が `known` 未満の州はプラントを持たない。
- `Chlorine`/`Caustic Soda` はそれぞれ独立した `worldHasXxx()` ゲートを通過して初めて市場在庫に反映される。
- 両ゲートが同時に開いている年は、両方の `addNamedStock` が同一の `settleAnnual()` 呼び出し内で発火する
  （比率 ~1:1.13）。
- 既存セーブ（`chlorAlkaliPlants` 配列を持たない旧セーブ）をロードしても、既存 Good の id がずれず、
  新規配列が空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 7. 決定事項 / Open Questions

1. `electrolysisTypes.ts` を拡張し、`chlorAlkaliTypes.ts` を新設しない — 両者は同じ「電解ドメイン、
   `ChemistryTrial` 非経由」の型なため。
2. `ChlorAlkaliFailureReason` を新設せず `ElectrolysisFailureReason` を再利用する。
3. 出力ゲートは `worldHasCatalyticChemistry`/`worldHasChemicalIndustryFoundation` の2つを個別に持つ
   （`ElectrolysisPlants` の無ゲート方式ではなく、`AcidPlants`/`PhosphateFertilizerPlants`/`ChlorinePlants` の
   方式を踏襲）。
4. `electrolyticIndustry` をそのまま技術ゲートとして再利用し、新しい技術ノード（例:
   「塩素アルカリ電解」独立ノード）は新設しない — electrolytic-industry-vertical-slice.md §7 決定事項1
   （前提が重複するノードを独立させない）と同じ判断。
5. **貿易競争・雇用・外交への波及効果は別タスクのフォローアップとする**。今回の実装は「電解法という第三の
   供給経路が存在すること」自体の実現に留め、その供給経路の存在が国家間関係にどう影響するかは、現状ゲームに
   存在しない貿易競争メカニクス自体の新設を要する、より大きな独立タスクである。

## 8. 関連ドキュメント

- [electrolytic-industry-vertical-slice.md](./electrolytic-industry-vertical-slice.md) — §7 決定事項4・5を
  本書が改訂。`ElectrolysisPlant`/`electricityCoverageForMarket`/`electrolyticIndustry` の直接のテンプレート
- [chlorine-production-vertical-slice.md](./chlorine-production-vertical-slice.md) — 実際には
  `phosphate-fertilizer-vertical-slice.md` の複製になっている既知の内容不整合（本書のスコープ外、別タスク）
- [modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md) —
  `ChemistryTrial` を経由しない電解/冶金ドメインの特例（§7 決定事項2）の初出
