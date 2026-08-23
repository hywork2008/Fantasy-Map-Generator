# 発電・送電・電信 実装計画 (Electric Power Generation, Transmission & Telegraph)

## 状態

**実装済み（2026-08-20）、地図レイヤー表示を追加（2026-08-23、§3.14）**。[technology-development-roadmap.md](./technology-development-roadmap.md) L134「6. 電化・近代化学」の
era 表と、§9.3「電力・電気化学」（L279-291）のノード表を対象に、発電・送電・電信を実際の `TechnologyDefinition` /
State資本設備 / 市場カバレッジへ落とし込む。era 6 の技術グラフは
[synthetic-ammonia-vertical-slice.md](./synthetic-ammonia-vertical-slice.md) の `syntheticAmmonia` で一度完結しており
（[technologyDefinitions.ts:609-730](../../src/generators/technologyDefinitions.ts#L609-L730)、`chemicalIndustryFoundation` →
… → `catalyticChemistry` → `syntheticAmmonia`)、本書はそこに合流しない独立枝として `electricalExperiments` から生える
5ノードを追加する（§3.1）。

対応する一次資料:

- [technology-development-roadmap.md](./technology-development-roadmap.md) L126-136 の era 表: 「6. 電化・近代化学 |
  鋼、発電、送電、電解、硫酸・化学肥料 | 重工業、電気工学、化学工学、国家／企業研究 | …」
- 同 §9.3「電力・電気化学」(L279-291) のノード表5行: 「電気と磁気の実験」「実用電池・電気計測」「発電機・電動機」
  「送電網・電力事業」「電解工業」。電解工業（アルミニウム）は §9.4 の範囲であり本書の非目的（§1）。
- 同 L285「電池・電信・発電機の原理を known にする」— 電信 (telegraph) はこの1行にしか現れず、独立ノードとして
  表化されていない。本書はこれを一次資料として `electricTelegraph` ノードへ具体化する（§1 目的、§3.6）。
- [steam-industrial-goods-and-technology-chain.md](./steam-industrial-goods-and-technology-chain.md) §3.5, §4:
  `Copper Wire`/`Generator`/`Electricity` の Good・容量サービス区分と技術グラフ断片
  `precisionInstrumentMaking → generatorAndMotor → powerGrid`。本書は `generatorAndMotor`/`powerGrid` という
  ノード名をそのまま踏襲しつつ、実装済みコードの実際のパターン（§2）に合わせて設計を具体化する。
- [steam-industrial-technology-history.csv](./data/steam-industrial-technology-history.csv) 行13: `electricalEngineering`、
  Electric telegraph、1837年、Morse。「Copper wire is both a communications input and a prerequisite for later power
  systems」— 電信が発電機・送電網より歴史的に先行し、銅線を共有する入力である根拠。

## 1. 目的と非目的

### 目的

- `technology-development-roadmap.md` §9.3 の5ノードのうち、電解工業（アルミニウム、§9.4 の範囲）を除く4ノードを
  `TechnologyDefinition` として実装する: `electricalExperiments`（電気と磁気の実験）、`practicalElectrochemistry`
  （実用電池・電気計測）、`generatorAndMotor`（発電機・電動機）、`powerGrid`（送電網・電力事業）。
- 電信を、roadmap の1行の言及（L285）から独立した技術ノード `electricTelegraph`（電信網）へ具体化する。史実
  （CSV行13、Morse 1837年）に合わせ、`generatorAndMotor`/`powerGrid` より前に、電池（`practicalElectrochemistry`）
  だけを前提として解禁する — 発電機・送電網が無くても電信は機能する。
- `Copper Wire` を新しい中間 Good として追加する。`electricalExperiments` の唯一の Good 出力であり、電信の建設材
  （§3.9）と発電機の建設材（§3.9）の両方が消費する、共有された川上ボトルネックにする（CSV行13の一次資料どおり）。
- `Electricity` を、[steam-industrial-goods-and-technology-chain.md](./steam-industrial-goods-and-technology-chain.md)
  §9 決定事項9・roadmap §9.3 の方針どおり、市場在庫 Good ではなく `Market.electricityStock`（0..1 EWMA の容量カバレッジ）
  として実装する。`FertilizerInvestment`/`NitrogenFertilizerInvestment` と全く同じ「State/Market資金の投資 →
  0..1 飽和ストック」パターンを転用する（§3.10）。
- 発電・送電・電信という3つの技術ノード群それぞれに、技術フラグだけでは発生しない、実際に検証可能な最小限の効果を
  1つずつ与える: 発電設備の稼働が `instruments` Guild Knowledge を押し上げる（§3.11）、`powerGrid` の採用が電力
  カバレッジを単一 Burg から State 全体のプールへ広げる（§3.10）、`electricTelegraph` の採用がその State の技術
  普及速度（`diffusion`）を押し上げる（§3.12）。

### 非目的（本書の範囲外）

- 電解工業・アルミニウム・水銀（roadmap §9.4-9.5）。`Electricity` を大口消費する産業は、電力網そのものが存在しない
  今は導入する対象がなく、`electricityStock` という新しいカバレッジ指標だけを用意して次の縦切りに委ねる。
- 水力発電。CSVにも roadmap にも水力固有の史実アンカーが薄く、`PowerStation` の燃料は石炭のみに限定する（§3.9,
  §7 決定事項1）。将来 `waterAndWindMills`（開始時に普及済み、[technology-development-roadmap.md](./technology-development-roadmap.md)
  L103）や河川立地と接続する水力発電は、別の縦切りで追加する。
- `Generator` を購入可能な資本 Good として市場に追加すること。[steam-industrial-goods-and-technology-chain.md](./steam-industrial-goods-and-technology-chain.md)
  §3.5 の構想と異なり、現在実装済みの `SteelConverterPlant`/`SteamInstallation` はいずれも「資本 Good を購入して
  設置する」パターンを一度も使っていない（§2 監査）。本書もこの実装済みパターンを踏襲し、`Generator` Good は
  新設しない（§7 決定事項2）。
