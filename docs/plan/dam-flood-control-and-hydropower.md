# 河川ダム建設 — 治水・水力発電 (Dam Construction for Flood Control and Hydropower)

## 状態

**実装済み（2026-08-20）**。[river-water-allocation.md](./river-water-allocation.md) の非目的「ダム貯水…は
Phase 0-2 の対象外」、および [electric-power-and-telegraph.md](./electric-power-and-telegraph.md) §7 決定事項6
「水力発電は導入しない…将来 `waterAndWindMills` や河川立地と接続する形で別途追加する」——どちらも本書が実装する
未接続の接続点として明示的に残していたものである。

湖・貯水池は作らない（本書の非目的）。ダムは河川セル上の1点として、Frontier Forts のチョークポイント選定と
同じ発想で、しかし実体としては鉱物資源の「地点生成 → 経済的稼働」二層パターン（`mineralResources.ts` →
`mineOperations.ts`）を踏襲する。

## 1. 目的と非目的

### 目的

- 河川上に治水・水力発電を目的としたダムを、地形（流量・勾配）に基づいて配置する。
- 治水: 既存の `Market...` ではなく `floodProtectionByCell`（`agTechInvestment.ts` が書き込むが消費者の無い
  0..1値、[agTechInvestment.ts:174](../../src/extensions/economy/generators/agTechInvestment.ts#L174)）に、
  ダム周辺・下流でより強い底上げを行う。
- 水力発電: 既存の `PowerStation`/`PowerGridInvestment`/`Market.electricityStock` パイプライン
  （[electric-power-and-telegraph.md](./electric-power-and-telegraph.md) §3.9-3.10）へ、電化済みダムの
  `generationCapacity` を石炭火力と同じプールとして合流させる。
- 地図上に見える形で置く——湖を作らないので、河川セル上の点としてアイコン表示する（Economy拡張が自前の
  SVGレイヤーを持つ既存パターン、`drawMineralDeposits.ts`/`mineralDeposits` レイヤーと同型）。

### 非目的

- 湖・貯水池・水位・洪水被害そのもののシミュレーション（`floodProtectionByCell` の消費者を新設しない）。
- 新規 Technology ノード。基礎の堰は治水条件（河川立地）とTreasury予算のみでゲートし、水力発電は既存の
  `generatorAndMotor`（known以上）をそのまま流用する。
- 新規 Good。Stone・Timber・Copper Wire・Machine Parts はすべて既存Good。
- WebGL hybrid 対応。`mineralDeposits` と同じく、Economy拡張所有レイヤーはSVGのみ（既存の一貫仕様）。
- Dams専用のOverviewダイアログ・Cell Info表示（フォローアップ候補、§6）。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 「地点生成 → 経済的稼働」二層パターンの先例 | `mineralResources.ts`（地質スキャンで`MineralDeposit[]`を1回生成）→ `mineOperations.ts`（State資金で稼働させる年次モジュール）。 | [mineralResources.ts](../../src/extensions/economy/generators/mineralResources.ts)、[mineOperations.ts](../../src/extensions/economy/generators/mineOperations.ts) |
| Economy拡張が自前のSVGレイヤーを持つ先例 | `economyLayers: LayerConfig[]` に1エントリ足すだけ（host側 `layerState.tsx` は触らない）。`drawMineralDeposits.ts` が同型の描画。 | [index.tsx:315-352](../../src/extensions/economy/index.tsx#L315)、[drawMineralDeposits.ts](../../src/extensions/economy/renderers/drawMineralDeposits.ts) |
| 河川下流トポロジー | `buildRiverDownstream(cells, rivers)` が `cells.riverDownstream` を再構築できる（灌漑と同じ関数）。 | [riverWaterAllocation.ts:220-237](../../src/generators/riverWaterAllocation.ts#L220) |
| `floodProtectionByCell` の唯一の書き込み元（消費者無し） | `AgTechInvestment.settleAnnual()` が `coverageByState` から一律 `+= coverage*0.07` のEWMAで書くのみ。 | [agTechInvestment.ts:171-190](../../src/extensions/economy/generators/agTechInvestment.ts#L171) |
| `PowerStation`/`PowerGridInvestment` の形 | State資本設備（`ChemistryTrial`非経由）+ Market人口按分プール。 | [powerStations.ts](../../src/extensions/economy/generators/powerStations.ts)、[powerGridInvestment.ts](../../src/extensions/economy/generators/powerGridInvestment.ts) |
| `generatorAndMotor`/`waterAndWindMills`/`stoneBuildingAndRoads` | `generatorAndMotor` は era6 実装済み技術。`waterAndWindMills`/`stoneBuildingAndRoads` はどちらも era0 `startStage: "diffused"`（開始時から真、実質的なゲートにならない）。 | [technologyDefinitions.ts:39-70,143](../../src/generators/technologyDefinitions.ts#L39) |

## 3. 設計

### 3.1 データモデル

`damTypes.ts`:

```ts
export interface DamSite {
  i: number;
  cell: number;
  x: number;
  y: number;
  riverId: number;
  dischargePotential: number; // 0..1、cells.fl を正規化
  headPotential: number; // 0..1、下流セルとの標高差を正規化
  qualityScore: number;
  downstreamCells: number[]; // riverDownstream を最大8跳び辿った陸地河川セル
}

export interface Dam {
  i: number;
  siteId: number;
  stateId: number;
  burgId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  electrified: boolean;
  generationCapacity: number;
  floodProtectionRating: number;
  lastFailureReason?: "materialShortage" | "fundingCut";
}
```

`PowerStation`/`SteelConverterPlant`/`MineOperation` と同じく `name` フィールドを持たない（地図上の表示は
hover titleで十分——`drawMineralDeposits.ts`と同じ扱い）。

### 3.2 地点生成: `damSites.ts`

`mineralResources.ts`と同じ「1回だけ決定的に生成」。`frontierFortsGenerator.ts`の`meanFlux`比較・最小間隔
ロジックを流用する。

- 全陸地河川セル（`cells.r && cells.h>=20`）のうち `cells.fl > meanFlux`（マップ全体平均）を必須条件とする。
- 下流セルが存在し（`downstream>=0`）かつ陸地河川セルであること（河口=両岸陸地の河道が無い地点を除外）。
- `headPotential`は下流セルとの標高差の正規化値——渓谷性は必須条件にはせず`qualityScore`の重みとしてのみ
  使う（平坦な地形の川しかない州でもダム候補が0にならないようにする）。
- `frontierFortsGenerator.ts`と同じ`minSpacing`（グリッド間隔の3倍）で候補地点を間引く（品質の高い方を残す）。
- `downstreamCells`は最大8跳び。

### 3.3 経済モジュール: `dams.ts`

`powerStations.ts`の年次会計の形＋`mineOperations.ts`の「複数拠点/State」モデル。`ChemistryTrial`を経由しない
（`PowerStation`/`SteelConverterPlant`と同じ特例）。

- `Dams.settleAnnual()`。年次自己ゲート。
- Stateごとに最大 `MAX_DAMS_PER_STATE = 3` 基まで同時稼働可能。上限未満なら、その State 領内でまだダムの
  無い `DamSite` を `qualityScore` 降順で1つ選び、`debitTreasury(state.i, DAM_BUDGET)` が通れば新設
  (`role: "trial"`)。
- 既存の各アクティブダムに対して毎年 `debitTreasury(state.i, DAM_BUDGET)`（`PowerStation`/`SteelConverterPlant`
  と同じ「新設年は二重debit」形）。失敗したら `active=false`、`lastFailureReason="fundingCut"`。
- Stone・Timberを`consumeNamed`で消費（堰・取水設備の建設/維持）。coverageから`utilization`算出。
- `utilization >= 0.5`の年だけ `documentedRuns += 1`。`documentedRuns >= 3`（`DAM_SERVICE_THRESHOLD`）で
  `role`を`"service"`に昇格——`PowerStation`は対応するState技術段階で昇格するが、堰自体に技術ノードが無い
  ため、実績年数を基準にする。
- `floodProtectionRating = FLOOD_BASE(0.6) * (0.5+0.5*headPotential) * utilization * (service?1:0.4)`。
- 電化判定: `generatorAndMotor`がその State で "known" 以上なら`dam.electrified = true`
  （一度trueになったら戻らない）。電化済みダムのみ Copper Wire・Machine Partsを消費（Coalは消費しない
  ——動力源は水流）。`generationCapacity = HYDRO_BASE_CAPACITY(1.5) * (0.4+0.6*dischargePotential) *
  (0.5+0.5*headPotential) * electricCoverage * (service?1:0.25)`。電化年は`upsertInstruments()`も呼ぶ
  （`PowerStation`と同じ instruments Guild Knowledge への波及）。
- **floodProtectionByCellへの反映**: 全ダム処理後、各アクティブダムの`site.cell`と`downstreamCells`
  （下流ほど`1 - index/(hops*2)`で逓減）について `next[cell] = Math.max(current[cell], floor)` で底上げする。
  `agTechInvestment.ts`のEWMA更新を上書きせず、その上に「最低保証値」を重ねる。`index.tsx`の呼び出し順で
  `AgTechInvestment.settleAnnual()`（投資ブロック）より**後**にこの処理を置くことで、毎年ダムの床が
  再度上乗せされ、AgTechInvestment側の減衰に食われない。

### 3.4 PowerGridInvestment への合流

`powerGridInvestment.ts`の`capacityByMarket`/`capacityByState`集計ループに、`getPowerStations()`と並べて
`getDams().filter(dam => dam.active && dam.electrified)`のループを追加。電化済みダムの`generationCapacity`が
石炭火力と同じプールへ合算され、`Market.electricityStock`に反映される。需要側（`TARGET_ELECTRICITY_PER_1000_POPULATION`
等）は無変更。

### 3.5 レンダラー: `drawDams.ts`

`drawMineralDeposits.ts`と同型。アイコンは絵文字ベース（専用スプライト無し）——非電化は🌊単体、電化済みは
🌊+⚡。`role==="trial"`は不透明度0.7、`!active`は0.45（`drawMineralDeposits.ts`のINACTIVE_OPACITY/EXHAUSTED_OPACITY
と同じ考え方）。hover titleに稼働状況・治水寄与%・（電化済みなら）発電量を表示。

### 3.6 配線

- `economyLayers`に`toggleDams`エントリを追加（`svgLayers: [{id:"dams", insertBefore:"icons", display:"none"}]`）。
- `registerLayerElement`/`registerLayerToggle`/`registerDrawLayerHook`のwebglHybrid分岐・SVG分岐に`dams`を追加
  （`toggleMineralDeposits`ハンドラと同型）。
- `MineralResources.generate()`と同じ箇所（regenerateコマンドの"minerals"ターゲット、初期生成パイプライン）に
  `DamSites.generate()`を追加。専用の regenerate ターゲットは新設せず、"minerals"に相乗りする
  （地形ベースの一回生成という点で同種)。`DamSites.generate()`実行時は`Dams.clear()`も呼び、古い`siteId`
  参照が残らないようにする。
- era6プラント群ブロック末尾、`TelegraphLines.settleAnnual()`の直後に`Dams.settleAnnual()`を追加
  （投資ブロックより後——floodProtectionByCellの「後乗せ」順序が自然に満たされる）。

### 3.7 永続化

- `economyContext.ts`: `getDamSites`/`setDamSites`、`getDams`/`setDams`、`getDamsLastSettledYear`/
  `setDamsLastSettledYear`、`getDamsLayer`を`getPowerStations`等と同型で追加。
- `extensionStateSlices.ts`の`validateEconomySlice()`配列一覧に`"damSites"`/`"dams"`を追加。
- 新規Good・新規migration関数は不要。

## 4. 決定事項

1. **Stateあたり最大3基まで同時稼働可能**（`MAX_DAMS_PER_STATE`）。`PowerStation`の単一拠点より緩いが、
   `MineOperation`ほど無制限ではない——治水対象の州すべてに大量のダムが乱立するのを防ぐ。
2. **基礎の堰には新規Technologyノードを設けない**。`waterAndWindMills`/`stoneBuildingAndRoads`はどちらも
   era0で常に真であり、堰・ダムという史実的位置づけとも合致する。実質的なゲートは河川立地とTreasury予算。
3. **水力発電は既存の`generatorAndMotor`ノードをそのまま流用**。新規ノードを作らず、
   electric-power-and-telegraph.md §7決定事項6の「将来河川立地と接続する」を実現する。堰の新規建設と
   発電機能のアップグレードを分けず、既存ダムが遡って電化される。
4. **`floodProtectionByCell`は新しい消費者を作らない**。既存の`agTechInvestment.ts`書き込みに、ダムが
   より強い底上げを行うだけに留める。洪水被害シミュレーション自体は範囲外。
5. **WebGL hybrid対応は見送る**。`mineralDeposits`と同じ扱い。
6. **専用Overviewダイアログ・Cell Info表示は今回のスコープ外**。地図上のアイコンhover titleで最低限の
   可視化を確保する。フォローアップ候補として記録する。

## 5. テスト計画

- `damSites.test.ts`: 決定的生成、discharge閾値、最小間隔、河口セル除外、downstreamCellsが陸地河川セルの
  みを含むこと、`clear()`。
- `dams.test.ts`: 予算不足で新設されないこと、州境内のサイトのみ選ばれること、`MAX_DAMS_PER_STATE`上限、
  Stone/Timber不足でutilizationが下がること、`documentedRuns`蓄積とservice昇格、`generatorAndMotor`が
  known未満なら`electrified`のまま`generationCapacity`が0であること、電化後はCoalを消費せずCopper
  Wire/Machine Partsを消費すること、floodProtectionByCellが既存値を下回らないこと（Math.max保証）と
  下流で逓減すること、年次自己ゲート。
- `powerGridInvestment.test.ts`: 電化済みダムの`generationCapacity`がPowerStationと同じプールに合算
  されること、未電化ダムは合算されないこと。
- `drawDams.test.ts`: 電化状態でアイコン・titleが変わること、trial/inactiveで不透明度が変わること、
  siteが存在しないダムは描画されないこと。

## 6. フォローアップ候補（本書の範囲外）

- Dams Overview的な専用ダイアログ、Burg/Cell Infoへの治水寄与・発電量表示。
- `floodProtectionByCell`を実際に消費する洪水被害イベント（現状は本書実装後もagTechInvestment.ts同様、
  書き込みのみで消費者が無い抽象値のまま）。
- ダム同士の相互作用（同一河川に複数ダムがある場合の上流・下流累積効果）。現状は各ダムが独立に
  floodProtectionByCellへ寄与するのみで、上流ダムの取水・調整が下流ダムの流量に影響する河川水配分
  （`riverWaterAllocation.ts`）との統合はしていない。
