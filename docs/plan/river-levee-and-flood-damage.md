# 河川堤防と洪水被害の接続 (River Levees and Flood Damage)

## 状態

**実装済み（2026-08-21）。** [disaster-mode.md](./disaster-mode.md) 優先度2「大雨・河川の氾濫」の実装前チェックで洗い出した
2つの欠落——(1) Damとは別の「堤防」という専用インフラが無い、(2) `floodProtectionByCell` が
[dam-flood-control-and-hydropower.md](./dam-flood-control-and-hydropower.md) §6 で明示的に
「消費者の無い抽象値のまま」と非目的化されたきり誰も読んでいない——を埋める。

## 1. 目的と非目的

### 目的

- Dam（点源＋下流逓減）や AgTechInvestment の水利事業（州全体一律ボーナス）とは別に、**氾濫原の危険度が
  高い河川区間そのもの**を対象にした州資金インフラ「Levee」を追加する。
- `floodProtectionByCell`（Dam/AgTechInvestmentが書き込むが消費者の無い0..1値）を、農業収穫高計算に
  実際に接続する——これによりダムと堤防の投資が初めてゲームプレイ上の意味を持つ。
- 地図上に見える形で置く（Damと同じくEconomy拡張自前のSVGレイヤー）。

### 非目的

- 気候異常（降雨量・河川流量の年変動）そのもののシミュレーション。これは disaster-mode.md 優先度0
  「災害共通基盤」の対象であり、本書はその基盤を前提にしない（`prec`/`cells.fl` は現状どおり静的）。
- EU4型の「予兆→進行→発災→復旧」という離散的な災害イベント・警告・緊急支出サイクル。本書が作るのは
  常時効く背景ドラッグ（後述3.4）のみ。共通基盤が実装された時に同じ `floodProtectionByCell` を読んで
  離散的な発災ダメージを軽減する形で**上乗せ**できるよう、接続点だけを一貫した形で残す。
- 堤防決壊、湖・貯水池、都市そのものの浸水シミュレーション（`urbanWaterSystem.ts` の `floodExposure` は
  既存のまま無変更）。
