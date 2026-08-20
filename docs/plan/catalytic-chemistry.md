# 触媒化学 (catalyticChemistry) 実装計画

## 状態

**実装済み（2026-08-20）**。[docs/temp/foods/化学肥料.md](../temp/foods/化学肥料.md)の「実装するならこの順」3番目
（「触媒化学 — Academy / 工房の研究年数、長期予算、catalyticChemistry ノード」）を対象とする。
[modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md)（2番目、実装済み）が
明示的に本ノードのために用意した `highPressureChemicalApparatus` の直後に接続する、era 6 の技術グラフ最終ノードである。

対応する一次資料:

- [technology-development-roadmap.md](./technology-development-roadmap.md) §9.1: 「触媒化学」のノード表（前提知識 `physicalChemistry`・`laboratoryTechnique`・`Academy / corporate research`、制度「研究所、希少材料、長期投資」、効果「反応効率の飛躍、アンモニア合成の前提」）
- [modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md) §7 決定事項 4・5: `Precision Instruments` Good を導入しない判断と、`experimentRecord`（`ExperimentalWorkshops` 由来）を「試作年数」の代理に使う判断——本書はこれをそのまま踏襲する
- [chemistry-medicine-knowledge-accumulation.md](./chemistry-medicine-knowledge-accumulation.md) §4: `naturalPhilosophy` Academy domain と `ExperimentalWorkshops`（`experimentalWorkshops.ts`）の設計・実装

## 1. 目的と非目的

### 目的

- `catalyticChemistry`（era 6）を新設し、`highPressureChemicalApparatus` の先に「触媒化学」を技術グラフへ接続する。
- 新しい Good・設備・シグナルを一切追加しない。既存の `experimentRecord`（`ExperimentalWorkshops`）・`naturalPhilosophy`（Academy）・`instruments`（Guild）・`administration`・`treasury` だけで、ロードマップが要求する「研究所・長期投資」を表現する。

### 非目的（本書の範囲外）

