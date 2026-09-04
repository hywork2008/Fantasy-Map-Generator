# 技術グラフの欠落中間ノード監査と実装計画

## 状態

**未実装の監査・提案ドキュメント。** 2026-09-05 時点の `master`(`e1774be0`)を対象に、
[technology-development-roadmap.md](./technology-development-roadmap.md) §4〜§11 の全ノード表と、
実装である [`technologyDefinitions.ts`](../../src/generators/technologyDefinitions.ts)(77ノード)・
[`goods-generator.ts`](../../src/extensions/economy/generators/goods-generator.ts) の
`requiredTechnology` 付き Good 群を突き合わせ、**「発明 A と発明 C は存在するが、両者を史実・
シミュレーション上つなぐべき中間ノード B が無い」箇所**を洗い出したもの。

ロードマップ本体には、本監査で確定した欠落ノードを各段階の表へ「未実装」として追記済み
(同書 §5.1 / §8 / §9.1 / §9.4 / §10 / §11 / §17)。本書はその根拠と実装計画を持つ。

**本監査は既存の設計判断を撤回しない。** 既存ノードの閾値・効果・所有境界はすべてそのまま残し、
「明示的に代用(proxy)と書かれている箇所」と「ロードマップの表に行があるのにノードが無い箇所」だけを
埋める。決定事項13(火薬ロケットから宇宙開発への直接昇格を作らない)・決定事項9(電力は在庫 Good に
しない)・決定事項16(前史ノードを重複実装しない)はいずれも不変である。

---

## 監査方法

1. **ロードマップ表 → ノード**: §4〜§11 の全ノード表の行を `TECHNOLOGY_DEFINITIONS` の `id` へ
   1対1で対応付け、対応先が無い行を列挙した。
2. **必要技能 → ノード**: 各表の「前提知識・技能」列に現れる技能名
   (`thermodynamics`、`physicalChemistry`、`cryogenics`、`electronics`、`controlTheory`、
   `lightweightStructures`、`electrochemistry` ほか)を全列挙し、それを表現するノードが存在するかを
   確認した。存在しないものは、コード側で何が代用されているかをコメントから特定した。
3. **グラフ構造**: 77ノードの `prerequisites` から有向グラフを組み、(a) era を2以上跳ぶ辺、
   (b) 入次数1のまま era 5以降へ進むノード、(c) 誰からも参照されない葉、を機械的に抽出した。
4. **Good の行き止まり**: `requiredTechnology` を持つ全 Good について、レシピ材料・プラント入力・
   `demandCoverage` のいずれかに消費先があるかを走査した。**消費先ゼロの Good は、
   「その Good を使うはずの後続ノード B が無い」ことの直接の証拠**として扱った。

---

## サマリ

### Part 1: 欠落している中間ノード(新規ノードが必要)

| # | 欠落ノード | A(既存の上流) | C(既存の下流) | 深刻度 | 根拠の型 |
| --- | --- | --- | --- | --- | --- |
| M1 | 熱力学の確立 (`thermodynamics`) | `highEfficiencySteamEngine` / `experimentalNaturalPhilosophy` | `catalyticChemistry` / `oilRefiningAndFractionation` / `internalCombustionEngine` / `rocketDynamics…` | 高 | コード内で代用を明言 |
| M2 | 精密機器製造 (`precisionInstrumentMaking`) | `precisionBoringAndMeasurement` / `laboratoryGlassware` | `practicalElectrochemistry` / `generatorAndMotor` / `highPressureChemicalApparatus` | 高 | 別設計書のグラフに存在／シグナル汚染 |
| M3 | 工業的アルカリ (`industrialAlkali`) | `industrialSulfuricAcid` | `Alumina` → `electrolyticIndustry` / `Soda Ash` / `Caustic Soda` | 高 | Good の技術ゲートが逆転 |
| M4 | 有機化学・合成染料 (`organicChemistryAndDyes`) | `chemicalIndustryFoundation` / `coalCarbonization` | `petrochemicals` / 近代医薬 | 中 | `Coal Tar` が消費先ゼロ |
| M5 | 空気液化・工業ガス (`airLiquefactionAndIndustrialGases`) | `highPressureChemicalApparatus` / `thermodynamics` | `syntheticAmmonia`(窒素源) / `liquidPropulsionAndTestFacilities`(液体酸素) | 高 | 表が要求する資源に対応物が無い |
| M6 | 軽量構造材・導体 (`lightweightStructuresAndConductors`) | `electrolyticIndustry` | `stagingAndOrbitalInsertion` / 送電線 | 中 | 表に行があるのにノードが無い／`Aluminum` が消費先ゼロ |
| M7 | 無線通信・電子管 (`radioAndElectronics`) | `electricTelegraph` / `precisionInstrumentMaking` | `guidanceAndAttitudeControl` | 高 | 1837年の電信が唯一の通信祖先 |
| M8 | 石油化学 (`petrochemicals`) | `oilRefiningAndFractionation` / `catalyticChemistry` | (新規)合成材料・高性能燃料 | 中 | 表に行があるのにノードが無い(既知の先送り) |
| M9 | 硝石生産・硝石丘 (`saltpeterProduction`) | `blackPowder` | `cornedPowder` / `massFirearms` | 中 | 資源アクセスゲートが火薬系列にだけ無い |

### Part 2: ノードはあるが、ロードマップが要求する前提が落ちている(辺・閾値の修正)

