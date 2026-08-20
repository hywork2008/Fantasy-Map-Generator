# ロケット・宇宙開発の縦切り実装計画 (Rocket and Space Development Vertical Slice)

## 状態

**実装済み（2026-08-20）**。[technology-development-roadmap.md](./technology-development-roadmap.md) §11（L352-366）と
実装順序 Phase 8（L496-500）を対象に、era 8 の5つの `TechnologyDefinition`
（`militarySignalRockets` / `rocketDynamicsAndHighTemperatureCombustionResearch` /
`liquidPropulsionAndTestFacilities` / `guidanceAndAttitudeControl` / `stagingAndOrbitalInsertion`）を実装する。
これにより roadmap §0 の状態表「Phase 1–7 実装済み」が「Phase 1–8 実装済み（全分野）」に更新され、ロードマップ全体が完成する。

## 1. 目的と非目的

### 目的

- roadmap §11 の5行すべてを `TechnologyDefinition`（era 8）として実装する。
- roadmap 決定事項13「ロケットと宇宙開発は、火薬ロケットから直接の上位解禁にせず、推進・制御・試験・精密材料・大規模組織を
  必要とする別段階とする」を、グラフ構造そのもので表現する — `militarySignalRockets`（火薬ロケット）は他のどのノードの
  `prerequisites` にも現れない独立した葉ノードとし、高性能ロケット系列（`rocketDynamics...` 以降）は
  `mathAstronomyGeography`/`electricalExperiments`/`highPressureChemicalApparatus` という、火薬とは無関係な学術・工業系列
  からのみ派生させる。
- roadmap §11 が明記する「試験場、材料産業、電力、石油化学、精密工業、誘導電子機器がなければ adopted には進めない」を、
  既存の era 6/7 の資本設備・市場在庫カバレッジ信号（`powerGrid`、`oilRefiningAndFractionation`/`refinedFuelAccess`、
  `electrolyticIndustry`、`electricTelegraph`/`copperWireAccess`）への `prerequisites`/閾値参照として表現する — 新しい
  「ロケット試験施設」プラントや新しい燃料・酸化剤 Good は追加しない（§1 非目的、§3.1 参照）。
- `militarySignalRockets`（限定的な信号・軍事用途）と `stagingAndOrbitalInsertion`（人工衛星・宇宙機の打上げ候補）の
  2つの「結果」を持つノードにのみ、`getInternalCombustionEngineEffect`/`getAtmosphericSteamDrainageBonus` と同型の
  0..1 効果クエリ関数を公開する。中間ノード（`rocketDynamics...`/`liquidPropulsion...`/`guidanceAndAttitudeControl`）は
  次ノードの前提としてのみ機能し、それ自体の効果クエリは持たない — roadmap 自身がこれらの行の「結果」欄を
  「高性能推進の設計候補」「大型液体ロケットの実証」「制御可能な長距離ロケット」という、外部システムが直接消費する
  数値ではなく次ノードへの積み上げとして記述しているため。

### 非目的（本書の範囲外）

- 新しい Good・State資本設備プラント・`TechnologySignals` フィールドの追加。roadmap §11 の資源・設備列
  （「精製燃料・酸化剤」「耐熱材料」「センサー・通信」「大規模製造・発射場・追跡網」）は、既存の
  `refinedFuelAccess`（Kerosene 市場在庫カバレッジ）、`steelAccess`/`copperWireAccess`/`instruments`、
  `electricityCoverage`、`administration`/`treasury` の閾値としてのみ表現する。§2 で詳述するとおり、era 6/7 で
  `catalyticChemistry`（新規プラントなしの純粋な知識収束ノード）という先例が既に存在するため、この縦切り全体を
  同じパターンで完結させる。
- `getMilitarySignalRocketsEffect()`/`getStagingAndOrbitalInsertionEffect()` の消費先の実装。roadmap §11 末尾が
  明記する「宇宙開発の初期効果は、通信・観測・地図・威信などの民生的／科学的効果に分離して設計する。戦略兵器としての
  効果を導入する場合は、別途の外交・軍事・安全保障設計で扱い、本書の技術進行から自動的には与えない」という決定を
  そのまま守り、`getAtmosphericSteamDrainageBonus()`/`getInternalCombustionEngineEffect()` が現在もどこからも
  呼ばれていないのと同じ「未接続の効果クエリ関数」として公開するに留める。