- 新規 Technology ノード（Damの決定事項2と同じ理由）。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| Dam の「地点生成→経済的稼働」二層パターン | `damSites.ts`（決定的・河川流量閾値・最小間隔で1回生成）→ `dams.ts`（State資金で年次稼働、Stone/Timber消費、floodProtectionByCellへ床値を上乗せ）。Levee はこの二層構造をほぼそのまま流用する。 | [damSites.ts](../../src/extensions/economy/generators/damSites.ts)、[dams.ts:180-207](../../src/extensions/economy/generators/dams.ts#L180) |
| `floodProtectionByCell` の書き込み元（消費者無し） | `AgTechInvestment.settleWaterWorks()` が州一律 `+= coverage*0.07` のEWMAで書き、`Dams.applyFloodProtection()` がダム地点＋下流に床値を重ねる。読み出し箇所はコード上どこにも無い。 | [agTechInvestment.ts:167-192](../../src/extensions/economy/generators/agTechInvestment.ts#L167)、[dams.ts:187-207](../../src/extensions/economy/generators/dams.ts#L187) |
| 洪水危険度の既存計算式 | `readBurgWaterGeography()` が `naturalFloodRisk = 0.35*lowLand + 0.3*fluxRisk(log flux) + 0.25*wetRisk + 0.2*rainRisk` を算出済み。都市の水系評価専用に見えるが、burg以外の任意セルにも呼べる汎用の純関数。 | [urbanWaterSystem.ts:225-283](../../src/extensions/economy/generators/urbanWaterSystem.ts#L225) |
| 農業収穫高への既存モディファイア接続点 | `AgriculturalConditions`（`irrigationSalinityByCell`/`fieldDrainageByCell`等）を `calculateAgriculturalLandProfile()` がセル毎の収穫高計算に直接乗算している。`floodProtectionByCell` は未接続。 | [agriculturalLandUse.ts:116-131](../../src/extensions/economy/generators/agriculturalLandUse.ts#L116)、[agriculturalLandUse.ts:1065](../../src/extensions/economy/generators/agriculturalLandUse.ts#L1065) |
| State資金インフラの会計パターン | `debitTreasury(stateId, amount)` / `consumeNamed(marketId, name, amount)` / `marketIdForBurg(burgId)`。Damは`DAM_BUDGET=26`。 | [chemMedCommon.ts:53-122](../../src/extensions/economy/generators/chemMedCommon.ts#L53) |
| 河川下流トポロジー | `buildRiverDownstream(cells, rivers)`（`cells.riverDownstream` 再構築、灌漑・Damと共有）。 | [riverWaterAllocation.ts:220-237](../../src/generators/riverWaterAllocation.ts#L220) |
| 危険度0.45という既存の目安値 | `urbanWaterSystem.ts` 自身が `naturalFloodRisk >= 0.45` を「水系リスクを踏まえた立地判断」の閾値として既に使っている。Levee候補地の閾値をこれに揃える。 | [urbanWaterSystem.ts:361](../../src/extensions/economy/generators/urbanWaterSystem.ts#L361) |

## 3. 設計

### 3.1 共有ハザード式の抽出: `floodHazard.ts`（新規）

`readBurgWaterGeography()` 内の `naturalFloodRisk` 計算部分を、burgに依存しない純関数として抽出する。
既存の `urbanWaterSystem.ts` は抽出した関数を呼ぶだけに書き換え、挙動は無変更（リファクタリングのみ）。

```ts
// src/extensions/economy/generators/floodHazard.ts
export function computeNaturalFloodRisk(args: {
  cellId: number;
  cells: Pick<PackedGraphCells, "h" | "fl" | "r" | "biomeCode">;
  biomesTags?: Record<number, readonly string[]>;
  gridPrec?: Float32Array;
}): number {
  // lowLand/fluxRisk/wetRisk/rainRisk の計算をそのまま移設
}
```

`leveeSites.ts` と `agriculturalLandUse.ts` の双方がこれを import する。都市の`floodExposure`
（`urbanWaterSystem.ts`側、雨水排水・都市化を加味した別概念）とは意図的に分離したまま——
`economyContext.ts:558`のコメント「Irrigation, flood protection, and field drainage intentionally
remain independent investments」と同じ精神で、農村の`floodProtectionByCell`と都市の`floodExposure`は
別の投資・別の被害経路として扱う。

### 3.2 地点生成: `leveeSites.ts`（新規）

`damSites.ts`と同じ「1回だけ決定的に生成」。Damが単一セルの点であるのに対し、Leveeは**連続した氾濫原区間
（reach）**を対象にする——実際の堤防が川に沿って延びる構造物であるため。

```ts
export interface LeveeSite {
  i: number;
  riverId: number;
  cells: number[]; // 危険度がしきい値以上の連続した陸地河川セル、下流方向に並ぶ
  x: number; // reach中点
  y: number;
  meanFloodHazard: number; // 0..1、reach内naturalFloodRiskの平均
  qualityScore: number; // 保護される人口・農地の期待値で重み付け（後述）
}
```

生成ロジック（`damSites.ts`の`meanFlux`比較・最小間隔ロジックを踏襲）:

1. 全陸地河川セルについて `computeNaturalFloodRisk()` を計算。
2. `>= LEVEE_RISK_THRESHOLD (0.45、urbanWaterSystem.tsと同じ目安値)` のセルを種として、
   `cells.riverDownstream` を辿って同じ`riverId`かつ `>= LEVEE_CONTINUE_THRESHOLD (0.3、種より緩い継続条件)`
   のセルが続く限り連結し、reachを作る（`MAX_LEVEE_REACH_CELLS = 10`で打ち切り）。
3. 既にreachに含まれたセルは次の種の探索から除外（reach同士は重複しない）。
4. `qualityScore`は`meanFloodHazard`と、reach沿いの`cells.pop`合計・耕作適地面積を掛け合わせた期待被害軽減量
   （calibration TBD）——DamのqualityScoreが流量・落差という「発電の質」を測るのに対し、Leveeは
   「守る価値のある土地の質」を測る。
5. `frontierFortsGenerator.ts`/`damSites.ts`と同じ`minSpacing`でreach同士の近すぎる重複を軽く間引く
   （reach内は既にステップ3で重複除外済みなので、主にreach間の近接を弱く抑える目的）。

DamSiteと同じく`stateId`は持たない——所有権は`cells.state[site.cells[0]]`を稼働判定のたびに動的に見る
（境界変動でreachの所属Stateが変わり得る点もDamの単一セルと同じ特性を踏襲。決定事項参照）。

### 3.3 経済モジュール: `levees.ts`（新規）

`dams.ts`の年次会計をほぼそのまま流用するが、Damの「trial→service昇格」「電化」に相当する二段階の
概念が無い（堤防に発電のような第二の能力アップグレードは無いため、単純化する。決定事項参照）。

```ts
export interface Levee {
  i: number;
  siteId: number;
  stateId: number;
  burgId: number;
  active: boolean;
  utilization: number;
  lastFundedYear: number;
  protectionRating: number; // 0..1、site.cells全体に一律適用
  lastFailureReason?: "materialShortage" | "fundingCut";
}
```

- `Levees.settleAnnual()`。年次自己ゲート（`getLeveesLastSettledYear`）。
- Stateごとに最大`MAX_LEVEES_PER_STATE = 4`区間まで同時維持可能（Damの3基よりやや緩い——堤防は
  ダムより単価が低く数を持ちやすいという想定）。上限未満なら、未着手の`LeveeSite`を`qualityScore`
  降順で1つ選び`debitTreasury(state.i, LEVEE_BUDGET)`が通れば新設。
- 既存の各アクティブLeveeに毎年`debitTreasury(state.i, LEVEE_BUDGET)`（新設年は二重debit、Damと同じ形）。
  失敗したら`active=false`、`lastFailureReason="fundingCut"`。
- `LEVEE_BUDGET = 10`（`chemMedCommon.ts`に追加。calibration TBD——DAM_BUDGET(26)より小さい。
  取水設備や発電機を持たない土堤・木工沈床のみのため）。
- Stone 1・Timber 3を`consumeNamed`で消費（土盛り＋木工沈床の補修、Damより土木寄りでTimber比率が高い）。
  `coverage = Math.min(1, stone/1, timber/3)`、`utilization = coverage`。
- `protectionRating = LEVEE_FLOOD_BASE(0.5) * utilization`（calibration TBD——Damの`FLOOD_BASE(0.6)`より
  やや低い。堤防は能動的な流量調整ができない受動的防御のため）。
- **floodProtectionByCellへの反映**: `dams.ts`の`applyFloodProtection()`と全く同じ「floor、置き換えでは
  ない」意味論（`Math.max`）を、`site.cells`全体に一律で適用する（Damのような下流逓減は無い——堤防が
  物理的に効くのはその区間だけ）。`index.tsx`の呼び出し順で`Dams.settleAnnual()`の直後に置くことで、
  Damと同じく毎年floorが再度上乗せされ、AgTechInvestmentのEWMA減衰に食われない。

### 3.4 `floodProtectionByCell` の消費: `agriculturalLandUse.ts`

これが本書の核心——Dam/Levee/AgTechInvestmentの投資に初めて実際のペイオフを与える。

`AgriculturalConditions`に追加:

```ts
/** 0..1、Dam/Levee/AgTechInvestmentが書き込む治水投資水準。未接続だった値をここで消費する。 */
readonly floodProtectionByCell?: Float32Array;
```

`computeNaturalFloodRisk()`（3.1）をセル毎に呼び、収穫高計算の中で既存の`irrigationSalinity`適用箇所
（[agriculturalLandUse.ts:1065](../../src/extensions/economy/generators/agriculturalLandUse.ts#L1065)
付近）と同じ乗算パターンで適用する:

```ts
const floodHazard = computeNaturalFloodRisk({ cellId, cells, biomesTags, gridPrec });
const floodProtection = conditions.floodProtectionByCell?.[cellId] ?? 0;
const floodExposureLoss = clamp01(floodHazard * (1 - floodProtection) * FLOOD_YIELD_DAMAGE_SEVERITY);
yieldMultiplier *= 1 - floodExposureLoss;
```

`FLOOD_YIELD_DAMAGE_SEVERITY = 0.35`（calibration TBD——無防備かつ最高危険度のセルで収穫高最大35%減、
salinityペナルティと同程度の桁）。

これは**離散的な「発災」ではなく常時効く背景ドラッグ**である（非目的節参照）。`prec`/`cells.fl`が
現状静的なため年ごとの変動は無く、Dam/Levee/AgTechInvestmentが育つにつれて`floodProtection`が上がり
ドラッグが縮む——投資へのインセンティブループとしてはこれだけで十分に機能する。将来
disaster-mode.md優先度0の「災害共通基盤」が気候異常と離散的な発災イベントを実装したら、その被害計算も
同じ`floodProtectionByCell`を読んで軽減率として使い、本書のドラッグに**加算**する形で自然に接続できる
（`prec`が年変動するようになれば、このドラッグ自体も自動的に年変動するようになる——追加の配線は不要）。

### 3.5 レンダラー: `drawLevees.ts`（新規）

`drawDams.ts`と同型だが、reachを表現するため単一アイコンではなく`site.cells`の座標を結んだ
`<polyline>`（またはpath）を描画する。色・不透明度は`active`/`lastFailureReason`で変える
（`drawDams.ts`のINACTIVE_OPACITY相当）。hover titleに保護区間の長さ・保護率%を表示。

### 3.6 配線

- `economyLayers`に`toggleLevees`エントリを追加（`svgLayers: [{id:"levees", insertBefore:"icons", display:"none"}]`）。
- `registerLayerElement`/`registerLayerToggle`/`registerDrawLayerHook`に`levees`を`dams`と同型で追加。
- `DamSites.generate()`と同じ箇所（"minerals" regenerateターゲット、初期生成パイプライン）に
  `LeveeSites.generate()`を追加。実行時は`Levees.clear()`も呼ぶ（Damの3箇所——[index.tsx:1039](../../src/extensions/economy/index.tsx#L1039)、
  [index.tsx:1446](../../src/extensions/economy/index.tsx#L1446)、[index.tsx:2391](../../src/extensions/economy/index.tsx#L2391)
  ——と同じ並びに`Dams.clear()`と並べて置く）。
- `Dams.settleAnnual()`の直後（[index.tsx:3028](../../src/extensions/economy/index.tsx#L3028)）に
  `Levees.settleAnnual()`を追加。
- `DevelopmentPotential.updateAnnualAgriculture()`の呼び出し前に`floodProtectionByCell`が確定している
  ことを確認する（Dam/Levee/AgTechInvestmentはいずれもこれより前の`measureTickStep`ブロックで既に
  年次確定しているため、追加の順序変更は不要——3.4の消費側だけを新設すれば良い）。

### 3.7 永続化

- `economyContext.ts`: `getLeveeSites`/`setLeveeSites`、`getLevees`/`setLevees`、
  `getLeveesLastSettledYear`/`setLeveesLastSettledYear`を`getDamSites`等と同型で追加。
- `extensionStateSlices.ts`の`validateEconomySlice()`配列に`"leveeSites"`/`"levees"`を追加。
- 新規Good・新規Technologyノードは不要。

## 4. 決定事項

1. **Leveeは「区間（reach）」、Damは「点」**。実物の堤防が線的構造物であることに合わせる。この違いが
   `LeveeSite.cells: number[]`とDamの`downstreamCells`逓減方式の非対称性の理由——Leveeは区間内一律、
   Damは下流ほど減衰。
2. **Leveeにtrial/service昇格・電化に相当する段階は設けない**。堤防には発電のような第二の能力
   アップグレードが無いため、`role`/`documentedRuns`/`electrified`フィールドは持たない
   （`active`/`utilization`/`lastFailureReason`のみ）。Damより単純なモデル。
3. **本書は離散的な発災イベントを作らず、連続的な背景ドラッグのみを実装する**。disaster-mode.md
   優先度0「災害共通基盤」が離散的な発災サイクル（予兆→進行→発災→復旧）を設計する前提であり、
   それを先取りして一回限りの実装にすると後で手戻りになる。`floodProtectionByCell`という共有の
   接続点だけを先に有効化しておき、将来の発災イベントはそこに乗せる。
4. **新規Technologyノードは設けない**（Damの決定事項2と同じ理由）。堤防の実質的なゲートは
   氾濫原危険度立地とTreasury予算。
5. **都市の`floodExposure`（urbanWaterSystem.ts）とは統合しない**。都市の雨水排水・都市化リスクという
   別概念であり、`economyContext.ts:558`のコメントが示す「独立した投資であるべき」という既存方針を
   踏襲する。
6. **LeveeSiteはstateIdを持たず、`cells.state[site.cells[0]]`で動的に所有権判定する**。reachが州境を
   跨ぐケースはDamの単一セルと同じ特性（境界変動で所属Stateが切り替わる）を受け入れる——境界を跨ぐ
   reachを分割する専用ロジックは今回のスコープ外（フォローアップ候補）。

## 5. テスト計画

- `floodHazard.test.ts`: 抽出した`computeNaturalFloodRisk()`が`urbanWaterSystem.ts`の既存挙動と
  数値的に一致すること（リファクタリングの回帰防止）。
- `leveeSites.test.ts`: 決定的生成、危険度しきい値、`MAX_LEVEE_REACH_CELLS`打ち切り、reach間の
  非重複、`riverDownstream`が無い/河口セルの除外、`clear()`。
- `levees.test.ts`: 予算不足で新設されないこと、`MAX_LEVEES_PER_STATE`上限、Stone/Timber不足で
  utilizationが下がること、`protectionRating`の計算、`floodProtectionByCell`がreach全体に一律
  floor適用されること（Math.max保証、Damの床値を下回らないこと）、年次自己ゲート。
- `agriculturalLandUse.test.ts`: `floodProtectionByCell`未接続時は無変更（後方互換）、危険度0の
  セルはドラッグ0、`floodProtection=1`ならドラッグ0（完全防御）、`floodProtection=0`かつ危険度1なら
  `FLOOD_YIELD_DAMAGE_SEVERITY`満額のドラッグ。
- `drawLevees.test.ts`: reachのpolylineが正しい座標列で描画されること、inactive/failure時の
  不透明度変化、siteが存在しないLeveeは描画されないこと。

## 6. フォローアップ候補（本書の範囲外）

- disaster-mode.md優先度0「災害共通基盤」実装後、離散的な「発災」イベントの被害計算に
  `floodProtectionByCell`を軽減率として接続する（本書の背景ドラッグに加算）。
- 堤防決壊（`protectionRating`が閾値を割った年に一時的な急激被害を与える等)。
- Dam/Levee間の重複投資を避けるための`qualityScore`相互ペナルティ（同一セルが既にDamの下流逓減で
  高く保護されている場合、Levee側のqualityScoreを下げる等）。
- reachが州境を跨ぐ場合の分割ロジック。
- 専用Overviewダイアログ・Cell Info表示（Damと同じくフォローアップ）。