| # | 内容 | 深刻度 | 該当箇所 |
| --- | --- | --- | --- |
| E1 | 鉄道が鉄・鋼を一切要求しない(§8 は `steelmaking` を要求) | 中 | `technologyDefinitions.ts:581` |
| E2 | 近代掘削が鋼管・動力ポンプを要求しない(§10 は「鋼管、ポンプ」) | 中 | `technologyDefinitions.ts:915` |
| E3 | 発電機・電動機が電池/電気計測(`practicalElectrochemistry`)を前提にしない | 低 | `technologyDefinitions.ts:844` |
| E4 | `Steel` Good のゲートが `standardMachineWorks`、製鋼ノードは `modernSteelmaking` で不一致 | 低 | `goods-generator.ts:2602` |

### Part 3: 付随して見つかった観察事項(本計画の対象外だが記録)

| # | 内容 | 該当箇所 |
| --- | --- | --- |
| O1 | `instruments` クラフトドメインのレシピ側唯一の産出源が `Liquor`(蒸留酒) | `guildKnowledgeTypes.ts:82` |
| O2 | `TechnologySignals` の9フィールドがどのノードからも参照されていない | `technologyTypes.ts` |

---

# Part 1: 欠落している中間ノード

## M1. 熱力学の確立 — 蒸気機関はあるが「熱の理論」が無い

**現状**

ロードマップは `thermodynamics` を3つの表で必要技能として明示している。

- §8「高効率蒸気機関 | thermodynamics、precisionMachining、highPressureMetallurgy」
- §10「製油・分留 | chemicalEngineering、thermodynamics、precisionMachining」
- §11「ロケット力学・高温燃焼研究 | advancedMathematics、physics、thermodynamics…」

さらに §9.1 は触媒化学に `physicalChemistry` を要求する。しかし `thermodynamics` にも
`physicalChemistry` にも対応するノードが無い。実装は**高圧容器のノードで熱の理論を代用**している。

```ts
// technologyDefinitions.ts:929 (oilRefiningAndFractionation の直前)
// highPressureChemicalApparatus stands in for roadmap §10's "chemicalEngineering、
// thermodynamics、precisionMachining" — …

// technologyDefinitions.ts:983 (rocketDynamics… の直前)
// …the same highPressureChemicalApparatus proxy oilRefiningAndFractionation already reuses for
// thermodynamics/precisionMachining。
```