- `syntheticAmmonia`。`catalyticChemistry` を前提の一つとして要求する後続ノードであり、水素源・窒素・大規模エネルギー・肥料流通という別の縦切りを要する。
- 触媒材料（オスミウム／ウラン／鉄触媒等）の希少鉱物 Good 化。ロードマップが「研究所、希少材料、長期投資」と併記する3要素のうち、希少材料だけは意図的に導入しない——`modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項4が `Precision Instruments` について下した「本格的な精密機器が必要になった時点で再検討する」という判断と同じ理由で、`syntheticAmmonia` 側の検討事項として残す。
- `Precision Instruments` Good の新設。既存の `instruments` craft-knowledge シグナルで代用する。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| era 6 の技術グラフ | `chemicalIndustryFoundation` → `industrialSulfuricAcid` →（`phosphateFertilizer` / `modernSteelmaking` → `highPressureChemicalApparatus`）で止まっている。`catalyticChemistry` は存在しない。 | [technologyDefinitions.ts:610-690](../../src/generators/technologyDefinitions.ts#L610-L690) |
| `experimentRecord` | `ExperimentalWorkshops.settleAnnual()` が年次で更新する 0..1 EWMA。`chemicalIndustryFoundation`・`highPressureChemicalApparatus` が既に閾値として使用している。 | [experimentalWorkshops.ts](../../src/extensions/economy/generators/experimentalWorkshops.ts)、[technologyProgress.ts:879-884](../../src/generators/technologyProgress.ts#L879-L884) |
| `naturalPhilosophy` | `AcademyKnowledgeStock` の scholarly domain。`ExperimentalWorkshops` の researchers を実践者頭数として蓄積する。`analyticalChemistry`（era 4）が既に adopted 閾値として使用。 | [academyKnowledge.ts](../../src/extensions/economy/generators/academyKnowledge.ts)、[technologyProgress.ts:494-501](../../src/generators/technologyProgress.ts#L494-L501) |
| `instruments` | `GuildKnowledgeStock` の craft domain。`ExperimentalWorkshops` が Glass/Tools を消費した年に `upsertInstruments()` で実働化。`highPressureChemicalApparatus` が既に `known` 閾値として使用。 | [experimentalWorkshops.ts:34-43](../../src/extensions/economy/generators/experimentalWorkshops.ts#L34-L43)、[technologyProgress.ts:461-482](../../src/generators/technologyProgress.ts#L461-L482) |
| 「長期投資」の年数ゲート | `TechnologyDefinition.minimumYearsAtPreviousStage`（`{ demonstrated, adopted }`）が既に実装済みの汎用機構。era 6 の全5ノード（`chemicalIndustryFoundation`〜`highPressureChemicalApparatus`）が同じ `{ demonstrated: 3, adopted: 5 }` を使う。 | [technologyTypes.ts](../../src/generators/technologyTypes.ts)、[technologyProgress.ts:1082-1125](../../src/generators/technologyProgress.ts#L1082-L1125)（`advanceStage()`/`heldLongEnough()`） |

結論として、`catalyticChemistry` が要求する基盤（研究機関・自然哲学・精密器具の実務知・年数ゲート）はすべて既に実装済みであり、本書のスコープは技術ノード定義1件の追加に限定できる。

## 3. 技術ノード: `catalyticChemistry`

```ts
{
  id: "catalyticChemistry",
  label: "Catalytic chemistry",
  era: 6,
  scope: "state",
  prerequisites: ["highPressureChemicalApparatus"],
  known: { min: { experimentRecord: 0.65, naturalPhilosophy: 0.5, instruments: 0.4, treasury: 320 } },
  demonstrated: { min: { experimentRecord: 0.7, naturalPhilosophy: 0.55, treasury: 380 } },
  adopted: { min: { experimentRecord: 0.75, naturalPhilosophy: 0.6, administration: 0.65, treasury: 450 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

- `prerequisites` は `highPressureChemicalApparatus` の1本のみ。`modern-steelmaking-and-high-pressure-apparatus.md` が「`catalyticChemistry`/`syntheticAmmonia`（将来の縦切り）が要求する」前提として明示的にこのノードを用意しているため（同書 §1 目的）、`phosphateFertilizer` を並行して要求しない——ロードマップ §9.4 の技術グラフでも `phosphateFertilizer` と `catalyticChemistry` は `industrialSulfuricAcid`/`highPressureChemicalApparatus` からの別枝として描かれている。
- 各閾値は、`highPressureChemicalApparatus` 自身の `adopted` 閾値（`experimentRecord: 0.65`・`instruments: 0.3`・`administration: 0.6`・`treasury: 290`）より高く設定する。前提ノードが `adopted` した瞬間に本ノードの `known` も自動的に満たされてしまうことを避けるためであり、`highPressureChemicalApparatus` 自身が `modernSteelmaking`(`metallurgy: 0.85`) を再掲せず新しい `steelAccess` ゲートで差別化したのと同じ設計判断である。
- `naturalPhilosophy` をロードマップの `physicalChemistry` の代理として使う。独立 domain を新設しない——`analyticalChemistry` の頃から同じ `naturalPhilosophy` ストックが積み上がり続けている前提であり、`medicine`/`administration` のような別ドメインを割り込ませて頭数源を再発明しない。
- `minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }` は era 6 の他4ノードと完全に同一の値。ロードマップが要求する「長期投資」を、この既存機構だけで表現し、新しい年数トラッカーは追加しない。

## 4. テスト計画

- `technologyProgress.test.ts`: 静的定義チェック（era・prerequisites・閾値キー・`minimumYearsAtPreviousStage`）。
- `technologyProgress.test.ts`: `explainTechnologyGate(stateId, "catalyticChemistry")` を用いた統合テスト。`economy.experimentalWorkshops`／`academyKnowledgeStocks`（`naturalPhilosophy`/`administration`）／`guildKnowledgeStocks`（`instruments`）のフィクスチャから、`known`/`demonstrated` が充足し `adopted` の `treasury` だけが未充足であることを確認する——`modernSteelmaking` の統合テストと同じ切り分け方。
- 新しい Good・設備を追加しないため、専用の facility テストファイル（`steelConverters.test.ts` 相当）は不要。

## 5. 受け入れ条件

- `highPressureChemicalApparatus` が `adopted` していない State では `catalyticChemistry` は一切進行しない（`prerequisitesMet()` により `locked` のまま停滞）。
- `highPressureChemicalApparatus` が `adopted` した瞬間に `catalyticChemistry` が自動的に `known` へ進まない(§3 の閾値差別化により)。
- 新しい Good・鉱物・設備・シグナルは一切追加しない。既存の `ExperimentalWorkshops`/Academy/Guild ストックだけで評価される。
- `npx tsc --noEmit`・`npm run build`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 6. 決定事項

1. `catalyticChemistry` の前提は `highPressureChemicalApparatus` 単独とする。`phosphateFertilizer` は並行する別枝であり、前提には含めない。
2. ロードマップの `physicalChemistry`/`laboratoryTechnique`/`Academy or corporate research` は、既存の `naturalPhilosophy`/`instruments`/`experimentRecord` シグナルへそのまま写像する。新規 domain・新規ストックは追加しない。
3. 「長期投資」は既存の `minimumYearsAtPreviousStage` 機構(`{ demonstrated: 3, adopted: 5 }`、era 6 の他ノードと同一)で表現する。
4. 触媒材料(希少鉱物)は本書のスコープでは導入しない。`syntheticAmmonia` 設計時に、実際に必要になった場合のみ再検討する。
5. 新しい Good・設備・facility モジュールは追加しない。技術ノード定義1件の追加のみで完結させる。