- `militarySignalRockets` を火薬・信号システム（現在存在しない）へ接続すること。ノード自体（発見・実証・採用の進行、
  閾値ゲート）のみを完成させ、消費先は次タスクに委ねる。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 新規プラントを伴わない純粋な知識収束ノードの先例 | `catalyticChemistry`（era 6）は `highPressureChemicalApparatus` を唯一の前提とし、新しい Good・プラント・シグナルを一切追加せず、既存の `experimentRecord`/`naturalPhilosophy`/`instruments`/`administration`/`treasury` と `minimumYearsAtPreviousStage` だけで「研究所、希少材料、長期投資」という roadmap の前提列を表現している。 | [technologyDefinitions.ts:744-763](../../src/generators/technologyDefinitions.ts#L744-L763) |
| 複数前提の合流ノードが、各前提自身の adopted 閾値の最大値より高い閾値を課すパターン | `highPressureChemicalApparatus`（modernSteelmaking + industrialSulfuricAcid）、`electrolyticIndustry`（practicalElectrochemistry + highPressureChemicalApparatus + powerGrid）がいずれもこの形。 | [technologyDefinitions.ts:733-743](../../src/generators/technologyDefinitions.ts#L733-L743)、[technologyDefinitions.ts:876-886](../../src/generators/technologyDefinitions.ts#L876-L886) |
| 「未接続の効果クエリ関数」の先例 | `getAtmosphericSteamDrainageBonus()`/`getInternalCombustionEngineEffect()` はいずれも `technologyProgress.ts` からエクスポートされているが、リポジトリ全体を検索しても呼び出し元は自身の定義のみ。 | [technologyProgress.ts:192-194](../../src/generators/technologyProgress.ts#L192-L194)、[technologyProgress.ts:216-222](../../src/generators/technologyProgress.ts#L216-L222) |
| 火薬系ノードが他系列から独立した葉になっている先例 | `navalGunnery`（era 3）は `gunpowderWorld` と `shipbuildingWorld` の両方を worldGates に持つが、どのノードの `prerequisites` にも現れない — 独立した「結果」ノードとして扱われている。`militarySignalRockets` も同型。 | [technologyDefinitions.ts:360-370](../../src/generators/technologyDefinitions.ts#L360-L370) |
| `TechnologyEraBand` の上限 | `0 \| 1 \| 2 \| ... \| 7` — era 8 はまだ型に存在しない。 | [technologyTypes.ts:17](../../src/generators/technologyTypes.ts#L17) |
| Technology Overview の era フィルタ | `ERA_OPTIONS` が `[0, 1, 2, 3, 4, 5, 6, 7]` に固定配列でハードコードされている。`dialogs.technology.eras.${era}` キーで en/ja ロケールを参照する。 | [TechnologyOverviewDialog.tsx:33](../../src/ui/dialogs/TechnologyOverviewDialog.tsx#L33) |

結論として、本書が実質的に新しいのは「①火薬ロケットを既存の火薬系列から切り離した独立ノードとして追加する、
②`mathAstronomyGeography`/`electricalExperiments`/`highPressureChemicalApparatus` という異なる3系列を単一ノードへ収束させる、
③`TechnologyEraBand`/`ERA_OPTIONS`/ロケール `eras` キーに 8 を追加する」の3点に限定される。State資本設備・新規 Good・
新規シグナルは一切追加しない。

## 3. 設計

### 3.1 概念モデル

```text
既存の火薬系列（era 2、gunpowderWorld ゲート）:
  artilleryTactics（既存、砲兵術）
  mechanicalWorkshops（既存、木工／機械工房）
        │
        ▼
  militarySignalRockets（新規、era 8、worldGates: gunpowderWorld）
    限定的な信号・軍事用途。どのノードの prerequisites にも現れない独立した葉。
    roadmap 決定事項13「火薬ロケットから直接の上位解禁にせず」を、グラフ上でそのまま表現する。

既存の学術・工業系列（era 1/6、gunpowderWorld と無関係）:
  mathAstronomyGeography（既存、数学・天文・地理）
  electricalExperiments（既存、physics/mathematics/Academy Knowledge）
  highPressureChemicalApparatus（既存、chemicalEngineering/thermodynamics/precisionMachining の代理）
        │ (advancedMathematics/physics/thermodynamics/Academy Knowledge の代理)
        ▼
  rocketDynamicsAndHighTemperatureCombustionResearch（新規、era 8。知識収束のみ、Good ゲートなし）
        │
        ▼
  liquidPropulsionAndTestFacilities（新規、era 8）
    + oilRefiningAndFractionation（精製燃料・酸化剤の代理 = refinedFuelAccess）
    + powerGrid（大電力の代理 = electricityCoverage）
        │
        ▼
  guidanceAndAttitudeControl（新規、era 8）
    + electricTelegraph（センサー・通信・電気工学の代理 = copperWireAccess/instruments）
        │
        ▼
  stagingAndOrbitalInsertion（新規、era 8）
    + electrolyticIndustry（軽量構造材の代理 — roadmap §9.4 が Aluminum を「航空、後続の宇宙機器の材料選択肢」と
      明記済み）
    結果: 人工衛星・宇宙機の打上げ候補
```

`militarySignalRockets` が独立した葉である理由は roadmap 自身の決定事項13に加え、§11 本文の「初期の火薬ロケットは
Stage 2 の pyrotechnics から派生しうるが、長距離・高性能のロケット、さらに人工衛星を目指すには…」という記述が、
火薬ロケットを高性能ロケット系列の *前提* ではなく *並行した別の枝* として扱っていることによる。

### 3.2 新規シグナル・新規 Good・新規プラント: なし

roadmap §11 の資源・設備列は、以下のとおりすべて既存シグナルへ再割当てする。新しい `TechnologySignals` フィールドは
追加しない（`emptySignals()`/`buildStateSignals()`/`COUNT_SIGNAL_KEYS`/`AMOUNT_SIGNAL_KEYS` への変更は不要）。

| roadmap の前提 | 代理シグナル／代理ノード | 既存の使用例 |
| --- | --- | --- |
| advancedMathematics、physics、thermodynamics、Academy Knowledge | `mathAstronomyGeography` + `electricalExperiments` + `highPressureChemicalApparatus`（prerequisites） | `oilRefiningAndFractionation` が同じ `highPressureChemicalApparatus` を thermodynamics/precisionMachining の代理として使用済み |
| 精製燃料・酸化剤 | `refinedFuelAccess`（Kerosene 市場在庫カバレッジ） | `internalCombustionEngine` の known/demonstrated/adopted |
| 大電力 | `electricityCoverage` + `powerGrid`（prerequisites） | `electrolyticIndustry` の known/demonstrated/adopted |
| センサー、通信、計算装置 | `instruments` + `copperWireAccess` + `electricTelegraph`（prerequisites） | `guidanceAndAttitudeControl` 自身が新規に組み合わせる（既存シグナルの新しい組み合わせ） |
| 軽量構造材（lightweightStructures） | `electrolyticIndustry`（prerequisites） — roadmap §9.4 が Aluminum を明記 | `stagingAndOrbitalInsertion` 自身が新規に使用 |
| 大規模製造、発射場、追跡網、国家計画（systemsEngineering） | `administration`/`treasury` の高閾値 + 長い `minimumYearsAtPreviousStage` | `electrolyticIndustry`/`powerGrid` と同じ「administration/treasury の高閾値 + 待機年数」パターン |
| 試験場・研究所・長期投資（"trial years" 相当） | `experimentRecord`（ExperimentalWorkshops）+ `minimumYearsAtPreviousStage` | `catalyticChemistry` が同じ理由で専用装置を新設せず `experimentRecord` を流用済み（§7 決定事項5 の踏襲） |

### 3.3 技術ノード（era 8、5件）

`technologyDefinitions.ts` に新規 `ERA_8` 配列を追加する。各ノードの `known` 閾値は、直前の全 `prerequisites` の
`adopted` 閾値の最大値より高く設定し、前提が `adopted` になった瞬間に自動通過しないようにする（既存の
`highPressureChemicalApparatus`/`electrolyticIndustry` と同じ規律）。

```ts
{
  id: "militarySignalRockets",
  label: "Military and signal powder rockets",
  era: 8,
  scope: "state",
  prerequisites: ["artilleryTactics", "mechanicalWorkshops"],
  worldGates: ["gunpowderWorld"],
  known: { min: { pyrotechnics: 0.65, woodworking: 0.5, treasury: 70 } },
  demonstrated: { min: { pyrotechnics: 0.7, gunpowderDemand: 3.5, treasury: 110 }, flags: { atWar: true } },
  adopted: { min: { pyrotechnics: 0.75, gunpowderDemand: 4, administration: 0.45, treasury: 150 } },
  minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
},
{
  id: "rocketDynamicsAndHighTemperatureCombustionResearch",
  label: "Rocket dynamics and high-temperature combustion research",
  era: 8,
  scope: "state",
  prerequisites: ["mathAstronomyGeography", "electricalExperiments", "highPressureChemicalApparatus"],
  known: { min: { experimentRecord: 0.68, naturalPhilosophy: 0.58, instruments: 0.4, treasury: 320 } },
  demonstrated: { min: { experimentRecord: 0.72, naturalPhilosophy: 0.62, treasury: 400 } },
  adopted: { min: { experimentRecord: 0.78, administration: 0.65, treasury: 480 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
},
{
  id: "liquidPropulsionAndTestFacilities",
  label: "Liquid propulsion and rocket test facilities",
  era: 8,
  scope: "state",
  prerequisites: ["rocketDynamicsAndHighTemperatureCombustionResearch", "oilRefiningAndFractionation", "powerGrid"],
  known: { min: { refinedFuelAccess: 0.35, electricityCoverage: 0.38, treasury: 560 } },
  demonstrated: { min: { refinedFuelAccess: 0.42, electricityCoverage: 0.42, administration: 0.7, treasury: 650 } },
  adopted: { min: { refinedFuelAccess: 0.48, electricityCoverage: 0.46, administration: 0.74, treasury: 750 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
},
{
  id: "guidanceAndAttitudeControl",
  label: "Guidance and attitude control",
  era: 8,
  scope: "state",
  prerequisites: ["liquidPropulsionAndTestFacilities", "electricTelegraph"],
  known: { min: { copperWireAccess: 0.4, instruments: 0.55, treasury: 800 } },
  demonstrated: { min: { copperWireAccess: 0.45, instruments: 0.6, administration: 0.76, treasury: 900 } },
  adopted: { min: { copperWireAccess: 0.5, instruments: 0.65, administration: 0.8, treasury: 1000 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
},
{
  id: "stagingAndOrbitalInsertion",
  label: "Multi-stage rockets and orbital insertion",
  era: 8,
  scope: "state",
  prerequisites: ["guidanceAndAttitudeControl", "electrolyticIndustry"],
  known: { min: { administration: 0.82, experimentRecord: 0.82, treasury: 1100 } },
  demonstrated: { min: { administration: 0.85, experimentRecord: 0.85, treasury: 1300 } },
  adopted: { min: { administration: 0.88, experimentRecord: 0.88, treasury: 1600 } },
  minimumYearsAtPreviousStage: { demonstrated: 4, adopted: 6 }
}
```

`militarySignalRockets` の `demonstrated` は `artilleryTactics`/`navalGunnery` と同じ `flags: { atWar: true }` +
`WAR_OPTIONAL_TREASURY` 代替パターンを踏襲する（戦時でなくとも治安予算が十分なら進行できる）。

`technologyTypes.ts` の `TechnologyEraBand` に `8` を追加する。

### 3.4 効果クエリ関数（2件、いずれも未接続）

`technologyProgress.ts` に `getInternalCombustionEngineEffect` と同型の関数を追加する。roadmap §11 の「結果」欄を
持つ2ノード（葉ノードの `militarySignalRockets` と、系列の終点である `stagingAndOrbitalInsertion`）にのみ与える。
中間ノード（`rocketDynamicsAndHighTemperatureCombustionResearch`/`liquidPropulsionAndTestFacilities`/
`guidanceAndAttitudeControl`）は次ノードの前提としてのみ機能するため、専用の効果クエリは持たない。

```ts
export function getMilitarySignalRocketsEffect(stateId: number): number {
  const stage = getTechnologyStage("militarySignalRockets", stateId);
  if (stage === "diffused") return 1;
  if (stage === "adopted") return 0.75;
  if (stage === "demonstrated") return 0.35;
  return 0;
}

export function getStagingAndOrbitalInsertionEffect(stateId: number): number {
  const stage = getTechnologyStage("stagingAndOrbitalInsertion", stateId);
  if (stage === "diffused") return 1;
  if (stage === "adopted") return 0.75;
  if (stage === "demonstrated") return 0.35;
  return 0;
}
```

### 3.5 Technology Overview / ロケール

`TechnologyOverviewDialog.tsx` の `ERA_OPTIONS` に `8` を追加する。`src/i18n/locales/en.json`/`ja.json` の
`dialogs.technology.eras` に `"8": "8 Rocketry and space"` / `"8": "8 ロケット・宇宙開発"` を追加する。
`eraColTip`（既に era 7 追加時にも更新されていなかった説明文）を「成熟中世（0）からロケット・宇宙開発（8）までの帯」
へ合わせて更新する。

### 3.6 セーブ互換性

新しい Good・配列・シグナルフィールドを追加しないため、既存セーブへの移行処理は不要。新しい `TechnologyDefinition`
5件は次回の `settleTechnologyAnnual()` で `seedTechnologyStartProfile()` により自動的に `locked` から seed される
（`petroleumGeologyAndExploration` 等、era 7 追加時と同じ挙動）。

## 4. テスト計画

- `technologyProgress.test.ts`: 5ノードの era・prerequisites・閾値キーの静的チェック。
  `rocketDynamicsAndHighTemperatureCombustionResearch` が `mathAstronomyGeography`/`electricalExperiments`/
  `highPressureChemicalApparatus` の3つすべてが `adopted` になるまで一切進行しないこと。`militarySignalRockets` が
  他のどのノードの `prerequisites` にも現れないこと（`stagingAndOrbitalInsertion` まで含む era-8 全ノードの
  `prerequisites` を走査して確認）。`getMilitarySignalRocketsEffect`/`getStagingAndOrbitalInsertionEffect` の
  ステージ別の値。
- `technologyTypes.ts`/`technologyDefinitions.ts` の型チェック（`npx tsc --noEmit`）で `TechnologyEraBand` に `8` が
  通ること。
- `technologyOverview.test.ts`（既存があれば）: era 8 の行が一覧に含まれること。

## 5. 受け入れ条件

- `militarySignalRockets` は `gunpowderWorld` が無効な世界では生成されない（既存の `getActiveTechnologyDefinitions`
  による worldGates フィルタがそのまま適用される）。
- `militarySignalRockets` が `adopted`/`diffused` に達しても、`rocketDynamicsAndHighTemperatureCombustionResearch`
  以降のどのノードも進行しない — 火薬ロケットは高性能ロケット系列の前提に含まれない。
- `rocketDynamicsAndHighTemperatureCombustionResearch` は `mathAstronomyGeography`・`electricalExperiments`・
  `highPressureChemicalApparatus` のすべてが `adopted` になるまで `known` にすら進まない。
- `liquidPropulsionAndTestFacilities`/`guidanceAndAttitudeControl`/`stagingAndOrbitalInsertion` は、それぞれの
  `prerequisites` すべてが `adopted` になるまで進行しない。
- `stagingAndOrbitalInsertion` が `adopted` になっても、新しい Good・State資本設備・市場在庫は一切変化しない
  （効果クエリ関数は公開されるが未接続のまま）。
- 既存セーブ（era 8 の進捗行を持たない旧セーブ）をロードしても、次回の年次評価で新規5ノードが `locked` から
  安全に seed される。
- `npx tsc --noEmit`・`npm run lint`・関連ユニットテストがすべて通過する。

## 6. 決定事項 / Open Questions

1. **`militarySignalRockets` は他のどのノードの前提にもしない**。roadmap 決定事項13「火薬ロケットから直接の上位解禁に
   せず」をグラフ構造そのもので表現するため。
2. **新しい Good・State資本設備プラント・`TechnologySignals` フィールドを追加しない**。`catalyticChemistry`
   （§2 参照）という「新設備なしの知識収束ノード」の先例を、5ノード全体に一貫して適用する。
3. **`getMilitarySignalRocketsEffect()`/`getStagingAndOrbitalInsertionEffect()` の消費先を実装しない**。roadmap
   §11 末尾の「戦略兵器としての効果を…本書の技術進行から自動的には与えない」という決定を守り、
   `getAtmosphericSteamDrainageBonus()`/`getInternalCombustionEngineEffect()` と同じ「未接続の効果クエリ関数」に
   留める。
4. **中間3ノード（`rocketDynamics...`/`liquidPropulsion...`/`guidanceAndAttitudeControl`）には効果クエリ関数を
   持たせない**。roadmap 自身がこれらの「結果」を次ノードへの積み上げとして記述しており、外部システムが直接
   消費する数値として書かれていないため。
5. **`stagingAndOrbitalInsertion` の前提に `electrolyticIndustry` を採用する**。roadmap §9.4 が Aluminum を
   「航空、後続の宇宙機器の材料選択肢」と明記済みであり、新しい「軽量構造材」ノードを新設する理由がない。
