# 機械式冷凍・コールドチェーン流通 実装計画 (Mechanical Refrigeration & Cold-Chain Distribution)

## 状態

**実装済み（2026-08-23、同日中に史実整合の改訂あり）**。
[natural-gas-lng-power-generation.md](./natural-gas-lng-power-generation.md) が実装したLNG液化チェーンを土台に、
`mechanicalRefrigeration`（機械式冷凍）技術ノードと `ColdStorageDepots` というState資本設備を追加し、
`Milk`/`Fish`/`Game`/`Shellfish`/6種の果実という `freshFood` タグ付き生鮮 Good が「無冷蔵」を理由に長らく
禁じられていた**保存**（cellFoodRescue.ts が捨てていた未処理分の市場在庫化）と**流通**
（tradeOpportunityEstimator.ts の隊商・海上交易禁止）の両方を、技術・資本設備が実際に整うまでという条件付きで
解禁する。

**改訂（同日）**: 初版は `mechanicalRefrigeration` を `naturalGasLiquefaction` の子ノードとして実装したが、
ユーザーからの指摘（「卵が先か鶏が先か、史実準拠にしてほしい。共通の親がいそうな気がする」）を受けて史実を
再確認した結果、これは誤りだった。実用的な圧縮式冷凍（Carré のアンモニア圧縮式製氷機、1850-60年代；Linde の
商用圧縮冷凍、1876年）は、工業的な天然ガス液化（Linde 自身の空気液化カスケード、1895年；商用天然ガス液化の
最初期、1910年代；LNG産業としての確立、1940年代以降）より数十年早い。両者は「どちらかが前提」ではなく、
共通の熱力学・精密圧縮機工学という親を持つ（実際 Carl von Linde 本人が冷凍→気体液化の両方を手掛けた）。
§3.3 のとおり `mechanicalRefrigeration` を `naturalGasLiquefaction` と同じ2前提
（`highPressureChemicalApparatus` + `standardMachineWorks`）を共有する兄弟ノードへ変更した。

## 1. 目的と非目的

### 目的

- コードベース自身が既に「冷蔵技術さえあれば」という含みを複数箇所に残していたことを解消する:
  - `goods-generator.ts` の `FRESH_FOOD_GOOD_NAMES` コメント「Raw, un-refrigerated foods」。
  - `dairy.ts` の module doc「`freshFood`（no refrigeration）keeps long-haul caravan trade uneconomical」。
  - `fauna-biome-realism.md` §3「保存不可: 冷蔵技術がないため、Milkはそのままでは流通・保管ができない想定」。
  - `tradeOpportunityEstimator.ts` の `isGoodTradePermitted()` 内コメント「This economy has neither
    refrigeration nor a retail delivery model...」。
- `mechanicalRefrigeration`（新規、era 7）を、`highPressureChemicalApparatus`（化学工学・熱力学の代理前提、
  `naturalGasLiquefaction` 自身も使う同じノード）と `standardMachineWorks`（精密機械工作、圧縮機製造の代理前提）
  の2つを前提とする技術ノードとして実装する — `naturalGasLiquefaction` の**兄弟**であり、その子ではない
  （§3.3、史実整合の改訂）。ユーザーの要求どおり「LNGに絡んで」の関係は、技術ツリー上の前提依存としてではなく、
  `ColdStorageDepots` の燃料が実際にLNGであるという資源依存として表現する（§3.5・§3.3末尾）。
- **保存**: 新規 State資本設備 `ColdStorageDepots`（LNG + Machine Parts を消費し `storageCapacity` を産出）を
  実装し、`cellFoodRescue.ts` の既存プランナー（`planCellFoodRescue()`）が「労働力・保存資材の上限を超えた分は
  記録すら残さず失われる」としていた未処理分（`harvestedUnits - producedUnits`）の一部を、変換なしの生 Good
  （生乳・生魚・生肉など）のまま Market在庫へ直接投入できるようにする。プランナー自体（`cellFoodRescueTypes.ts`・
  `planCellFoodRescue()`）は一切変更しない — 純粋な追加レイヤーとして実装する。
- **流通**: `tradeOpportunityEstimator.ts` の `isGoodTradePermitted()`/`isGoodTradePermittedForShipment()`/
  `getGoodMaxTradeDurationDays()` に `refrigeratedTransport` 引数を追加し、産地 State が `mechanicalRefrigeration`
  を adopted していれば `freshFood` Good の隊商・海上交易禁止（無条件 `return false`）と気候依存の日数上限
  （`getFreshFoodMaxTradeDays`）の両方を解除する。