`highPressureChemicalApparatus` は「良質鋼で高圧反応器を作れる」という**冶金・工作の**ノードであり、
カルノーサイクル・熱効率・気体の状態方程式という**理論知**とは別物である。加えて
[`highEfficiencySteamEngine`](../../src/generators/technologyDefinitions.ts#L561) の閾値は
`metallurgy` / `administration` / `treasury` の3つだけで、`naturalPhilosophy` も `experimentRecord` も
参照しない。つまり**理論を一切持たない State が高効率機関に到達できる**。

**なぜ B が必要か**

史実の因果はむしろ逆向きで、熱力学は蒸気機関を*説明しようとして*生まれた
(カルノー 1824、クラウジウス／ケルヴィン 1850年代)。ロードマップ §1.4「発展は需要に駆動される」に
最も素直に合致するノードであり、「機関はあるが理論が無い State」と「理論に到達した State」を
分けることで、化学・石油・ロケットへの分岐条件になる。

**提案**

```ts
{
  id: "thermodynamics",
  label: "Thermodynamics",
  era: 5,
  scope: "state",
  prerequisites: ["highEfficiencySteamEngine", "experimentalNaturalPhilosophy"],
  known: { min: { experimentRecord: 0.45, naturalPhilosophy: 0.45, steamInstallations: 1, treasury: 150 } },
  demonstrated: { min: { experimentRecord: 0.52, naturalPhilosophy: 0.5, instruments: 0.3, treasury: 200 } },
  adopted: { min: { experimentRecord: 0.58, naturalPhilosophy: 0.55, administration: 0.5, treasury: 250 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

- `experimentalNaturalPhilosophy` の adopted 閾値は `experimentRecord: 0.4` であり、`known` の 0.45 は
  その上に置く(前提が adopted した瞬間の自動通過を避ける既存規律)。`naturalPhilosophy` は
  `experimentalNaturalPhilosophy` が全く参照しないシグナルなので、それ自体が独立のゲートになる。
- `steamInstallations: 1` が §1.4 の需要駆動を担う — 実際に動いている機関が無ければ理論化の動機が無い。
- 新規 Good・新規プラント・新規 `TechnologySignals` フィールドはいずれも不要。`catalyticChemistry` と
  同型の純粋な知識収束ノードである。

**追加する辺**

| 下流ノード | 追加理由 |
| --- | --- |
| `catalyticChemistry` | §9.1 の `physicalChemistry` |
| `oilRefiningAndFractionation` | §10 の `thermodynamics`(`highPressureChemicalApparatus` の代用コメントを削除) |
| `internalCombustionEngine` | §10 の `thermodynamics` |
| `rocketDynamicsAndHighTemperatureCombustionResearch` | §11 の `thermodynamics` |
| `airLiquefactionAndIndustrialGases` (M5) | ジュール＝トムソン効果 |

---

## M2. 精密機器製造 — `instruments` シグナルを消費するノードは8つ、産出するノードはゼロ

**現状**

`instruments`(精密機器ギルド知識)は、era 6〜8 の主要ノードの閾値に繰り返し現れる。

| ノード | 要求する `instruments` |
| --- | --- |
| `electricalExperiments` | known 0.3 / adopted 0.35 |
| `practicalElectrochemistry` | known 0.4 / adopted 0.5 |
| `highPressureChemicalApparatus` | known 0.3 |
| `catalyticChemistry` | known 0.4 |
| `generatorAndMotor` | known 0.4 |
| `syntheticAmmonia` | known 0.45 |
| `rocketDynamics…` | known 0.4 |
| `guidanceAndAttitudeControl` | known 0.55 / **adopted 0.65** |

ところが**このシグナルを育てる技術ノードは1つも無い**。値は
[`experimentalWorkshops.ts`](../../src/extensions/economy/generators/experimentalWorkshops.ts) の
`upsertInstruments()`(研究者頭数)と `powerStations.ts` から積み上がるだけで、レシピ側の産出源は
[`guildKnowledgeTypes.ts:82`](../../src/extensions/economy/generators/guildKnowledgeTypes.ts#L82) の
`Liquor: "instruments"` — つまり**蒸留酒の生産者頭数**しかない(O1)。

一方、別の設計書は**この名前のノードを既にグラフに書いている**。

```text
# steam-industrial-goods-and-technology-chain.md:143
  → precisionInstrumentMaking → generatorAndMotor → powerGrid
```

同書 §3.5 は `Generator` の主入力として `Copper Wire、Steel、Machine Parts、Precision Instruments` を
挙げており、`Precision Instruments` Good も未実装である。

**なぜ B が必要か**

A = 精密中ぐり・工作機械(`precisionBoringAndMeasurement`、砲身・シリンダー) と
C = 電気計測・高圧計装・誘導装置 の間には、時計・光学・測量・電気計器という**別の職能**がある。
ここが空白のままだと、「蒸留酒工房の多い State ほどロケット誘導装置に近い」という接続になる。

**提案**

```ts
{
  id: "precisionInstrumentMaking",
  label: "Precision instrument making",
  era: 5,
  scope: "state",
  prerequisites: ["precisionBoringAndMeasurement", "laboratoryGlassware"],
  known: { min: { instruments: 0.25, metallurgy: 0.7, glassware: 0.5, treasury: 130 } },
  demonstrated: { min: { instruments: 0.32, glassware: 0.55, experimentRecord: 0.45, treasury: 180 } },
  adopted: { min: { instruments: 0.38, glassware: 0.6, administration: 0.45, treasury: 230 } },
  minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
}
```

- `metallurgy: 0.7` は `precisionBoringAndMeasurement` の adopted(0.65)、`glassware: 0.5` は
  `laboratoryGlassware` の adopted(0.45)より上に置く。
- `instruments` を閾値にも取るのは `modernSteelmaking` が `steelAccess` を取るのと同型で、
  循環しない — `instruments` には `ExperimentalWorkshops` という技術非依存の独立産出源がある。

**同時に行う Good 側の修正(M2 の実効果)**

新規 Good `Precision Instruments`(`requiredTechnology: "precisionInstrumentMaking"`、
レシピ `{ Steel: 0.4, Glass: 0.3, Tools: 0.3 }`、`unit: "case"`)を追加し、
`CRAFT_DOMAIN_BY_GOOD_NAME` の `instruments` を `Liquor` から `Precision Instruments` へ**付け替える**。
これにより O1 が解消し、`instruments` が初めて「その名のとおりの実践者頭数」で駆動される。
`Liquor` はどのクラフトドメインにも属さない扱いに戻す(食品・奢侈品にギルド倍率を与えない既存方針と一致)。

**追加する辺**: `practicalElectrochemistry` / `generatorAndMotor` / `highPressureChemicalApparatus`
(§9.1「計測器」)の `prerequisites` に追加。

---

## M3. 工業的アルカリ — Good のゲートが自分の原料より手前に置かれている

**現状**

酸とアルカリは近代化学工業の二本柱だが、実装されているのは酸だけである。
アルカリ側の Good は3つ存在するのに、対応する技術ノードが無く、
すべて酸ノードより**手前**の `chemicalIndustryFoundation` にぶら下がっている。

| Good | 行 | レシピ | `requiredTechnology` |
| --- | --- | --- | --- |
| `Soda Ash` | `goods-generator.ts:2843` | `{ Salt: 1, Lime: 0.3, Coal: 0.3, "Sulfuric Acid": 0.1 }` | `chemicalIndustryFoundation` |
| `Caustic Soda` | `goods-generator.ts:2863` | `{ "Soda Ash": 1, "Slaked Lime": 0.3 }` | `chemicalIndustryFoundation` |
| `Alumina` | `goods-generator.ts:2908` | `{ Bauxite: 1, "Caustic Soda": 0.3, Coal: 0.2 }` | `chemicalIndustryFoundation` |

`Sulfuric Acid` 自体は `industrialSulfuricAcid` ゲートであり、これは
`chemicalIndustryFoundation` の**子**である
([`technologyDefinitions.ts:677`](../../src/generators/technologyDefinitions.ts#L677))。
したがって `Soda Ash` は**自分のレシピ材料より先に有効化される** — ゲート順序が逆転している。
`isGoodEnabled()` は `demonstrated` 以上を要求するだけなので、この間 `Soda Ash` は
「有効だが1単位も作れない Good」として市場に存在する。

**なぜ B が必要か**

ロードマップ §9.1 は化学工業の基礎の資源前提を「酸・アルカリ原料」と書き、§9.4 は
「Bauxite + **アルカリ化学** + 熱 → Alumina」と書いている。アルカリ化学(ルブラン法ソーダ、1791年)は
硫酸を大量消費する最初の下流産業であり、そこからガラス・石鹸・製紙・漂白・アルミナ精製が分岐する。
現在はこの分岐点が存在せず、硫酸から直接リン酸肥料へ一本道になっている。

**提案**

```ts
{
  id: "industrialAlkali",
  label: "Industrial alkali (soda process)",
  era: 6,
  scope: "state",
  prerequisites: ["industrialSulfuricAcid"],
  known: { min: { sulfurAccess: 0.45, administration: 0.45, treasury: 200 } },
  demonstrated: { min: { experimentRecord: 0.6, sulfurAccess: 0.5, treasury: 260 } },
  adopted: { min: { experimentRecord: 0.65, sulfurAccess: 0.55, administration: 0.55, treasury: 320 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

- `sulfurAccess: 0.45` は `industrialSulfuricAcid` の adopted(0.4)より上。新規プラントは作らず、
  `catalyticChemistry` と同じ純知識収束ノードとする(ソーダ工場は
  既存の `ChemistryTrial` 系を将来足す余地を残す)。
- `Soda Ash` / `Caustic Soda` / `Alumina` の `requiredTechnology` を `industrialAlkali` へ付け替え、
  ゲート逆転を解消する。
- `electrolyticIndustry` の `prerequisites` に `industrialAlkali` を追加する
  (§9.4 の「ボーキサイト精製」行の実体。Alumina が Caustic Soda を要求する以上、
  電解アルミの前提でもある)。

---

## M4. 有機化学・合成染料 — `Coal Tar` は誰も消費しない

**現状**

`Coal Tar`([`goods-generator.ts:2823`](../../src/extensions/economy/generators/goods-generator.ts#L2823))は
`{ Coke: 1.2 }` から生産され、`requiredTechnology: "chemicalIndustryFoundation"`、
`demandCoverage: {}`。走査の結果、**どのレシピの材料でもなく、どのプラントの入力でもなく、
世帯需要も持たない**。生産されて市場に積み上がるだけの完全な行き止まりである。

一方、設計書側には行き先が書かれている。

```text
# steam-industrial-goods-and-technology-chain.md §3.5
| Coal Tar | 中間 | Chemical Industry Foundation | Coke oven の副産物 | Dyes、有機化学、防水・薬品の候補 |
```

ロードマップ §9.1 も化学工業の基礎の結果を「染料、薬品、爆薬、肥料の基盤」としているが、
実装されたのは爆薬(硝酸)と肥料(リン酸)だけで、染料と薬品の枝が無い。

**提案**

```ts
{
  id: "organicChemistryAndDyes",
  label: "Organic chemistry and synthetic dyes",
  era: 6,
  scope: "state",
  prerequisites: ["chemicalIndustryFoundation", "coalCarbonization", "industrialAlkali"],
  known: { min: { experimentRecord: 0.6, textiles: 0.5, treasury: 240 } },
  demonstrated: { min: { experimentRecord: 0.66, textiles: 0.55, treasury: 300 } },
  adopted: { min: { experimentRecord: 0.7, administration: 0.58, treasury: 370 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

新規 Good `Synthetic Dye`(レシピ `{ "Coal Tar": 1, "Sulfuric Acid": 0.4, "Soda Ash": 0.3 }`、
`demandCoverage: { clothing: … }` は取らず、`Cloth`/`Garments` の**第2レシピの材料**として消費させる)。
既存の `Dye` 系天然染料 Good がある場合はそれを置換せず、並列の第2経路として足す
(`Glass` が Potash 経路と Soda Ash 経路を併記しているのと同じ形)。
`textiles` を閾値に取るのは §1.4 の需要駆動(染料需要は繊維産業から来る)。

---

## M5. 空気液化・工業ガス — 合成アンモニアの「窒素源」とロケットの「cryogenics」が両方とも空欄

**現状**

ロードマップ §9.2 は合成アンモニアの採用条件に **「水素源・窒素・大規模エネルギー」** を明記している。
§11 は液体推進の必要技能に **`cryogenics`** を挙げ、資源に「精製燃料・**酸化剤**」を挙げている。
どちらもノードが無い。実装側も自覚している。

```ts
// syntheticAmmoniaPlants.ts:109
// high-pressure catalytic reaction — no dedicated Hydrogen Good, no Steam Power capacity …
```

[`syntheticAmmonia`](../../src/generators/technologyDefinitions.ts#L772) の `prerequisites` は
`["catalyticChemistry"]` 一本、
[`liquidPropulsionAndTestFacilities`](../../src/generators/technologyDefinitions.ts#L1000) の
酸化剤側シグナルは `refinedFuelAccess`(灯油の市場カバレッジ)だけで、酸化剤に相当するものが無い。

**なぜ B が必要か**

空気液化(リンデ 1895)は**一つの技術で二つの下流を同時に解禁する**、この技術グラフで最も
分岐効率の高い欠落ノードである。工業窒素はハーバー・ボッシュ法の原料そのものであり、
液体酸素は液体ロケットの酸化剤そのものである。しかも両者は「高圧・低温・精密計装」という
同じ設備基盤を共有する。M1(熱力学)の最初の実用的な下流でもある。

**提案**

```ts
{
  id: "airLiquefactionAndIndustrialGases",
  label: "Air liquefaction and industrial gases",
  era: 6,
  scope: "state",
  prerequisites: ["thermodynamics", "highPressureChemicalApparatus", "precisionInstrumentMaking"],
  known: { min: { experimentRecord: 0.68, instruments: 0.45, steelAccess: 0.4, treasury: 380 } },
  demonstrated: { min: { experimentRecord: 0.72, instruments: 0.5, treasury: 450 } },
  adopted: { min: { experimentRecord: 0.76, administration: 0.62, treasury: 540 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

閾値はすべて `highPressureChemicalApparatus` の adopted(`experimentRecord` 0.65 /
`steelAccess` 0.4 / `administration` 0.6 / `treasury` 290)より上に置く。
`syntheticAmmonia` の known(`treasury` 500)より手前で adopted に届く水準である。

**追加する辺**: `syntheticAmmonia`(窒素源)と `liquidPropulsionAndTestFacilities`(液体酸素)の
`prerequisites` に追加。新規 Good は作らない — `Nitrogen Fertilizer` / ロケット燃料はいずれも
既存の「資本設備のみ」パターンで、中間ガス Good を市場在庫にする必要が無い(決定事項9と同じ理由)。

---

## M6. 軽量構造材・導体 — 表に行があるのにノードが無く、`Aluminum` が行き止まり

**現状**

ロードマップ §9.4 のノード表は3行ある。

| ノード | 実装 |
| --- | --- |
| ボーキサイト精製 | ノード無し(M3 で `industrialAlkali` として実装) |
| 電解アルミニウム | `electrolyticIndustry` ✅ |
| **軽量構造材・導体** | **ノード無し** |

`Aluminum` Good は
[`electrolysisPlants.ts:88`](../../src/extensions/economy/generators/electrolysisPlants.ts#L88) が
市場在庫へ積むだけで、消費するレシピ・プラント・世帯需要がいずれも存在しない(`demandCoverage: {}`)。
そして era 8 側はこの空白を代用で埋めている。

```ts
// technologyDefinitions.ts:1024 (stagingAndOrbitalInsertion の直前)
// electrolyticIndustry (Aluminum) stands in for "lightweightStructures" …
```

**提案**

```ts
{
  id: "lightweightStructuresAndConductors",
  label: "Lightweight structures and conductors",
  era: 7,
  scope: "state",
  prerequisites: ["electrolyticIndustry", "precisionInstrumentMaking"],
  known: { min: { lightAlloyAccess: 0.15, electricityCoverage: 0.45, treasury: 850 } },
  demonstrated: { min: { lightAlloyAccess: 0.25, administration: 0.78, treasury: 950 } },
  adopted: { min: { lightAlloyAccess: 0.35, administration: 0.8, treasury: 1050 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 4 }
}
```

- 新規 Good `Light Alloy Parts`(レシピ `{ Aluminum: 1, "Machine Parts": 0.3 }`、
  `requiredTechnology: "lightweightStructuresAndConductors"`)で `Aluminum` に初めて消費先を与える。
- 新規シグナル `lightAlloyAccess`(`Light Alloy Parts` の市場在庫カバレッジ、
  `steelAccess` / `copperWireAccess` と完全に同型)を1つだけ追加する。
  ロケット系列は「新規シグナルを追加しない」方針で実装されたが、その方針が
  `electrolyticIndustry` を `lightweightStructures` の代用にした原因であり、本監査はそこを埋める。
- **追加する辺**: `stagingAndOrbitalInsertion` の `prerequisites` を
  `["guidanceAndAttitudeControl", "electrolyticIndustry"]` から
  `["guidanceAndAttitudeControl", "lightweightStructuresAndConductors"]` へ差し替える
  (`electrolyticIndustry` は新ノードの前提なので推移的に維持される)。

---

## M7. 無線通信・電子管 — 誘導装置の唯一の通信祖先が1837年の電信

**現状**

[`guidanceAndAttitudeControl`](../../src/generators/technologyDefinitions.ts#L1013) の
`prerequisites` は `["liquidPropulsionAndTestFacilities", "electricTelegraph"]`。コメントは代用を明言する。

```ts
// technologyDefinitions.ts:1010
// copperWireAccess/instruments + electricTelegraph stand in for roadmap §11's
// "electricalEngineering、electronics、controlTheory" and "センサー、通信、計算装置"。
```

`electricTelegraph` は設計書自身が「モールス 1837年、電池と銅線だけで機能する」と定義したノードである
([electric-power-and-telegraph.md §3.6](./electric-power-and-telegraph.md))。
そこから誘導ロケットまでの間には、電話・無線・真空管・増幅・レーダー・アナログ計算機という
**約100年分の技術層が丸ごと欠けている**。ロードマップ §11 が要求する `electronics` と
`controlTheory` に対応するノードは1つも無い。

**提案**

```ts
{
  id: "radioAndElectronics",
  label: "Radio and electron tubes",
  era: 7,
  scope: "state",
  prerequisites: ["electricTelegraph", "precisionInstrumentMaking", "powerGrid"],
  known: { min: { copperWireAccess: 0.38, instruments: 0.5, electricityCoverage: 0.4, treasury: 500 } },
  demonstrated: { min: { copperWireAccess: 0.42, instruments: 0.55, administration: 0.7, treasury: 600 } },
  adopted: { min: { copperWireAccess: 0.46, instruments: 0.6, administration: 0.74, treasury: 720 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

- 閾値は `electricTelegraph` の adopted(`administration` 0.55 / `treasury` 260)と
  `powerGrid` の adopted(`electricityCoverage` 0.35 / `administration` 0.68 / `treasury` 500)の
  両方の上に置く。
- **効果には既存の消費先がある**: `electricTelegraph` は既に技術普及速度へ
  `TELEGRAPH_DIFFUSION_BONUS_MAX` を与えている(`technologyProgress.ts` の `advanceStage(stageOf)`)。
  `radioAndElectronics` はその同じ機構に第2段のボーナスを積む形で接続できるため、
  新しいメカニクスを発明せずに実効果を持たせられる。
- **追加する辺**: `guidanceAndAttitudeControl` の `prerequisites` の `electricTelegraph` を
  `radioAndElectronics` へ差し替える(電信は新ノードの前提として推移的に維持)。

---

## M8. 石油化学 — 表にある5行目だけがノード化されていない

**現状**

ロードマップ §10 のノード表5行のうち、実装されているのは4行。5行目「石油化学 |
chemicalEngineering、触媒化学、大規模製油 | 石油留分、電力、化学プラント、研究投資 |
合成材料・溶剤・高性能燃料などの後続原料」だけノードが無い。
[petroleum-and-internal-combustion-vertical-slice.md](./petroleum-and-internal-combustion-vertical-slice.md)
が明示的に非目的として先送りした既知の欠落である。

**提案**

```ts
{
  id: "petrochemicals",
  label: "Petrochemicals",
  era: 7,
  scope: "state",
  prerequisites: ["oilRefiningAndFractionation", "catalyticChemistry", "organicChemistryAndDyes"],
  known: { min: { refinedFuelAccess: 0.4, experimentRecord: 0.76, treasury: 620 } },
  demonstrated: { min: { refinedFuelAccess: 0.45, experimentRecord: 0.8, treasury: 720 } },
  adopted: { min: { refinedFuelAccess: 0.5, administration: 0.7, treasury: 850 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

新規 Good `Synthetic Resin`(レシピ `{ Kerosene: 0.6, "Sulfuric Acid": 0.2, "Soda Ash": 0.2 }`)で
`Kerosene` に燃料以外の消費先を与える。M4 を前提に置くのは、石油化学が石炭タール化学の
技術的後継だからである(§10 の「触媒化学」要求は `catalyticChemistry` が直接満たす)。

---

## M9. 硝石生産 — 資源アクセスゲートが火薬系列にだけ存在しない

**現状**

この技術グラフでは、原料に依存する系列にはすべて `xAccess` 型の市場在庫カバレッジ・ゲートがある。

| 系列 | ゲート |
| --- | --- |
| 硫酸 | `sulfurAccess` |
| リン酸肥料 | `phosphateRockAccess` |
| 近代製鋼 | `steelAccess` |
| 水銀 | `cinnabarAccess` |
| 電化 | `copperWireAccess` |
| 石油 | `petroleumAccess` |
| **火薬(era 2)** | **無し** |

[`blackPowder`](../../src/generators/technologyDefinitions.ts#L247) の閾値は
`metallurgy` / `administration` / `pyrotechnics` / `treasury` / `gunpowderDemand` のみで、
硝石の入手可能性を一切見ていない。ロードマップ §5.1 は黒色火薬の資源前提の筆頭に
`saltpeter` を挙げている。

同時に、`Saltpeter` Good([`goods-generator.ts:1043`](../../src/extensions/economy/generators/goods-generator.ts#L1043))は
レシピを持たない純鉱物で、供給源は
[`mineralResources.ts:85`](../../src/extensions/economy/generators/mineralResources.ts#L85) の
`evaporite` 地区(`basin` 属州)だけである。つまり**盆地属州を持たない State は硝石を自給する手段が
原理的に無い**のに、火薬ノードは問題なく `adopted` まで進む。

史実の火薬帝国はほぼ例外なく硝石丘法(厩肥・灰・石灰を積んで硝酸塩を培養する)か
インド硝石の輸入で賄っており、硝石鉱山は例外的である。

**提案**

```ts
{
  id: "saltpeterProduction",
  label: "Saltpeter beds and refining",
  era: 2,
  scope: "state",
  prerequisites: ["blackPowder"],
  worldGates: ["gunpowderWorld"],
  known: { min: { pyrotechnics: 0.4, urbanPopulation: 15, administration: 0.3, treasury: 60 } },
  demonstrated: { min: { pyrotechnics: 0.5, urbanPopulation: 20, administration: 0.4, treasury: 100 } },
  adopted: { min: { pyrotechnics: 0.6, urbanPopulation: 28, administration: 0.5, treasury: 150 } },
  minimumYearsAtPreviousStage: { demonstrated: 2, adopted: 3 }
}
```

- `Saltpeter` に第2の供給経路として craft レシピ `{ Lime: 0.4, Potash: 0.3 }` を追加し、
  `requiredTechnology` は付けず**このレシピだけを** `saltpeterProduction` でゲートする
  (`Gunpowder` が硝酸経路の第2レシピを持つのと同じ、レシピ単位の解禁パターン)。
  鉱山由来の硝石は従来どおり無条件に供給される。
- 新規シグナル `saltpeterAccess`(`sulfurAccess` と同型)を追加し、
  `cornedPowder` の demonstrated / `massFirearms` の demonstrated・adopted の閾値に加える。
  「火薬の知識はあるが硝石が無いので量産できない」という、ロードマップ §14 の
  バランス要件(「冶金・軍需資金・火薬知識なしに火薬 State が出現しない」)の資源側の対応物になる。
- `urbanPopulation` を閾値に取るのは、硝石丘の原料が都市の厩肥・灰・便所汚物であるため。
  §1.4 の需要駆動と、都市規模による分岐をここでも成立させる。

---

# Part 2: ノードはあるが、前提が落ちている

新規ノードを作らず、既存ノードの `prerequisites` / 閾値だけを直す項目。

## E1. 鉄道が鉄・鋼を要求しない

ロードマップ §8 は「鉄道 | railEngineering、**steelmaking**、蒸気輸送」と書くが、
[`railEngineering`](../../src/generators/technologyDefinitions.ts#L581) の閾値は
`treasury` / `masonry` / `administration` の3つだけで、`metallurgy` も `steelAccess` も無い。
石造技術と国庫だけで鉄道が敷ける。

**修正**: 3段階すべてに `metallurgy` を追加する(`standardMachineWorks` の adopted 0.7 の上、
0.72/0.75/0.78)。`modernSteelmaking`(era 6)を `prerequisites` に足すのは era 順序を壊すため行わない
— 史実でも初期の軌条は錬鉄であり、ベッセマー鋼軌条は後発である。この史実差は
`railwayOperations` 側で `steelAccess` を要求する形で表現するほうが正確だが、
本監査ではまず `railEngineering` の冶金要求の欠落だけを埋める。

## E2. 近代掘削が鋼管も動力ポンプも要求しない

ロードマップ §10 は「近代掘削・油田運営 | … | **鋼管、ポンプ**、道路／港、労働者、安全設備」。
[`modernDrillingAndFieldOperations`](../../src/generators/technologyDefinitions.ts#L915) の閾値は
`petroleumAccess` / `administration` / `treasury` のみ。さらに親の
`petroleumGeologyAndExploration` は era 4 の2ノードだけを前提とするため、
**石油系列全体が蒸気機関も製鋼も持たない State から開始できる**。

**修正**: `modernDrillingAndFieldOperations` の `prerequisites` に `standardMachineWorks` を追加し、
閾値に `steelAccess`(0.3/0.35/0.4)を追加する。史実のドレーク井(1859年)は蒸気機関駆動の
ケーブルツール掘削であり、鋼管なしの深井戸は成立しない。

## E3. 発電機・電動機が電池・電気計測を前提にしない

[`generatorAndMotor`](../../src/generators/technologyDefinitions.ts#L844) の `prerequisites` は
`["electricalExperiments", "modernSteelmaking"]` で、`practicalElectrochemistry` を経由しない。
ファラデーの電磁誘導実験(1831)は電池と検流計を前提とする実験であり、
電池・電気計測を持たないまま発電機に到達するのは順序が逆である。

**修正**: `prerequisites` に `practicalElectrochemistry` を追加する。
`electricTelegraph` が電池だけから分岐する既存設計(史実どおり電信が発電機に先行する)は変えない。

## E4. `Steel` Good のゲートと製鋼ノードの不一致

`Steel`([`goods-generator.ts:2602`](../../src/extensions/economy/generators/goods-generator.ts#L2602))は
`requiredTechnology: "standardMachineWorks"` だが、製鋼の技術ノードは `modernSteelmaking`(era 6)であり、
その `known` 閾値は `steelAccess: 0.2` — **自分より手前でゲートされた Good の在庫**を前提にしている。
これは意図的な設計(るつぼ鋼／パドル鋼が先、ベッセマー転炉が後)とも読めるが、
どのコメントもそう述べていないため、意図をコード上に固定する必要がある。

**修正**: 実装は変えず、`Steel` のコメントに「`standardMachineWorks` ゲートの `Steel` は
るつぼ鋼・浸炭鋼相当の少量生産であり、`modernSteelmaking` + `SteelConverterPlant` が
大量生産経路である」旨を明記する。閾値の再調整はしない。

---

# Part 3: 付随して見つかった観察事項

## O1. `instruments` ドメインが蒸留酒で駆動されている

[`guildKnowledgeTypes.ts:82`](../../src/extensions/economy/generators/guildKnowledgeTypes.ts#L82) の
`Liquor: "instruments"` は、`CRAFT_DOMAIN_BY_GOOD_NAME` の中で唯一 `instruments` を指す行である。
[`guildKnowledge.ts:94-105`](../../src/extensions/economy/generators/guildKnowledge.ts#L94-L105) の
コメントもこれを認識しているが、結果として蒸留酒工房の頭数が
`guidanceAndAttitudeControl` の `instruments: 0.65` 閾値へ寄与する。M2 の実装で解消する。

## O2. 参照されていない `TechnologySignals` フィールド

`coastalBurgCount` / `urbanSanitationPressure` / `epidemicPressure` / `battleWoundPressure` /
`soapGlassPressure` / `gunpowderSulfurPressure` / `pumiceCoverage` / `pozzolanPractice` /
`obsidianPractice` の9つは、`TECHNOLOGY_DEFINITIONS` のどの閾値からも参照されていない。
計算コストを払って毎年求めた値が使われていない状態で、
[economy-coupling-audit.md](./economy-coupling-audit.md) の「死に変数」と同種の問題である。
本計画の対象外とし、別タスクで「使うか、消すか」を決める。

---

# Part 4: 実装計画

## 依存関係

```text
Phase 9-A ── thermodynamics (M1)
          └─ precisionInstrumentMaking (M2) + Precision Instruments Good + O1 修正
                    │
Phase 9-B ── industrialAlkali (M3) ── organicChemistryAndDyes (M4)
                    │
Phase 9-C ── airLiquefactionAndIndustrialGases (M5)   [M1 + M2 必須]
                    │
Phase 9-D ── radioAndElectronics (M7)                 [M2 必須]
          └─ lightweightStructuresAndConductors (M6)  [M2 必須]
          └─ petrochemicals (M8)                      [M4 必須]
                    │
Phase 9-E ── saltpeterProduction (M9)   [独立、いつでも着手可]
          └─ E1 / E2 / E3 / E4          [独立、いつでも着手可]
```

## Phase 9-A: 熱力学と精密機器製造(基盤2ノード)

最初に入れるべき2ノード。以降のほぼすべての Phase がこの2つを前提にする。

1. `thermodynamics` / `precisionInstrumentMaking` を `ERA_5` に追加。
2. `catalyticChemistry` / `oilRefiningAndFractionation` / `internalCombustionEngine` /
   `rocketDynamicsAndHighTemperatureCombustionResearch` の `prerequisites` に `thermodynamics` を追加し、
   「`highPressureChemicalApparatus` が thermodynamics の代用」と書かれた既存コメント2箇所を削除する。
3. `practicalElectrochemistry` / `generatorAndMotor` / `highPressureChemicalApparatus` の
   `prerequisites` に `precisionInstrumentMaking` を追加。
4. 新規 Good `Precision Instruments` を追加し、`CRAFT_DOMAIN_BY_GOOD_NAME` の `instruments` を
   `Liquor` から付け替える(O1)。`guildKnowledge.ts` の「唯一の産出源」コメントを同じ変更内で更新する。

**セーブ互換**: 新ノードは `TechnologyProgress` に存在しないため、既存セーブのロード時に
`locked` として補完される既存の正規化経路をそのまま使う。既に `adopted` に達している下流ノード
(`catalyticChemistry` など)は、前提が `locked` になっても**降格させない** —
`advanceStage()` は前進のみを行うため、既存セーブの進行状態は保たれる。この挙動をテストで固定する。

## Phase 9-B: アルカリと有機化学(化学の第2の柱)

1. `industrialAlkali` / `organicChemistryAndDyes` を `ERA_6` に追加。
2. `Soda Ash` / `Caustic Soda` / `Alumina` の `requiredTechnology` を `industrialAlkali` へ付け替え。
3. `electrolyticIndustry` の `prerequisites` に `industrialAlkali` を追加。
4. 新規 Good `Synthetic Dye` と、`Cloth` / `Garments` の第2レシピを追加。
5. `Coal Tar` のコメントから「候補」表現を削除し、実際の消費先を明記する。

## Phase 9-C: 空気液化・工業ガス

1. `airLiquefactionAndIndustrialGases` を `ERA_6` に追加。
2. `syntheticAmmonia` と `liquidPropulsionAndTestFacilities` の `prerequisites` に追加。
3. `syntheticAmmoniaPlants.ts:109` の「no dedicated Hydrogen Good」コメントを、
   窒素源が技術ノードで表現された旨に更新する。

## Phase 9-D: 電子工学・軽合金・石油化学

1. `radioAndElectronics` / `lightweightStructuresAndConductors` / `petrochemicals` を
   `ERA_7` に追加。
2. `guidanceAndAttitudeControl` の `electricTelegraph` を `radioAndElectronics` へ差し替え。
3. `stagingAndOrbitalInsertion` の `electrolyticIndustry` を
   `lightweightStructuresAndConductors` へ差し替え。
4. 新規 Good `Light Alloy Parts` / `Synthetic Resin`、新規シグナル `lightAlloyAccess`。
5. `radioAndElectronics` を `TELEGRAPH_DIFFUSION_BONUS` の第2段として `technologyProgress.ts` に接続。

## Phase 9-E: 硝石生産と落ちている前提の修復

1. `saltpeterProduction` を `ERA_2` に追加、`Saltpeter` に第2レシピ、
   新規シグナル `saltpeterAccess` を `cornedPowder` / `massFirearms` の閾値へ。
2. E1 / E2 / E3 の `prerequisites`・閾値修正、E4 のコメント追記。

## テスト要件

- **静的グラフ**: 全ノードの `prerequisites` が実在 id を指すこと、循環が無いこと、
  `prerequisites` の era が自身の era 以下であること(M5 が era 6 で era 8 の子を持つ形を含め、
  逆流が無いことを機械的に検証する)。
- **代用の消滅**: `thermodynamics` が `adopted` でない State で `catalyticChemistry` /
  `oilRefiningAndFractionation` / `internalCombustionEngine` / `rocketDynamics…` が一切進行しないこと
  (`explainTechnologyGate()` を使った統合テスト、`syntheticAmmonia` 実装時と同型)。
- **ゲート逆転の解消**: `industrialSulfuricAcid` が `demonstrated` 未満の世界で
  `Soda Ash` / `Caustic Soda` / `Alumina` がいずれも `isGoodEnabled() === false` であること。
- **行き止まりの解消**: `Coal Tar` / `Aluminum` / `Kerosene` に、レシピ材料としての
  消費先が最低1つ存在すること(Part 3 の走査をテストとして固定する)。
- **セーブ互換**: 新ノードを含まない旧セーブをロードしたとき、既存の `adopted` / `diffused` が
  1つも降格しないこと。
- **硝石**: `basin` 属州を持たない State が、`saltpeterProduction` 到達前は `Saltpeter` を
  自給できず `massFirearms` が `demonstrated` で停滞し、到達後は進行できること。
- **バランス**: ロードマップ §14 の既存要件が全て維持されること。特に
  「内陸国家が鉱山・繊維・陸上交易経由で前工業化できること」が M1 の追加で壊れないこと
  (`thermodynamics` は港・海運シグナルを一切参照しない)。

## 決定事項

1. 代用(proxy)として使われているノードは、代用先の本来のノードを追加した時点で
   **辺を差し替える**。代用ノードは新ノードの前提として推移的に残るため、既存の進行順序は壊れない。
2. 新規 `TechnologySignals` フィールドは `lightAlloyAccess` と `saltpeterAccess` の2つに限る。
   いずれも既存の `steelAccess` / `sulfurAccess` と完全に同型の市場在庫カバレッジで、
   新しい計算方式を持ち込まない。
3. 新規プラント(`ChemistryTrial` 系の資本設備)は本計画では**追加しない**。
   M3 / M4 / M5 / M8 はいずれも `catalyticChemistry` と同型の純粋な知識収束ノードとし、
   工場実体が必要になった時点で個別の縦切り設計書を起こす。
4. 新規 Good は `Precision Instruments` / `Synthetic Dye` / `Light Alloy Parts` /
   `Synthetic Resin` の4つに限る。いずれも**既存の行き止まり Good に消費先を与える**か、
   別の設計書が既に名前を挙げている Good である。推測による将来 Good は追加しない。
5. era バンド(0〜8)は変更しない。`TechnologyEraBand` に新しい値を追加せず、
   9つの新ノードはすべて既存の era 2 / 5 / 6 / 7 のいずれかに属する。
6. 前史(ロードマップ §16、`technologyPrehistory.ts`)には一切触れない。
   本監査は実装済みの段階0〜8の内部だけを対象とする。