- 電信の効果を Nobility の諜報・外交システム（`IntelligenceReport`/`StrategicGoal`、
  [simulationContext.ts:237-255](../../src/context/simulationContext.ts#L237-L255)）へ接続すること。クロス拡張の
  結合を増やさず、host が既に所有する `TechnologyProgress.diffusion` の伸び率だけを対象にする（§3.12, §7 決定事項3）。
- 送電網を地理的な線・変電所ネットワークとしてシミュレートすること。`powerGrid` の adopted 前後で「同一 Burg のみ」
  から「同一 State 全体のプール」へ切り替える2段階の抽象化に留める（§3.10）。
- 照明・電動機による世帯厚生・工場生産性への直接倍率。roadmap §9.3 の「結果」欄が挙げる用途のうち、本書は
  `instruments` への波及だけを実装し、他の消費先は具体的な次タスクが決まってから設計する — 推測に基づく将来要件は
  作らず、roadmap §9.4 のアルミニウムのような、具体的に計画された次タスクが出た時点で消費先を追加する。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| era 6 の技術グラフの現在の終端 | `chemicalIndustryFoundation` → `industrialSulfuricAcid` →（`phosphateFertilizer` / `modernSteelmaking` → `highPressureChemicalApparatus`）→ `catalyticChemistry` → `syntheticAmmonia` まで実装済み。 | [technologyDefinitions.ts:609-730](../../src/generators/technologyDefinitions.ts#L609-L730) |
| `TechnologyEraBand` | `0\|1\|2\|3\|4\|5\|6` に固定。本書は era を拡張せず、既存の era 6 に5ノード追加する。 | [technologyTypes.ts:16](../../src/generators/technologyTypes.ts#L16) |
| 「State資金の資本設備、ChemistryTrial を経由しない」先例 | `SteelConverterPlant` は `burgId`/`stateId`/`role`/`active`/`utilization`/`documentedRuns`/`lastFundedYear` を自分自身で持ち、化学ドメインの `ChemistryTrial` を経由しない（冶金ドメインの特例）。`chemMedCommon.ts` の汎用ヘルパー（`debitTreasury`/`consumeNamed`/`addNamedStock`/`pickSponsorBurg`/`marketIdForBurg`）をそのまま再利用する。 | [steelConverterTypes.ts](../../src/extensions/economy/generators/steelConverterTypes.ts)、[steelConverters.ts](../../src/extensions/economy/generators/steelConverters.ts) |
| **資本 Good を購入してから設置する、という構想は一度も実装されていない** | `Stationary Steam Engine`/`Locomotive`/`Marine Steam Engine` は Good カタログに存在するが（tags: `["industrial", "capital"]`）、それらを消費してどこかの施設・資産へ「設置」するコードは存在しない。実際に稼働・容量を生む2つの実装済み設備 — `SteamInstallation`（鉱山蒸気ポンプ）と `SteelConverterPlant`（転炉）— はどちらも「Treasury 予算 + 年次燃料/材料消費」だけで容量・生産を表現し、対応する資本 Good を一切消費しない。 | [goods-generator.ts:2496-2549](../../src/extensions/economy/generators/goods-generator.ts#L2496-L2549)（Good 定義のみ）、[steamTypes.ts:18-26](../../src/extensions/economy/generators/steamTypes.ts#L18-L26)、[steelConverters.ts:60-84](../../src/extensions/economy/generators/steelConverters.ts#L60-L84)（Treasury + 燃料/材料のみ） |
| `steelAccess`/`sulfurAccess`/`phosphateRockAccess` の市場カバレッジ・シグナルの型 | 「州が保有する市場の該当 Good 合計在庫を `clamp01(stock / 定数)` にする」だけの1行パターン。`copperWireAccess` も同型で追加できる。 | [technologyProgress.ts:765, 788](../../src/generators/technologyProgress.ts#L765) |
| `modernSteelmakingTrialYears`/`modernSteelmakingInstallations` の集計ループ | `economy.steelConverterPlants` を1回走査し、`active` な件数と `documentedRuns` の州内最大値を同時に出す。`ChemistryTrial` 非経由のため `hospitalInstallations`/`hospitalTrialYears` ブロックと同型でさらに短い。 | [technologyProgress.ts:860-875](../../src/generators/technologyProgress.ts#L860-L875) |
| `prerequisitesMet()` と `stageOf` クロージャ | 年次評価ループは州ごとに `stageOf = id => byKey.get(...)?.stage ?? "locked"` を作り、`prerequisitesMet(def, stageOf)` に渡す。`byKey` の各エントリは同一年内で `TECHNOLOGY_DEFINITIONS` 配列の並び順に書き換わるため、`stageOf` は「配列で自分より前にある技術は今年の更新後、後にある技術は前年の値」を返す。 | [technologyProgress.ts:314-345, 990-992](../../src/generators/technologyProgress.ts#L314-L345) |
| `advanceStage()` の呼び出し形 | `entry, def, signals, year, hintKnowledgeRatios` の5引数のみを受け取り、`stageOf` を持たない。`diffusion` の年次加算は `DIFFUSION_ANNUAL_GAIN(=0.15) * getTechnologyDevelopmentSpeed()` の固定式で、技術・州によらず一律。 | [technologyProgress.ts:54, 1110-1153, 343](../../src/generators/technologyProgress.ts#L1110-L1153) |
| `instruments` Guild Knowledge の唯一の産出源 | `CraftDomainEmploymentRecord[domain="instruments"]` は `experimentalWorkshops.ts` の非 export 関数 `upsertInstruments(burgId, workers)` からのみ積み上がる。`guildKnowledge.ts` はこの一意性を前提にしたコメントを持つ。 | [experimentalWorkshops.ts:25, 34-43, 104](../../src/extensions/economy/generators/experimentalWorkshops.ts#L34-L43)、[guildKnowledge.ts:94-105](../../src/extensions/economy/generators/guildKnowledge.ts#L94-L105) |
| Market の population 集計の先例 | `Markets.calculatePopulationByMarket()`（private）は `pack.burgs` を1回走査し `burg.market` ごとに `burg.population` を合算するだけ。`FertilizerInvestment` は同種の集計（`cultivatedHectaresByMarket`）を private ヘルパーを import せず自前で1回走査して作る。 | [markets-generator.ts:2305-2313](../../src/extensions/economy/generators/markets-generator.ts#L2305-L2313)、[fertilizerInvestment.ts:44-55](../../src/extensions/economy/generators/fertilizerInvestment.ts#L44-L55) |
| `Market.fertilizerStock` 投資パターンの先例 | `FertilizerInvestment.settleAnnual()`: 需要量 = 面積 × 目標単価、予算 = `market.marketTreasury.balance × BUDGET_SHARE`、`Markets.consumeForMarketInvestment()` で購入、`fertilizerStock = 前年値×(1-rate) + 今年のカバレッジ×rate` の EWMA。 | [fertilizerInvestment.ts:31-90](../../src/extensions/economy/generators/fertilizerInvestment.ts#L31-L90) |
| `chemMedCommon.ts` の budget 定数の並び | `ACID_PLANT_BUDGET(24) < PHOSPHATE_FERTILIZER_PLANT_BUDGET(28) < STEEL_CONVERTER_PLANT_BUDGET(32) < SYNTHETIC_AMMONIA_PLANT_BUDGET(40)`。 | [chemMedCommon.ts:12-24](../../src/extensions/economy/generators/chemMedCommon.ts#L12-L24) |
| Good 新設時のセーブ互換性 | `migrateSyntheticAmmoniaGoods()`（`SYNTHETIC_AMMONIA_GOOD_NAMES`、単一ファイル内の小さな追加関数）が `index.tsx` の2箇所（生成時・ロード時）から呼ばれる。同じファイルに `INDUSTRIAL_STEAM_GOOD_NAMES`/`CHEMMED_GOOD_NAMES` という同型の名前リスト定数も既にある。 | [goods-generator.ts:3206-3217, 3328-3352](../../src/extensions/economy/generators/goods-generator.ts#L3206-L3352)、[index.tsx:2463-2464, 3144-3145](../../src/extensions/economy/index.tsx#L2463-L2464) |
| era 6 State資本設備の呼び出し順序 | `index.tsx` に2つの独立したブロックがある: (a) 投資ブロック — `AgTechInvestment` → `FertilizerInvestment` → `NitrogenFertilizerInvestment` → `IndustrialTechInvestment`（L2812-2823）。(b) 生産ブロック — `ExperimentalWorkshops` → `AcidPlants` → `PhosphateFertilizerPlants` → `SteelConverters` → `SyntheticAmmoniaPlants`（L2948-2961）。(b) は (a) より後に実行されるため、`NitrogenFertilizerInvestment` は前年の `SyntheticAmmoniaPlants` 出力を購入する非同期関係が既に確立している。 | [index.tsx:2812-2823, 2948-2961](../../src/extensions/economy/index.tsx#L2812-L2961) |
| `extensionStateSlices.ts` の配列登録 | `validateEconomySlice()` の配列フィールド一覧に `"steelConverterPlants"` などが登録済み。新規配列はここに追加しないとセーブ・ロード時に検証されない。 | [extensionStateSlices.ts:437-439](../../src/runtime/extensionStateSlices.ts#L437-L439) |

結論として、State資本設備・市場投資EWMA・シグナル集計という3層はすべて `SteelConverterPlant`/`FertilizerInvestment`/`steelAccess` の3つの先例からそのまま複製できる。本書で実質的に新しいのは「①資本 Good を持たない発電・電信の2つの設備、②在庫ではなく容量カバレッジとして扱う `Market.electricityStock`、③ `advanceStage()` へ `stageOf` を追加して電信の普及速度ボーナスを配線する1箇所の関数シグネチャ変更」の3点に限定される。

## 3. 設計

### 3.1 概念モデル

```text
既存 era 6 チェーン（syntheticAmmonia まで実装済み、本書は非接続）:
  chemicalIndustryFoundation → … → catalyticChemistry → syntheticAmmonia

本書が追加する独立枝（electricalExperiments から派生。
  Copper Wire は electricalExperiments の唯一の Good 出力で、電信と発電機の両方が消費する共有ボトルネック）:

  experimentalNaturalPhilosophy（era4、既存）
        │
        ▼
  electricalExperiments（新規）─── Copper Wire の requiredTechnology
        │
        ▼
  practicalElectrochemistry（新規、電池・電気計測。新規 Good なし）
        │
        ├──────────────────────────────┐
        ▼                              │
  electricTelegraph（新規）            │
    TelegraphLines（新規、State資本設備） │
    → telegraphLineTrialYears/Installations
    → 採用後: DIFFUSION_ANNUAL_GAIN への州別ボーナス（§3.12）
                                       │
  modernSteelmaking（era6、既存）───────┤
        │                              │
        ▼                              ▼
  generatorAndMotor（新規、prerequisites: [electricalExperiments, modernSteelmaking]）
    PowerStations（新規、State資本設備、石炭専焼）
    → powerStationTrialYears/Installations
    → 稼働時: instruments Guild Knowledge へ upsertInstruments()（§3.11）
        │
        ▼
  powerGrid（新規）
    → Market.electricityStock の集計範囲を「同一Burgのみ」から「同一State全体プール」へ拡張（§3.10）
```

`Copper Wire` は `electricalExperiments` の adopted を待たず、`isGoodEnabled()`/`isGoodManufacturableInState()` の二段階ゲート（既存の `Sulfuric Acid`/`Steel`/`Synthetic Ammonia` と同型）により、世界のどこかで `electricalExperiments` が demonstrated すれば少量取引・研究調達が始まり、当該 State で adopted すれば通常生産になる。

### 3.2 Good: Copper Wire

`goods-generator.ts` の `GOODS_DATA` に、`Machine Parts` の直後へ追加（値は calibration TBD）:

```ts
{
  // electricalExperiments の唯一の Good 出力。電信線(TelegraphLines)と発電機(PowerStations)の
  // 両方が消費する共有ボトルネック — steam-industrial-technology-history.csv 行13の一次資料どおり
  // (「Copper wire is both a communications input and a prerequisite for later power systems」)。
  name: "Copper Wire",
  warEconomyType: "strategic",
  tags: ["industrial", "metal"],
  icon: "good-unknown", // 専用スプライト未作成。非目的として記録するのみ（先例と同じ扱い）
  color: "#c98a4b",
  value: 16,
  chance: 0,
  recipes: [{ "Copper Ingot": 1, Glass: 0.2, "Machine Parts": 0.1 }],
  unit: "coil",
  demandCoverage: {},
  requiredTechnology: "electricalExperiments"
}
```

`Copper Ingot`/`Glass`/`Machine Parts` はいずれも既存 Good（[goods-generator.ts:306, 1206, 2483](../../src/extensions/economy/generators/goods-generator.ts#L2483)）。`tradeProfile` 一覧（[goods-generator.ts:2716, 2764](../../src/extensions/economy/generators/goods-generator.ts#L2764) 付近）にも `"Copper Wire": tradeProfile(...)` を1行追加する。

`Generator` Good は追加しない（§1 非目的、§7 決定事項2）。

### 3.3 新規シグナル

`technologyTypes.ts` の `TechnologySignals` に6フィールド追加:

```ts
/** 0..1 市場在庫カバレッジ。sulfurAccess/steelAccess/phosphateRockAccess と同型。 */
copperWireAccess: number;
/** PowerStation.documentedRuns の州内最大値。modernSteelmakingTrialYears と同型。 */
powerStationTrialYears: number;
/** active な PowerStation の件数。modernSteelmakingInstallations と同型。 */
powerStationInstallations: number;
/** TelegraphLine.documentedRuns の州内最大値。同型。 */
telegraphLineTrialYears: number;
/** active な TelegraphLine の件数。同型。 */
telegraphLineInstallations: number;
/**
 * 0..1。人口を持つ市場に限定した Market.electricityStock の州内平均。fertilizerCoverageGap と
 * 同じ「市場ストックの州平均」パターンだが、こちらは gap の反転ではなく直接値を使う — powerGrid は
 * 既にローカル発電の裾野が広い州ほど「送電網へ投資する価値がある」という需要牽引を表現するため。
 */
electricityCoverage: number;
```

`technologyProgress.ts` の初期化ブロックに6フィールドとも `0` で追加する。

`copperWireAccess` は既存の `steelStockByState` パス（[technologyProgress.ts:765, 788](../../src/generators/technologyProgress.ts#L765)）に `copperWireId = goodIdByName(economy, "Copper Wire")` を足すだけの1行:

```ts
signals.copperWireAccess = clamp01((copperWireStockByState.get(stateId) ?? 0) / 2);
```

`powerStationTrialYears`/`powerStationInstallations`/`telegraphLineTrialYears`/`telegraphLineInstallations` は `modernSteelmakingTrialYears`/`modernSteelmakingInstallations` の集計ブロック（[technologyProgress.ts:860-875](../../src/generators/technologyProgress.ts#L860-L875)）と全く同型のループを2つ追加する（`economy.powerStations`、`economy.telegraphLines` をそれぞれ1回走査）。

`electricityCoverage` は新しい小さなループを1つ追加する（`foodLedger` を持つ市場に限定した既存の集計ループとは別の、`Market.electricityStock` だけを見る単純な平均）。`Market` 自体は人口フィールドを持たない（`cultivatedArea` のような `marketCellColumn` 経由の間接参照も無い）ため、`Markets.calculatePopulationByMarket()`（private、markets-generator.ts:2305-2313）と同じ「`pack.burgs` を1回走査し `burg.market` ごとに `burg.population` を合算する」ローカル集計を先に作る:

```ts
const populationByMarket = new Map<number, number>();
for (const burg of pack.burgs ?? []) {
  if (!burg || typeof burg !== "object" || !burg.i || burg.removed || !burg.market) continue;
  const pop = Math.max(0, Number(burg.population) || 0);
  if (pop <= 0) continue;
  populationByMarket.set(burg.market, (populationByMarket.get(burg.market) ?? 0) + pop);
}
const electricityByState = new Map<number, { sum: number; n: number }>();
for (const market of asStockArray(economy.markets)) {
  if (!((populationByMarket.get(asNumber(market.i)) ?? 0) > 0)) continue; // 人口ゼロの市場は平均から除外
  const center = pack.burgs?.[asNumber(market.centerBurgId)];
  const stateId = center && typeof center === "object" ? (center.state ?? 0) : 0;
  if (!stateId) continue;
  const entry = electricityByState.get(stateId) ?? { sum: 0, n: 0 };
  entry.sum += clamp01(asNumber(market.electricityStock));
  entry.n += 1;
  electricityByState.set(stateId, entry);
}
for (const [stateId, entry] of electricityByState) {
  const signals = map.get(stateId);
  if (signals && entry.n > 0) signals.electricityCoverage = clamp01(entry.sum / entry.n);
}
```

`COUNT_SIGNAL_KEYS`（[technologyProgress.ts:994-1017](../../src/generators/technologyProgress.ts#L994-L1017)）に `powerStationTrialYears`/`powerStationInstallations`/`telegraphLineTrialYears`/`telegraphLineInstallations` を追加する。`copperWireAccess`/`electricityCoverage` は `sulfurAccess`/`steelAccess` と同じく無登録（デフォルトの "ratio" 種別のまま）。

### 3.4 技術ノード: `electricalExperiments`

`technologyDefinitions.ts` の `ERA_6` 配列、`syntheticAmmonia` の直後に追加:

```ts
{
  id: "electricalExperiments",
  label: "Electrical and magnetic experiments",
  era: 6,
  scope: "state",
  prerequisites: ["experimentalNaturalPhilosophy"],
  known: { min: { naturalPhilosophy: 0.45, instruments: 0.3, experimentRecord: 0.45, treasury: 90 } },
  demonstrated: { min: { naturalPhilosophy: 0.5, experimentRecord: 0.5, treasury: 120 } },
  adopted: { min: { naturalPhilosophy: 0.55, instruments: 0.35, administration: 0.35, treasury: 150 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

`prerequisites` は era 4 の `experimentalNaturalPhilosophy` 単独（[technologyDefinitions.ts:390-399](../../src/generators/technologyDefinitions.ts#L390-L399)）— `chemicalIndustryFoundation`（era6）が era4 の `analyticalChemistry` を直接前提にしているのと同じ2段跳び（[technologyDefinitions.ts:612-616](../../src/generators/technologyDefinitions.ts#L612-L616)）。`experimentRecord` の閾値(0.45/0.5)は `experimentalNaturalPhilosophy` 自身の adopted 閾値(0.4)より高く設定し、前提が adopted した瞬間に自動で `known` へ進まないようにする。`instruments`(0.3/0.35)は `experimentalNaturalPhilosophy` が全く参照しない独立シグナルであるため、それ自体が新しいゲートとして機能する。

### 3.5 技術ノード: `practicalElectrochemistry`

```ts
{
  id: "practicalElectrochemistry",
  label: "Practical batteries and electrical measurement",
  era: 6,
  scope: "state",
  prerequisites: ["electricalExperiments"],
  known: { min: { copperWireAccess: 0.15, instruments: 0.4, treasury: 130 } },
  demonstrated: { min: { naturalPhilosophy: 0.58, instruments: 0.45, treasury: 160 } },
  adopted: { min: { naturalPhilosophy: 0.62, instruments: 0.5, administration: 0.4, treasury: 200 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

`known` は `naturalPhilosophy` を再掲しない — `electricalExperiments` の adopted 閾値が既に `naturalPhilosophy: 0.55` を要求しており、0.55 未満の値を `known` の閾値にすると前提が adopted した瞬間に自動達成されてしまう（`industrialSulfuricAcid` が `chemicalIndustryFoundation` の `experimentRecord` を再掲しないのと同じ理由）。`demonstrated`/`adopted` で `naturalPhilosophy` を 0.58/0.62 として初めて再導入するのは、`electricalExperiments` 自身の adopted 閾値(0.55)を上回るよう明示的に設定するため。`instruments`(0.4)も `electricalExperiments` の adopted 閾値(0.35)より高く設定する。`Precision Instruments`/専用の「電池」Good は導入しない — `modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項4 の「既存の `instruments` シグナルで代用する」判断をそのまま踏襲する。

### 3.6 技術ノード: `electricTelegraph`

```ts
{
  id: "electricTelegraph",
  label: "Electric telegraph network",
  era: 6,
  scope: "state",
  prerequisites: ["practicalElectrochemistry"],
  known: { min: { copperWireAccess: 0.3, administration: 0.45, treasury: 160 } },
  demonstrated: { min: { telegraphLineTrialYears: 2, copperWireAccess: 0.35, treasury: 210 } },
  adopted: { min: { telegraphLineInstallations: 1, administration: 0.55, treasury: 260 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`prerequisites` は `practicalElectrochemistry` 単独 — `generatorAndMotor`/`powerGrid` を経由しない。CSV行13の史実（Morse 1837年）どおり、電信は発電機・送電網より前に、電池と銅線だけで機能する独立した経路として設計する。`administration`(0.45)は `practicalElectrochemistry` の adopted 閾値(0.4)より高く設定する。

### 3.7 技術ノード: `generatorAndMotor`

```ts
{
  id: "generatorAndMotor",
  label: "Generator and motor",
  era: 6,
  scope: "state",
  prerequisites: ["electricalExperiments", "modernSteelmaking"],
  known: { min: { copperWireAccess: 0.35, steelAccess: 0.3, instruments: 0.4, treasury: 260 } },
  demonstrated: { min: { powerStationTrialYears: 2, steelAccess: 0.35, treasury: 320 } },
  adopted: { min: { powerStationInstallations: 1, administration: 0.55, treasury: 380 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`prerequisites` は2本 — `highPressureChemicalApparatus` が `modernSteelmaking`/`industrialSulfuricAcid` の両方を要求するのと同じ形（[technologyDefinitions.ts:680-695](../../src/generators/technologyDefinitions.ts#L680-L695)）。`prerequisitesMet()` はどちらも adopted であることを要求するため、`steelAccess` は `modernSteelmaking` の adopted 時点で既に一定の裾野があるが、`modernSteelmaking` 自身は `steelAccess` を demonstrated/adopted で再掲しない（known の 0.2 止まり）ため、`steelAccess: 0.3` は依然として意味のある追加ゲートになる。`copperWireAccess`(0.35)は `electricalExperiments` が一切参照しない独立シグナルであるため、単独でも自動達成のリスクはない。

### 3.8 技術ノード: `powerGrid`

```ts
{
  id: "powerGrid",
  label: "Power grid and electricity utilities",
  era: 6,
  scope: "state",
  prerequisites: ["generatorAndMotor"],
  known: { min: { electricityCoverage: 0.25, administration: 0.58, treasury: 350 } },
  demonstrated: { min: { electricityCoverage: 0.3, administration: 0.62, treasury: 420 } },
  adopted: { min: { electricityCoverage: 0.35, administration: 0.68, treasury: 500 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`administration` は3段階とも `generatorAndMotor` の adopted 閾値(0.55)を上回るよう設定する。`electricityCoverage` が本ノードの主たる需要牽引シグナルであり、既にローカル発電の裾野があるほど「送電網へ投資する価値がある」という roadmap §9.3 の「Burg間の電力供給」を、`generatorAndMotor` 側の単なる延長ではなく質的に新しい採用条件として表現する。

### 3.9 State資本設備: `PowerStations` / `TelegraphLines`

新規型ファイル `electricalTypes.ts`（`steelConverterTypes.ts` と同型 — 電気工学ドメインであり `ChemistryTrial` を経由しない §7 決定事項4）:

```ts
export type PowerFailureReason = "materialShortage" | "fundingCut";

/** 石炭専焼のみ(§1 非目的、水力は将来の別縦切り)。generationCapacity は年次で再計算する
 *  フローであり、Good在庫のように累積しない。 */
export interface PowerStation {
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

export interface TelegraphLine {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  lastFailureReason?: PowerFailureReason;
}
```

`chemMedCommon.ts` に定数追加（`STEEL_CONVERTER_PLANT_BUDGET(32)` と `SYNTHETIC_AMMONIA_PLANT_BUDGET(40)` の間・下に配置。calibration TBD）:

```ts
/** calibration TBD — STEEL_CONVERTER_PLANT_BUDGET(32)より高い、SYNTHETIC_AMMONIA_PLANT_BUDGET(40)
 *  より低い。発電所は製鋼転炉より大きいが高圧触媒プラントほどではない資本規模。 */
export const POWER_STATION_BUDGET = 36;
/** calibration TBD — 4つの化学/冶金プラントより低い。電信線は配線・中継局のみで済む軽量インフラ。 */
export const TELEGRAPH_LINE_BUDGET = 18;
```

新規モジュール `powerStations.ts`（`steelConverters.ts` と同型構造。[steelConverters.ts](../../src/extensions/economy/generators/steelConverters.ts) 全体をそのまま複製し、以下だけ置き換える）:

```ts
export class PowerStationsModule {
  settleAnnual(): boolean {
    // steelConverters.ts と同型:
    // 1. 年次自己ゲート（getPowerStationsLastSettledYear）
    // 2. generatorAndMotor が "known" 以上の State だけがプラントを持てる
    // 3. plant新設/継続ごとに POWER_STATION_BUDGET を debitTreasury
    // 4. Coal・Copper Wire・Machine Parts を consumeNamed で消費(量は calibration TBD、
    //    例: Coal 4 / Copper Wire 1 / Machine Parts 1.5 を年間投入量とする)
    // 5. utilization >= 0.5 の年だけ documentedRuns += 1、
    //    generationCapacity = POWER_STATION_BASE_CAPACITY * (role==="trial" ? 0.25 : 1) * utilization
    //    を毎年再計算する(addNamedStockは呼ばない — Electricityは在庫Goodではない、§1)。
    //    同じ条件で upsertInstruments(plant.burgId, POWER_STATION_INSTRUMENT_WORKERS) を呼び、
    //    instruments Guild Knowledge へ寄与する(§3.11)。
    // 6. adoptedに達したらroleを"trial"→"service"に昇格
  }
}
export const PowerStations = new PowerStationsModule();
```

新規モジュール `telegraphLines.ts`（同型、燃料なし。Coal を消費しない — 電信は動力ではなく配線・中継局のみを要する）:

```ts
export class TelegraphLinesModule {
  settleAnnual(): boolean {
    // powerStations.ts と同型だが:
    // 2. electricTelegraph が "known" 以上の State だけが線路を持てる
    // 3. TELEGRAPH_LINE_BUDGET を debitTreasury
    // 4. Copper Wire・Machine Parts のみ consumeNamed で消費(例: Copper Wire 0.8 / Machine Parts 0.3)
    // 5. utilization >= 0.5 の年だけ documentedRuns += 1(generationCapacity相当の出力は持たない —
    //    電信自体の効果は §3.12 のとおり electricTelegraph の技術段階から間接的に得る)
    // 6. adoptedに達したらroleを"trial"→"service"に昇格
  }
}
export const TelegraphLines = new TelegraphLinesModule();
```

`economyContext.ts` にスライスアクセサを追加（`getSteelConverterPlants`/`setSteelConverterPlants`/`getSteelConverterPlantsLastSettledYear`/`setSteelConverterPlantsLastSettledYear` と同型、[economyContext.ts:1421-1493](../../src/extensions/economy/economyContext.ts#L1421-L1493)）を `powerStations`/`telegraphLines` それぞれに追加する。`_powerStationsLastSettledYearFallback`/`_telegraphLinesLastSettledYearFallback` フォールバック変数と、モジュールリセット処理（[economyContext.ts:165, 227](../../src/extensions/economy/economyContext.ts#L165)）にも追加する。`extensionStateSlices.ts` の `validateEconomySlice()` 配列フィールド一覧（[extensionStateSlices.ts:437-439](../../src/runtime/extensionStateSlices.ts#L437-L439)）に `"powerStations"`/`"telegraphLines"` を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、[index.tsx:2948-2961](../../src/extensions/economy/index.tsx#L2948-L2961) の era 6 プラント群の末尾、`SyntheticAmmoniaPlants.settleAnnual()` の直後）:

```ts
ExperimentalWorkshops.settleAnnual();
AcidPlants.settleAnnual();
PhosphateFertilizerPlants.settleAnnual();
SteelConverters.settleAnnual();
SyntheticAmmoniaPlants.settleAnnual();
// 石炭・銅線・部品を消費するのみで、他のera6プラントの出力に依存しない。§3.10のPowerGridInvestment
// は「投資ブロック」(index.tsxのより前方)にあり、今年のPowerStations出力は来年のPowerGridInvestment
// が使う — NitrogenFertilizerInvestmentがSyntheticAmmoniaPlantsに対して既に持つのと同じ非同期関係。
PowerStations.settleAnnual();
TelegraphLines.settleAnnual();
```

### 3.10 電力カバレッジ: `Market.electricityStock` と `PowerGridInvestment`

`marketTypes.ts` の `Market` interface に、`nitrogenFertilizerStock` の直後へ追加:

```ts
/**
 * 0..1の飽和ストック。PowerStation発電容量に対する需要カバレッジのEWMA。市場在庫Goodではない
 * — 通常のMarket.goodsとは別会計。powerGrid未採用の州では同一Burg内のPowerStationのみを対象に、
 * 採用済みの州では同一State全体のPowerStation発電容量プールを対象に計算する(下記)。
 * See docs/plan/electric-power-and-telegraph.md §3.10.
 */
electricityStock?: number;
```

新規ファイル `powerGridInvestment.ts`（`fertilizerInvestment.ts` と同じ「Market資金の年次投資 → EWMA」形だが、需要基準が耕作面積ではなく人口、供給基準が Good 購入ではなく `PowerStation.generationCapacity` という点で異なる）:

```ts
/** calibration TBD — 人口1000人あたりの年間目標発電容量(抽象単位、PowerStation.generationCapacityと同じ尺度)。 */
export const TARGET_ELECTRICITY_PER_1000_POPULATION = 0.4;
export const ELECTRICITY_ADOPTION_RATE = 0.15; // FERTILIZER_ADOPTION_RATEと同じEWMA速度

export class PowerGridInvestmentModule {
  settleAnnual(): boolean {
    // 1. 年次自己ゲート
    // 2. markets-generator.ts:2305-2313のcalculatePopulationByMarket()と同型の集計を自前で
    //    1回行う(private関数のためimportしない。fertilizerInvestment.tsの
    //    cultivatedHectaresByMarket集計と同じ「自前で再集計する」流儀)
    // 3. state.i ごとに、powerGridがadopted以上かを見る:
    //    - 未adopted: そのBurgのmarketに属するPowerStation.generationCapacityの合計のみを供給元にする
    //    - adopted済み: 同じstateIdを持つ全PowerStationのgenerationCapacity合計を、州内の
    //      人口按分でmarketごとに配分する
    // 4. requestedUnits = population/1000 * TARGET_ELECTRICITY_PER_1000_POPULATION
    //    coverageThisYear = min(1, availableSupply / requestedUnits)
    //    (Good購入ではないため Markets.consumeForMarketInvestment は使わない — 治療費・原料費の
    //    ようなtreasury支出は発生しない。PowerStations側の運転費(§3.9)が唯一のコストである)
    // 5. market.electricityStock = 前年値*(1-rate) + coverageThisYear*rate のEWMA(rn(),4桁)
  }
}
export const PowerGridInvestment = new PowerGridInvestmentModule();
```

`electricityStock` の更新はステップ4のとおり `market.marketTreasury` を消費しない — 電力の「投資」は既に §3.9 の `PowerStations.settleAnnual()` が Treasury から支払っている発電所の運転費であり、`PowerGridInvestment` は生まれた容量を人口需要へ配分するだけの純粋な集計層である。これは `FertilizerInvestment`(Good購入)/`AgTechInvestment`(Tools購入)と明確に異なる新しいサブパターンであり、§7 決定事項5 として明示する。

呼び出し順序（`src/extensions/economy/index.tsx`、[index.tsx:2812-2823](../../src/extensions/economy/index.tsx#L2812-L2823) の投資ブロック末尾、`IndustrialTechInvestment.settleAnnual()` の直後）:

```ts
AgTechInvestment.settleAnnual();
FertilizerInvestment.settleAnnual();
NitrogenFertilizerInvestment.settleAnnual();
IndustrialTechInvestment.settleAnnual();
// 前年までのPowerStations出力を人口需要へ配分する。§3.9のとおり今年のPowerStations出力は
// このブロックより後に確定するため、来年のPowerGridInvestmentが使う(1年遅れの非同期関係)。
PowerGridInvestment.settleAnnual();
```

### 3.11 `instruments` Guild Knowledge への波及効果

`experimentalWorkshops.ts` の非 export 関数 `upsertInstruments`（[experimentalWorkshops.ts:34-43](../../src/extensions/economy/generators/experimentalWorkshops.ts#L34-L43)）に `export` を付け、`powerStations.ts` から import する。`guildKnowledge.ts` のコメント（[guildKnowledge.ts:96-99](../../src/extensions/economy/generators/guildKnowledge.ts#L96-L99)）「`instruments` has no manufacture-craft-employment source of its own today ... comes entirely from experimentalWorkshops.ts's upsertInstruments()」は、`PowerStations` が2つ目の産出源になった時点で不正確になるため、実装時に同じ変更内で更新する。

```ts
// powerStations.ts、utilization >= 0.5 の分岐内
upsertInstruments(plant.burgId, POWER_STATION_INSTRUMENT_WORKERS); // calibration TBD, 例: 2
```

`upsertInstruments` は `Math.max(existing.workers, workers)` で統合するため（[experimentalWorkshops.ts:37](../../src/extensions/economy/generators/experimentalWorkshops.ts#L37)）、同一 Burg に `ExperimentalWorkshop` と `PowerStation` の両方があっても二重加算にはならない。

### 3.12 電信の効果: 技術普及速度ボーナス

`advanceStage()`（[technologyProgress.ts:1110-1153](../../src/generators/technologyProgress.ts#L1110-L1153)）のシグネチャに `stageOf` を追加する:

```ts
function advanceStage(
  entry: TechnologyProgress,
  def: TechnologyDefinition,
  signals: TechnologySignals,
  year: number,
  stageOf: (id: string) => TechnologyStage, // 追加
  hintKnowledgeRatios = false
): TechnologyStage {
  // ...既存の known/demonstrated/adopted 判定は無変更...
  if (stage === "adopted") {
    // electricTelegraphがこのownerでadopted以上なら、技術普及速度に一律ボーナスを与える。
    // GUNPOWDER_ERA2_TECHNOLOGY_IDSと同じ、host内の特定技術IDへの直接参照(この関数はgunpowder
    // 関連の特例を既に複数持つ既存の慣習に沿う)。
    const telegraphBonus = isTechnologyStageAtLeast(stageOf("electricTelegraph"), "adopted")
      ? TELEGRAPH_DIFFUSION_BONUS_MAX
      : 0;
    entry.diffusion = Math.min(
      1,
      (entry.diffusion || 0) + DIFFUSION_ANNUAL_GAIN * getTechnologyDevelopmentSpeed() * (1 + telegraphBonus)
    );
    if (entry.diffusion >= 1) stage = "diffused";
  }
  // ...
}
```

呼び出し側（[technologyProgress.ts:343](../../src/generators/technologyProgress.ts#L343)）を `advanceStage(entry, def, signals, year, stageOf, liveHintKeys.has(...))` に更新する。`stageOf` は同じ年次評価ループが既に構築済みのクロージャ（[technologyProgress.ts:316](../../src/generators/technologyProgress.ts#L316)）であり、新しいシグナルフィールドを追加しない — `prerequisitesMet()` が同じ `stageOf` を使って他の技術の状態を読むのと全く同じ仕組みを再利用する。

`DIFFUSION_ANNUAL_GAIN` の直前に定数を追加する:

```ts
/** calibration TBD — electricTelegraph が adopted 済みの owner は普及が最大50%速くなる。 */
const TELEGRAPH_DIFFUSION_BONUS_MAX = 0.5;
```

この効果は `electricTelegraph` 自身の diffusion にも(自己参照的に、無害に)適用される。ある State の情報インフラが整うほど、その State が既に採用した *あらゆる* 技術の周辺への定着が速くなる、という一般的な効果であり、特定の技術ペアや Nobility の諜報システムとは結合しない（§1 非目的、§7 決定事項3）。

### 3.13 セーブ互換性

`ELECTRICAL_GOOD_NAMES = ["Copper Wire"] as const` を `goods-generator.ts` に追加し、`migrateSyntheticAmmoniaGoods()`（[goods-generator.ts:3334-3352](../../src/extensions/economy/generators/goods-generator.ts#L3334-L3352)）と同型の `migrateElectricalGoods()` を実装する。`index.tsx` の両方の呼び出し箇所（[index.tsx:2463-2464, 3144-3145](../../src/extensions/economy/index.tsx#L2463-L2464)、`migrateSyntheticAmmoniaGoods()` の直後）に追加する。

新規配列 `powerStations`/`telegraphLines` は §3.9 のとおり `extensionStateSlices.ts` へ登録する。新規スカラー `Market.electricityStock` は既存の `Market` 型の optional フィールドであり、追加のマイグレーション関数は不要（`fertilizerStock`/`nitrogenFertilizerStock` と同じく `undefined` は 0 として扱う）。

### 3.14 地図レイヤー表示: `togglePowerGrid` / `drawPowerGrid.ts`

追加（2026-08-23）: §3.9-§3.10 の実装完了時点では、`PowerStation`/電化 `Dam`/`powerGrid` 採用のいずれも地図上に一切表示されなかった
（`drawWaterSupply.ts`/`drawSewerage.ts`/`drawDams.ts` のような専用レイヤーが存在しなかった）。`drawWaterSupply.ts` の
`treatmentPlantMarkup()`/`schemeRoutesMarkup()` と同じ「own SVG layer, emoji icon」の形で、新規レイヤー
`togglePowerGrid`（SVG `<g id="powerGrid">`, `waterSupply`/`sewerage` と同じく両レンダーモードで SVG のまま — 発電所・送電網の
deck.gl 表現はまだ存在しない）を追加する:

- **発電所マーカー**: 稼働中／trial の `PowerStation` を持つ Burg に ⚡ アイコン、電化された `Dam`（`electrified: true`）を持つ
  Burg に 💧⚡ アイコン。非稼働（`active: false`）は drawDams.ts と同じ規約でマーカーを消さずに `INACTIVE_OPACITY` へ暗くする。
  `Dam` 自体の物理位置（`DamSite` の川沿いの座標）は `toggleDams` レイヤーが既に描画しているため、このレイヤーでは `Dam.burgId`
  （出資 Burg、州・市場との紐付け先）にマーカーを置く — 二重の座標系を持ち込まず、グリッド接続性の表示に専念する。
- **送電網（送電線）**: `PowerGridInvestment`（§3.10）は Burg 間の個別路線ではなく州単位の容量プールしか持たないため、実在しない
  経路を捏造する代わりに、州の `powerGrid` が `adopted` 以上になった場合にのみ、稼働中の各発電拠点からその州の首都 Burg
  （`state.capital`）への模式的なハブ＆スポーク線を描く。`adopted` 前は `PowerGridInvestment` が自市場内にしか供給しない
  （§3.10 のコメント "Before powerGrid: only PowerStations sharing this exact market can serve it"）ため、線は一切描かない —
  発電所マーカー単体が「その市場内だけの供給」を暗に表す。
- 首都自身が発電拠点を持つ、または少なくとも1本のフィーダー線を受ける場合にのみ、首都に「グリッドハブ」マーカー（同心円）を追加する。

実装: [economyContext.ts](../../src/extensions/economy/economyContext.ts) の `getPowerGridLayer()`、
[drawPowerGrid.ts](../../src/extensions/economy/renderers/drawPowerGrid.ts)、`index.tsx` の `economyLayers` 配列・
`registerLayerElement`/`registerLayerToggle`/`registerDrawLayerHook` への `togglePowerGrid` 追加。テストは
[drawPowerGrid.test.ts](../../src/extensions/economy/renderers/drawPowerGrid.test.ts)（`drawWaterSupply.test.ts` と同じ形）。

## 4. Phase分割

- **Phase 1 — 技術グラフとシグナルの型**: §3.3（6シグナル）＋ §3.4-3.8（5ノード）。`PowerStation`/`TelegraphLine` 配列が空のまま `powerStationInstallations`/`telegraphLineInstallations` などは 0 に留まり、各ノードは `known` までしか進めない状態。`electricTelegraph` の diffusion ボーナス配線（§3.12）はこの Phase に含める — シグナル・ノードが揃わなくても `advanceStage()` のシグネチャ変更自体は独立して追加・テストできる。
- **Phase 2 — `Copper Wire` と `PowerStations`/`TelegraphLines` の生産経路**: §3.2（Good）＋ §3.9。`electricalExperiments`/`generatorAndMotor`/`electricTelegraph` が `demonstrated`/`adopted` まで到達可能になる。§3.11（instruments 波及）もこの Phase に含める。
- **Phase 3 — 電力カバレッジと `powerGrid`**: §3.10（`Market.electricityStock`/`PowerGridInvestment`）。ここで初めて `powerGrid` が `known` 以上へ進行可能になり、プレイヤーから見た効果（電力カバレッジの Burg 間拡大）が現れる。
- **Phase 4 — セーブ互換性の仕上げ**: §3.13 の migration 関数と `extensionStateSlices.ts` 登録。Phase 1〜3 と並行して都度追加するのが自然だが、既存セーブでの動作確認は全 Phase 完了後にまとめて行う。

## 5. テスト計画

- `powerStations.test.ts`（新規、`steelConverters.test.ts` と同じ形）: `generatorAndMotor` が未 `known` の州はプラントを持たないこと、Coal/Copper Wire/Machine Parts 不足で `utilization` が下がり `documentedRuns` が増えないこと、`adopted` 昇格で `role` が `service` になること、`generationCapacity` が Good 在庫のように累積せず毎年再計算されること、年次自己ゲート。
- `telegraphLines.test.ts`（新規、同じ形）: `electricTelegraph` が未 `known` の州は線路を持たないこと、Coal を消費しないこと、Copper Wire 不足で `utilization` が下がること。
- `powerGridInvestment.test.ts`（新規、`fertilizerInvestment.test.ts` と同じ形）: `powerGrid` 未採用の州では他 Burg の `PowerStation` 容量が `electricityStock` に反映されないこと、`powerGrid` 採用後は州全体の容量プールが人口按分で配分されること、`PowerStation` が存在しない市場は `electricityStock` が0へ減衰すること、`market.marketTreasury` を一切消費しないこと。
- `goods-generator.test.ts`: `Copper Wire` が `GOODS_DATA` に存在し `requiredTechnology`/`demandCoverage: {}` が正しいこと。`migrateElectricalGoods()` が旧セーブへ既存 id を壊さず追加すること。
- `technologyProgress.test.ts`: 5ノードすべての `TECHNOLOGY_DEFINITIONS` 上の era・prerequisites・閾値キーの静的チェック。`experimentalNaturalPhilosophy`/`practicalElectrochemistry`/`generatorAndMotor` が adopted していない状態でそれぞれの子ノードが一切進行しないこと（`explainTechnologyGate()` を使った統合テスト、`syntheticAmmonia` 実装時と同じ形）。`copperWireAccess`/`electricityCoverage` が市場フィクスチャから正しく計算されること。**`advanceStage()` に `stageOf` を渡すテスト**: `electricTelegraph` が adopted していない owner と adopted 済みの owner で、同じ signals・同じ経過年数でも後者の方が別の技術（例: `syntheticAmmonia`）の `diffusion` 伸びが `TELEGRAPH_DIFFUSION_BONUS_MAX` 分だけ大きいことを検証する。
- `experimentalWorkshops.test.ts` / `guildKnowledge.test.ts`（既存に追加）: `upsertInstruments` を export した後も `ExperimentalWorkshops` 側の既存テストが変更なく通ること。`PowerStations` からの `upsertInstruments` 呼び出しが `instruments` Guild Knowledge を正しく押し上げることを新規テストで確認する。

## 6. 受け入れ条件

- `experimentalNaturalPhilosophy` が世界のどこにも `adopted` していない状態では `electricalExperiments` は `known` にすら進まない。
- `Copper Wire` は `demandCoverage` が空であり、都市の一般消費財需要には一切計上されない。
- `electricTelegraph` は `generatorAndMotor`/`powerGrid` のいずれにも依存せず、`practicalElectrochemistry` の adopted だけで到達できる。
- `generatorAndMotor` が `adopted` になっただけでは `Market.electricityStock` は変化しない。実際に `PowerStation` が稼働し `generationCapacity` を生み、`PowerGridInvestment` がそれを人口需要へ配分して初めて反映される（技術フラグ即座に効果が出る実装の禁止 — 既存の縦切り群と同じ原則）。
- `powerGrid` が `adopted` していない州では、`PowerStation` の発電容量は同一 Burg のみに供給され、他 Burg の `electricityStock` には反映されない。
- `PowerStation`/`TelegraphLine` はいずれも通常 Good の市場在庫を持たない — `Market.goods` へのエントリが増えない。
- `electricTelegraph` が `adopted` していない州の技術普及速度（`diffusion` の年次増分）は、本書の変更前後で完全に同一である。
- `Generator` という新しい Good は追加されない。
- 既存セーブ（`Copper Wire` を持たない旧カタログ、`powerStations`/`telegraphLines` 配列を持たない旧セーブ）をロードしても、既存 Good の id がずれず、新規配列が空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・`npm run madge`・関連ユニットテストがすべて通過する。

## 7. 決定事項 / Open Questions

1. **`Generator` を購入可能な資本 Good として追加しない**。`steam-industrial-goods-and-technology-chain.md` の構想と異なり、現在実装済みの `SteelConverterPlant`/`SteamInstallation` はどちらも「Treasury予算＋年次燃料/材料消費」だけで容量を表現し、対応する資本 Good を購入・設置する経路を一度も実装していない（§2 監査）。`PowerStation`/`TelegraphLine` もこの実装済みパターンに揃える。
2. **`PowerStation`/`TelegraphLine` は `ChemistryTrial` を経由しない**（`SteelConverterPlant` 型）。両者とも化学ドメインではなく電気工学ドメインであり、`modern-steelmaking-and-high-pressure-apparatus.md` §7 決定事項2 と同じ理由でこの特例を踏襲する。
3. **電信の効果を Nobility の諜報・外交システムへ接続しない**。`IntelligenceReport`/`StrategicGoal` は Nobility 拡張が所有する別ドメインであり、クロス拡張の結合を新たに増やす代わりに、host が既に所有する `TechnologyProgress.diffusion` の一律ボーナスという最小限の効果に留める。将来、より具体的な次タスクとして諜報連携が計画された時点で改めて設計する。
4. **`electricalExperiments` を `experimentalNaturalPhilosophy`（era4）の直接の子とし、`chemicalIndustryFoundation` の化学チェーンには接続しない**。roadmap の era 表・ノード表のいずれも、電化と近代化学を単一の直線ではなく並行する複数分野として記述しており（§9.1〜9.3 は別々のノード群）、`generatorAndMotor` が `modernSteelmaking`（冶金チェーン）を前提にする形で十分に工業化の土台と接続される。
5. **`PowerGridInvestment` は `market.marketTreasury` を消費しない**、`FertilizerInvestment`/`AgTechInvestment` とは異なる新しいサブパターンとして扱う。電力の資本・運転コストは `PowerStations.settleAnnual()` が既に Treasury から支払っており、`PowerGridInvestment` は生まれた容量を人口需要へ配分するだけの集計層である。二重に治療費・原料費を徴収しない。
6. **水力発電は導入しない**。石炭専焼のみを `PowerStation` の燃料とする。史実アンカー（CSV）が石炭火力発電中心であることと、水力立地判定（河川隣接など）を新設するスコープが本書の目的（発電・送電・電信の技術グラフ）を超えるための意図的な縮小。将来、`waterAndWindMills` の既存立地判定と接続する形で別途追加する。
7. **`instruments` の産出源を `experimentalWorkshops.ts` の `upsertInstruments` を export して共有する**。ロジックを複製せず、`guildKnowledge.ts` の「唯一の産出源」コメントを実装と同時に更新する。

## 8. 関連ドキュメント

- [technology-development-roadmap.md](./technology-development-roadmap.md) §6（L134）, §9.3（L279-291） — 本書が具体化する一次資料
- [steam-industrial-goods-and-technology-chain.md](./steam-industrial-goods-and-technology-chain.md) §3.5, §4, §9 決定事項9 — `Copper Wire`/`Generator`/`Electricity` の区分の初出、および本書が離れる箇所（Generator を Good にしない、§7 決定事項1）
- [steam-industrial-technology-history.csv](./data/steam-industrial-technology-history.csv) 行13 — `electricTelegraph` の史実アンカー（Morse、1837年）
- [modern-steelmaking-and-high-pressure-apparatus.md](./modern-steelmaking-and-high-pressure-apparatus.md) — `SteelConverterPlant`（`ChemistryTrial` を経由しない例外）の直接のテンプレート
- [synthetic-ammonia-vertical-slice.md](./synthetic-ammonia-vertical-slice.md) — `Market.nitrogenFertilizerStock`/`NitrogenFertilizerInvestment` の EWMA パターンの直接のテンプレート、era 6 プラント群の呼び出し順序の先例
- [phosphate-fertilizer-vertical-slice.md](./phosphate-fertilizer-vertical-slice.md) — `FertilizerInvestment`/`Market.fertilizerStock` の設計元
- [chemistry-medicine-knowledge-accumulation.md](./chemistry-medicine-knowledge-accumulation.md) — `ExperimentalWorkshop`/`upsertInstruments`/`chemMedCommon.ts` の設計元