### 非目的（本書の範囲外）

- 新規 Good（「Chilled Milk」等）の追加。既存の `Milk`/`Fish`/`Game`/`Shellfish`/6種の果実 Good をそのまま
  Market在庫へ直接投入する — 精製・変換の概念を持たない、生のまま冷蔵された同一 Good として扱う。
- `powerGrid` のような州全体プール化の二段階抽象化。`ColdStorageDepots` の容量は最初から州全体プールとして
  扱う（§3.5 決定事項1）— 送電網ほどの物理インフラ差（高圧送電線 vs 保冷馬車の巡回）を想定していないため。
- 電気式冷凍（`Electricity`/`electricityStock` を燃料源とする代替経路）。史実の電動コンプレッサー式冷蔵は
  電化がある程度進んでから主流化するが、本書はガス圧縮式（LNG）のみを実装し、電気式は将来の拡張候補として
  見送る（roadmap の「後続の石油・ガスなどのエネルギー供給」という一次資料が電気ではなくガスを名指ししている
  こととも整合する）。
- 食品衛生・疫病モデルへの接続。`Mercury` の `contamination` のような負債は要求されていない — 冷蔵は純粋に
  供給能力の拡張として扱う。
- 家禽・畜産の「食肉」Good 新設。本経済に生鮮の食肉 Good は `Game`（狩猟肉）のみ存在し、家畜由来の食肉は
  モデル化されていない — 本書もこれを変更しない。ユーザーの「生肉」は既存の `Game` にマップする。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| `freshFood` タグを持つ Good 一覧 | `Fish`/`Game`/`Milk`/`Shellfish`/`Grapes`/`Apples`/`Pears`/`Plums`/`Figs`/`Lemons` の10種。全て `getFreshFoodProfile()`/`isFreshFoodGood()` で判定される。 | [goods-generator.ts:32-62](../../src/extensions/economy/generators/goods-generator.ts#L32) |
| セル単位の生鮮食品処理プランナー | `planCellFoodRescue()` は「家庭消費 → 保存（労働力上限）→ 商業出荷（同じ労働力プール）」の順で処理し、`harvestedUnits - producedUnits`（労働力/保存資材の上限を超えた分）は一切記録されず単純に失われる（コメント「the planner deliberately leaves unhandled potential unproduced」）。この差分こそが本書が捕捉する未活用プール。 | [cellFoodRescue.ts:35-109](../../src/extensions/economy/generators/cellFoodRescue.ts#L35) |
| Market在庫への投入経路 | `Markets.addRuralOutput(marketId, collectionBurgId, goodId, amount)`（private）は在庫加算・`recordGoodFlow`・`recordFoodMarketIntake`・累計販売カウンタ・卸売在庫更新まで一括して行う汎用ヘルパーで、`settleCellFreshFood()` 内から既に複数箇所で呼ばれている。新しい投入経路もこれをそのまま再利用でき、追加の簿記コードは不要。 | [markets-generator.ts:1047-1090](../../src/extensions/economy/generators/markets-generator.ts#L1047) |
| 隊商・海上交易の無条件禁止 | `isGoodTradePermitted()` は `isFreshFoodGood(good)` が真なら、日数や気候を見る前に無条件で `false` を返す。コメントで「This economy has neither refrigeration...」と明記。気候依存の日数上限 `getGoodMaxTradeDurationDays()`（`getFreshFoodMaxTradeDays()` 経由）はこの早期リターンにより到達しない、現状は事実上のデッドコード。 | [tradeOpportunityEstimator.ts:178-214](../../src/extensions/economy/generators/tradeOpportunityEstimator.ts#L178) |
| `isGoodTradePermitted`/`isGoodTradePermittedForShipment` の呼び出し箇所 | 5箇所すべてで、産地側の Burg（`originBurg`/`startBurg`/`exporterCenter`/`sourceCenter`）が既にスコープ内にあり、`.state` で州IDを直接取得できる。 | [caravans.ts:762-784](../../src/extensions/economy/generators/caravans.ts#L762)（`spawnStrategicProcurement`）、[caravans.ts:908-941](../../src/extensions/economy/generators/caravans.ts#L908)（`createCaravan` 経由 `selectRouteCargo`）、[markets-generator.ts:1671, 1968](../../src/extensions/economy/generators/markets-generator.ts#L1671)（`addDirectMarketTradeOpportunities`/`addSpeculativeGlobalTradeOpportunities`）、[marketTradeOpportunities.ts:100](../../src/extensions/economy/controllers/marketTradeOpportunities.ts#L100) |
| `PowerStation`/`OilRefineryPlant` 型State資本設備の先例 | `burgId`/`stateId`/`role`/`active`/`utilization`/`documentedRuns`/`lastFundedYear` の共通形。`chemMedCommon.ts` の `consumeNamed`/`debitTreasury`/`marketIdForBurg`/`pickSponsorBurg` をそのまま再利用できる。 | [powerStations.ts](../../src/extensions/economy/generators/powerStations.ts)、[chemMedCommon.ts](../../src/extensions/economy/generators/chemMedCommon.ts) |
| era 7 の技術ノード群 | `naturalGasLiquefaction`（LNG液化、`prerequisites: [modernDrillingAndFieldOperations, highPressureChemicalApparatus]`）・`gasFiredElectricityGeneration`（ガス火力発電）実装済み。本書は `naturalGasLiquefaction` を前提にせず、その `highPressureChemicalApparatus` 前提を共有する兄弟ノードとして実装する（史実チェック、§3.3）。 | [technologyDefinitions.ts](../../src/generators/technologyDefinitions.ts)（`ERA_7`）、[natural-gas-lng-power-generation.md](./natural-gas-lng-power-generation.md) §3.4, §3.6 |

結論として、State資本設備・技術ノード・市場在庫投入という3層は `PowerStation`/`naturalGasLiquefaction`/
`addRuralOutput` の先例からそのまま複製できる。本書で実質的に新しいのは「①`cellFoodRescue.ts` の
プランナーが捨てていた未処理分を、プランナー自体を変更せず後段で再利用する純粋関数、②隊商交易の無条件禁止に
初めて州別の技術ゲート付き例外を作る」の2点に限定される。

## 3. 設計

### 3.1 概念モデル

```text
既存チェーン（本書が土台にする、実装済み・非変更）:
  Natural Gas → LNGPlants → LNG（natural-gas-lng-power-generation.md）
  Milk/Fish/Game/Shellfish/6果実 → planCellFoodRescue()（cellFoodRescue.ts、非変更）
    → 家庭消費 + 保存（Cheese/Stockfish/Wine/Dried Fruits等）+ [未処理分は破棄、記録なし]

本書が追加する縦切り（史実整合の改訂後 — §状態の改訂記録参照）:
  highPressureChemicalApparatus（既存、era6）+ standardMachineWorks（既存、era5）
        │                                │
        ├────────────────┬───────────────┘
        ▼                ▼
  naturalGasLiquefaction   mechanicalRefrigeration  ←── 兄弟ノード、互いに依存しない
  （既存、era7）           （新規、era7）
                             ColdStorageDepots（新規、State資本設備。州に1基、州全体プール）
                               LNG + Machine Parts → storageCapacity（年次、月割りで消費）
                                 │
                                 ├─→ ① 保存: cellFoodRescue.ts の未処理分(harvestedUnits - producedUnits)のうち
                                 │      利用可能な storageCapacity 分だけ、変換なしで Market在庫へ直接投入
                                 │      （getChilledFreshFoodExportUnits()、新規純粋関数）
                                 │
                                 └─→ ② 流通: isGoodTradePermitted() 系3関数に refrigeratedTransport 引数を追加。
                                        産地 State が mechanicalRefrigeration を adopted なら
                                        freshFood Good の無条件交易禁止と気候依存の日数上限を解除

  燃料としての依存（技術ツリーの前提とは別）:
    ColdStorageDepots は LNG を消費するため、naturalGasLiquefaction が進んでいない State は
    mechanicalRefrigeration を "known" にできても実際に storageCapacity を産出できない
    （§3.3末尾）— 技術的な前提関係なしに、資源供給としての実用的な結びつきが残る。
```

### 3.2 新規シグナル: `coldStorageDepotTrialYears` / `coldStorageDepotInstallations`

`technologyTypes.ts` の `TechnologySignals` に2フィールド追加する（`powerStationTrialYears`/
`powerStationInstallations` と同型 — `ColdStorageDepot` は `ChemistryTrial` を経由せず自身で `documentedRuns` を
保持する、電気工学ドメインと同じ設計）:

```ts
/** ColdStorageDepot.documentedRuns state max, same shape as powerStationTrialYears. */
coldStorageDepotTrialYears: number;
/** Count of active ColdStorageDepot entries, same shape as powerStationInstallations. */
coldStorageDepotInstallations: number;
```

`COUNT_SIGNAL_KEYS` に両方追加する。`technologyProgress.ts` に `economy.coldStorageDepots` を1回走査する
`powerStations`/`gasPowerStations` ブロックと同型のループを追加する。

### 3.3 技術ノード: `mechanicalRefrigeration`（era 7）

**史実チェック（改訂の根拠）**: 実用的な蒸気圧縮式冷凍は Perkins の特許（1834年）、Carré のアンモニア圧縮式
製氷機（1850-60年代）、Linde の商用冷凍機（1876年）と、19世紀後半には確立していた。一方、工業的な天然ガス
液化はそれよりずっと後——Linde 自身によるカスケード式空気液化（1895年）を技術的祖とし、天然ガスの商用液化は
1910年代、LNG が産業として確立するのは1940年代以降である。つまり「どちらが先か」ではなく、両者は同じ
熱力学・精密圧縮機工学（低温工学の基礎）を共有する兄弟技術であり、時系列的にはむしろ冷凍の方が数十年先行する。
本書は `mechanicalRefrigeration` を `naturalGasLiquefaction` の子ノードにせず、`naturalGasLiquefaction` 自身が
使う前提（`highPressureChemicalApparatus`/`standardMachineWorks`）をそのまま共有する兄弟ノードとして実装する。

`technologyDefinitions.ts` の `ERA_7` 配列末尾（`gasFiredElectricityGeneration` の直後）に追加する:

```ts
{
  id: "mechanicalRefrigeration",
  label: "Mechanical refrigeration",
  era: 7,
  scope: "state",
  prerequisites: ["highPressureChemicalApparatus", "standardMachineWorks"],
  known: { min: { metallurgy: 0.72, experimentRecord: 0.68, treasury: 340 } },
  demonstrated: { min: { coldStorageDepotTrialYears: 2, experimentRecord: 0.7, treasury: 400 } },
  adopted: { min: { coldStorageDepotInstallations: 1, administration: 0.65, treasury: 460 } },
  minimumYearsAtPreviousStage: { demonstrated: 3, adopted: 5 }
}
```

`naturalGasLiquefaction`（`prerequisites: ["modernDrillingAndFieldOperations", "highPressureChemicalApparatus"]`）
と `highPressureChemicalApparatus` を共通の親として共有する——`oilRefiningAndFractionation`/`naturalGasLiquefaction`
がどちらも同じノードを「chemicalEngineering、thermodynamics」の代理前提として使う先例をそのまま踏襲する。
「2前提のうち片方だけadoptedでは自動通過しない」設計は不変——`metallurgy`(0.72) は `standardMachineWorks` 自身の
adopted 閾値(0.7)より、`experimentRecord`(0.68/0.7)・`treasury`(340/400/460) は `highPressureChemicalApparatus`
自身の adopted 閾値(0.65/290)より、`administration`(0.65) は両前提の adopted 閾値
（`highPressureChemicalApparatus` 0.6、`standardMachineWorks` 0.45）より高く設定する。

**燃料依存はそのまま残す**: `ColdStorageDepots`（§3.5）の燃料は変わらず `LNG` である——ユーザーが要求した
「LNGに絡んで」という関係は、技術ツリーの前提依存としてではなく、資本設備が消費する Good の依存として表現する。
`mechanicalRefrigeration` は `naturalGasLiquefaction` の進捗と無関係に "known" へ進めるが、`ColdStorageDepots`
は `LNG` が市場に無ければ `consumeNamed("LNG", 2)` が失敗して `utilization` が0.5を下回り、
`coldStorageDepotTrialYears`/`coldStorageDepotInstallations` が増えないため、"demonstrated"/"adopted" には
事実上進めない——技術グラフの辺なしに、実用上の結びつきは自然に残る。

### 3.4 新規型: `ColdStorageDepot`（`coldStorageTypes.ts`）

新規ファイル（`electricalTypes.ts` と同型の単一ドメインファイル。電気工学ではなく機械/冷凍工学ドメインのため
分離する）:

```ts
export type ColdStorageFailureReason = "materialShortage" | "fundingCut";

/** LNG専焼(電気式は非目的、§1)。storageCapacity は年次で再計算するフローで、Good在庫のように累積しない。 */
export interface ColdStorageDepot {
  burgId: number;
  stateId: number;
  role: "trial" | "service";
  active: boolean;
  utilization: number;
  documentedRuns: number;
  lastFundedYear: number;
  storageCapacity: number;
  lastFailureReason?: ColdStorageFailureReason;
}
```

### 3.5 State資本設備: `ColdStorageDepots`

`chemMedCommon.ts` に定数追加（`PHOSPHATE_FERTILIZER_PLANT_BUDGET(28)` の直後、`OIL_REFINERY_PLANT_BUDGET(30)`
の前 — 保冷倉庫+コンプレッサーは化学プラントより軽いが、液化精製設備ほど重くない）:

```ts
export const COLD_STORAGE_DEPOT_BUDGET = 29;
```

新規モジュール `coldStorageDepots.ts`（`powerStations.ts` と精密に同型。Firebrick/Copper Wire は消費しない —
保冷倉庫は電気設備ではなく、コンプレッサーとLNG燃料のみで足りる。`upsertInstruments` は呼ばない — 冷凍技術は
`instruments` Guild Knowledge への波及効果を要求されていない）:

```ts
export const COLD_STORAGE_DEPOT_BASE_CAPACITY = 6; // calibration TBD, annual abstract unit
```

`mechanicalRefrigeration` が `known` 以上の State だけがプラントを持てる。LNG 2 / Machine Parts 1.2 を年間
投入量とする。`utilization>=0.5` の年だけ `documentedRuns` を進め、
`storageCapacity = COLD_STORAGE_DEPOT_BASE_CAPACITY * (role==="trial" ? 0.25 : 1) * utilization` を毎年再計算する。

**§7 決定事項1: 州全体プール、二段階抽象化なし。** `powerGrid` のような「adopted前後で同一Burgのみ→州全体」の
2段階を設けない — `ColdStorageDepots` は最初から州内1基・州全体プールとして扱う（§1 非目的）。

`economyContext.ts`/`extensionStateSlices.ts` へ `getPowerStations`/`setPowerStations` と同型のアクセサ・
年次自己ゲート・配列登録を追加する。

呼び出し順序（`src/extensions/economy/index.tsx`、era 6/7 プラント群ブロック、`LNGPlants.settleAnnual()` の直後）:

```ts
LNGPlants.settleAnnual();
// LNG/Machine Parts only, independent of every other plant above. State全体プール（powerGridの
// ような2段階抽象化なし）。docs/plan/mechanical-refrigeration-and-cold-chain.md §3.5.
ColdStorageDepots.settleAnnual();
```

### 3.6 保存: `cellFoodRescue.ts` への純粋関数追加

`cellFoodRescue.ts` に、`planCellFoodRescue()` 自体は一切変更せず、新規エクスポート関数を追加する:

```ts
/**
 * How many of a cell's raw fresh-food harvest units that planCellFoodRescue() could not eat fresh
 * or preserve (harvestedUnits - producedUnits, the gap the planner's own doc-comment says is
 * "simply not produced") can instead reach Market stock directly via cold-chain capacity. Pure
 * bookkeeping — the caller tracks and decrements the shared per-state capacity pool across cells.
 * Design: docs/plan/mechanical-refrigeration-and-cold-chain.md §3.6.
 */
export function getChilledFreshFoodExportUnits(
  harvestedUnits: number,
  producedUnits: number,
  availableCapacityUnits: number
): number {
  const leftover = positive(harvestedUnits - producedUnits);
  return Math.min(leftover, positive(availableCapacityUnits));
}
```

### 3.7 `markets-generator.ts`: `settleCellFreshFood()` への配線

`settleCellFreshFood()` の冒頭（`entriesByCell` を組み立てるループの前）に、月割り容量プールを構築する:

```ts
// State全体プール（§3.5 決定事項1）。年次 storageCapacity を月割りし、この呼び出し内で複数の
// cellが同じ州の容量を取り合う場合に備えて共有 Map で減算していく。
const coldStorageCapacityByState = new Map<number, number>();
for (const depot of getColdStorageDepots()) {
  if (!depot.active) continue;
  const monthly = depot.storageCapacity / 12;
  coldStorageCapacityByState.set(depot.stateId, (coldStorageCapacityByState.get(depot.stateId) ?? 0) + monthly);
}
```

セルごとの `inputs` 構築ループ内で、収穫量を `sourceGood.i` キーで別途記録する
（`harvestedBySourceGood: Map<number, number>`）。`plan.outcomes` を消費する既存ループの末尾（コミッシャル出力
処理の直後）に追加する:

```ts
const stateId = this.worldContext.pack.cells.state?.[cellId] ?? 0;
const availableCapacity = coldStorageCapacityByState.get(stateId) ?? 0;
if (availableCapacity > 0) {
  const harvested = harvestedBySourceGood.get(outcome.sourceGoodId) ?? 0;
  const chilled = getChilledFreshFoodExportUnits(harvested, outcome.producedUnits, availableCapacity);
  if (chilled > 0) {
    // 変換なし — sourceGood自身をMarket在庫へ。addRuralOutput()が在庫加算・recordGoodFlow・
    // recordFoodMarketIntake・累計販売カウンタを一括処理する（既存の呼び出しと同じヘルパー）。
    this.addRuralOutput(entry.marketId, entry.collectionBurgId, sourceGood.i, chilled);
    coldStorageCapacityByState.set(stateId, availableCapacity - chilled);
  }
}
```

`mechanicalRefrigeration` の技術段階を直接チェックする必要はない — 未 adopted の State は
`ColdStorageDepots.settleAnnual()` がプラントを作らず `storageCapacity` が常に0のままなので、容量そのものが
自然にゲートになる（`PowerStation`/`Electricity` と同じ「容量シグナルがゲートを兼ねる」設計）。

### 3.8 流通: `tradeOpportunityEstimator.ts` への `refrigeratedTransport` 引数追加

3関数のシグネチャに末尾オプション引数 `refrigeratedTransport?: boolean` を追加する（既存呼び出し元は未指定
= `undefined` = falsy のまま動作するため後方互換）:

```ts
export function getGoodMaxTradeDurationDays(
  good: Good,
  routeSegments?: readonly Pick<TradeRouteSegment, "type">[],
  routeMaxTemperatureC?: number,
  refrigeratedTransport?: boolean
): number {
  // ...
  if (isFreshFoodGood(good)) {
    // 冷蔵輸送が確立していれば、気候依存の日数上限を経由せず他の耐久財と同じ densityLimit を使う。
    if (refrigeratedTransport) return densityLimit;
    return Math.min(densityLimit, getFreshFoodMaxTradeDays(routeMaxTemperatureC));
  }
  // ...
}

export function isGoodTradePermitted(
  good: Good,
  durationDays: number,
  routeSegments?: readonly Pick<TradeRouteSegment, "type">[],
  routeMaxTemperatureC?: number,
  refrigeratedTransport?: boolean
): boolean {
  // mechanicalRefrigeration が産地Stateでadoptedなら、この無条件禁止を解除する
  // (docs/plan/mechanical-refrigeration-and-cold-chain.md §3.8)。
  if (isFreshFoodGood(good) && !refrigeratedTransport) return false;
  if (
    !Number.isFinite(durationDays) ||
    durationDays > getGoodMaxTradeDurationDays(good, routeSegments, routeMaxTemperatureC, refrigeratedTransport)
  )
    return false;
  return (/* 既存のseaOnly判定、非変更 */);
}

export function isGoodTradePermittedForShipment(
  good: Good,
  durationDays: number,
  maxLoadingWaitDays: number,
  routeSegments?: readonly Pick<TradeRouteSegment, "type">[],
  routeMaxTemperatureC?: number,
  refrigeratedTransport?: boolean
): boolean {
  const elapsedDays = isFreshFoodGood(good) ? durationDays + Math.max(0, maxLoadingWaitDays) : durationDays;
  return isGoodTradePermitted(good, elapsedDays, routeSegments, routeMaxTemperatureC, refrigeratedTransport);
}
```

5箇所の呼び出し元すべてで、既にスコープ内にある産地側Burg（§2監査の表を参照）から
`isTechnologyStageAtLeast(getTechnologyStage("mechanicalRefrigeration", originBurg.state ?? 0), "adopted")`
を1回計算して渡す。`caravans.ts` の `selectRouteCargo()`（`isGoodTradePermittedForShipment` の呼び出し元）は
現在この引数を持たないため、呼び出し元の `createCaravan` 相当の箇所（`startBurg` が既にスコープ内）から新規
引数として追加で渡す。

## 4. テスト計画

- `cellFoodRescue.test.ts`: `getChilledFreshFoodExportUnits()` の新規テスト——`harvested > produced` の差分
  だけを返すこと、`availableCapacityUnits` で頭打ちになること、`harvested <= produced`（既存の差分ゼロケース）
  で0を返すこと、負値の安全な扱い。
- `coldStorageDepots.test.ts`（新規、`powerStations.test.ts` と同じ形）。
- `technologyProgress.test.ts`: `mechanicalRefrigeration` の era・prerequisites・閾値キーの静的チェック。
  `coldStorageDepotTrialYears`/`coldStorageDepotInstallations` の集計テスト。
- `tradeRouteDuration.test.ts`: 既存の「無冷蔵時は禁止」テストの直後に、`refrigeratedTransport: true` 相当の
  引数を渡すと `isGoodTradePermitted`/`isGoodTradePermittedForShipment` が許可へ転じることを確認するケースを
  追加する。
- `markets-generator.test.ts` または新規ファイル: `settleCellFreshFood` 経由の統合的な確認は既存に単体テストが
  薄いため、`getChilledFreshFoodExportUnits` の単体テストと `coldStorageDepots.ts` 自体のテストで主要ロジックを
  カバーし、配線部分は型検査・lintで最低限の安全性を確保する。

## 5. 受け入れ条件

- `mechanicalRefrigeration` は `highPressureChemicalApparatus`/`standardMachineWorks` の両方が adopted になる
  まで `known` にすら進まない。`naturalGasLiquefaction` 自身の技術段階とは無関係に進行できる（史実整合の
  改訂、§3.3）。
- `ColdStorageDepots` が稼働していない、または `storageCapacity` が0の State では、`freshFood` Good の挙動は
  完全に従来どおり（未処理分は記録なく失われ、隊商・海上交易は無条件禁止のまま）。
- `ColdStorageDepots` が稼働し `storageCapacity > 0` になった State では、`harvestedUnits - producedUnits` の
  範囲内で、変換なしの生 Good（Milk/Fish/Game/Shellfish/6果実）が Market在庫へ直接加算される。
- 産地 State が `mechanicalRefrigeration` を adopted した場合のみ、`freshFood` Good が隊商・海上交易に
  乗れるようになる——気候（route温度）に応じた日数上限も他の耐久財と同じ扱いに切り替わる。
- 新規配列 `coldStorageDepots` を持たない旧セーブをロードしても、空配列として安全に初期化される。
- `npx tsc --noEmit`・`npm run lint`・関連ユニットテストがすべて通過する。

## 6. 決定事項 / Open Questions

1. **`ColdStorageDepots` は最初から州全体プール**。`powerGrid` のような2段階抽象化を設けない（§3.5）。
2. **新規 Good を追加しない**。既存の `freshFood` Good をそのまま冷蔵・流通させる（§1 非目的）。
3. **電気式冷凍を実装しない**。ガス圧縮式（LNG）のみ（§1 非目的）。
4. **`planCellFoodRescue()`/`cellFoodRescueTypes.ts` を一切変更しない**。プランナーの出力を後段で再利用する
   純粋関数として実装し、既存の食料安全保障ロジックへの回帰リスクをゼロにする（§3.6）。
5. **`mechanicalRefrigeration` の技術段階を `cellFoodRescue`側で直接チェックしない**——`storageCapacity` が
   ゲートを兼ねる、`PowerStation`/`Electricity` と同じ設計（§3.7）。
6. **`mechanicalRefrigeration` は `naturalGasLiquefaction` の子ノードではなく兄弟ノード**（2026-08-23
   改訂）。実用的な圧縮式冷凍（Linde、1876年）は工業的な天然ガス液化（同じくLinde、1895年以降）より数十年
   先行する史実に基づく——両者を「片方がもう片方の前提」にせず、同じ `highPressureChemicalApparatus`/
   `standardMachineWorks` を共有する兄弟として実装した（§3.3）。「LNGに絡んで」というユーザーの要求は
   技術前提ではなく `ColdStorageDepots` の燃料依存として表現する。
