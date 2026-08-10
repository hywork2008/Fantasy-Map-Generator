# 河川水配分システム設計 (River Water Allocation)

## 状態

**2026-08-10 Phase 1--3 の初回実装済み**。河川からの灌漑を、砂漠セルかつ河川セルという無量の特例から、流量・耕地面積・不足水分・設備による年次水収支へ置き換えた。

- `riverWaterAllocation.ts` が有向河川網の検証・取水配分・下流残流量を担当する。旧セーブに `riverDownstream` が無い場合は既存の `River.cells` から再構築する。
- Economy は灌漑開発度、送水効率、実灌漑面積、実到達水量、水ストレス、洪水対策、圃場排水を別の列に保存する。
- 灌漑結果は作物適性・収量・塩害と農村人口の実効食料容量へ接続済みである。

湖はこの Phase の対象外である。河川と湖を同じ型へ正規化せず、まず河川専用の水配分を完成させる。将来の湖取水は別の source adapter として検討する。

## 1. 目的と非目的

### 目的

- 河川に近いセル一般を灌漑候補にする。ただし河川が存在するだけでは灌漑されず、取水量・水路能力・利用可能面積が全て制約する。
- 上流の取水が同じ年の下流残流量を減らす。後続の灌漑・漁撈・航行は、必要になった時に同じ残流量を読める。
- `cells.area` の物理面積と作物の不足降水量から、可灌漑面積と実際に畑へ届く水量を計算する。
- 灌漑設備、洪水対策、圃場排水を別々の投資・結果にする。
- Economy は投資と農業需要を所有し、host は河川トポロジーと水配分だけを所有する。host は Economy を import しない。

### 非目的 (Phase 0--2)

- 湖・地下水・海水淡水化・複数河川からの最適取水。
- ダム貯水、水位、月別の渇水、還元水、灌漑用水路の地図上の経路。
- 洪水対策で平常時の取水量を増やすこと。
- 実世界の m³/s を厳密に再現すること。現行 `cells.fl` は降水から生成される相対値であり、`River.discharge` の名前に反して面積保存された物理流量ではない。

## 2. 採用する Module と seam

`src/generators/riverWaterAllocation.ts` を host の深い Module とする。河川網を検証・コンパイルする処理と、年次の全取水要求を解く処理だけを公開する。作物、国家、予算、洪水、塩害、人口、UI はその Interface に含めない。

```text
Rivers.generate / map load
        │ River + cells.fl + directed river topology
        ▼
compileRiverWaterNetwork()                 host / derived cache
        │
        │ RiverWaterNetwork
        ▼
Economy: irrigation investments + crop water demand
        │ neutral RiverWithdrawal[]
        ▼
allocateRiverWater()                       host / pure calculation
        │ irrigation allocation + residual flow
        ├──────────────────► Economy agriculture / salinity
        └──────────────────► future fishing / navigation readers
```

この seam は in-process であり、port や adapter は追加しない。built-in Economy は host の公開関数を利用する。動的 extension に同じ権限を与える必要が生じた時だけ、同じ Interface を `ExtensionAPI` capability として公開する。

### 公開 Interface

```ts
type AnnualWater = number;
type RiverSegmentId = string;

interface RiverWaterNetworkInput {
  readonly pack: Readonly<Pick<PackedGraph, "cells" | "rivers">>;
  /** `cells.fl` の1単位を AnnualWater に読む地図固有の校正値。 */
  readonly annualWaterPerFlux: number;
  /** 畑から取水口まで許容する最大距離。Phase 1 は河川セル自身なら 0。 */
  readonly maximumIntakeDistance: number;
}

interface RiverWaterNetwork {
  readonly revision: string;
  /** field cell -> canonical river segment. Candidate search is network 内部に隠す。 */
  readonly intakeByFieldCell: readonly (RiverIntake | null)[];
  readonly diagnostics: readonly RiverNetworkDiagnostic[];
}

interface RiverWithdrawal {
  readonly id: string;
  readonly intake: RiverIntake;
  readonly beneficiaryCellId: number;
  /** 取水口で必要な年間水量。 */
  readonly requestedWithdrawal: AnnualWater;
  /** 渠首・水路の設備上限。 */
  readonly maximumWithdrawal: AnnualWater;
  /** 取水量のうち圃場に届く比率。 */
  readonly conveyanceEfficiency: number;
  /** 小さいほど優先。同順位は id の昇順で決定的に処理する。 */
  readonly priority: number;
}

interface RiverWaterAllocation {
  readonly status: "complete" | "degraded" | "unavailable";
  readonly allocations: readonly RiverWithdrawalAllocation[];
  /** 河川セルごとの、取水後に下流へ渡る AnnualWater。 */
  readonly residualFlowByCell: Float32Array;
  readonly withdrawnFlowByCell: Float32Array;
  readonly diagnostics: readonly RiverAllocationDiagnostic[];
}

export function compileRiverWaterNetwork(input: RiverWaterNetworkInput): RiverWaterNetwork;
export function allocateRiverWater(
  network: RiverWaterNetwork,
  withdrawals: readonly RiverWithdrawal[],
  policy: RiverWaterAllocationPolicy
): RiverWaterAllocation;
```

`RiverWaterNetwork` は River と Pack から復元できる派生キャッシュなので保存しない。`RiverWaterAllocation` はその年の Economy slice に保存する。これにより、再描画や読み取りだけで Pack を mutate しない。

## 3. 単位と水収支

### 3.1 相対年水量

`cells.fl` は相対 flux であるため、Phase 1 は `AnnualWater` という内部単位を使う。物理面積は既存式を再利用する。

```text
physicalAreaHa = cells.area[cell] × distanceScale² × 100
fieldWaterDeficit = max(0, targetCropWaterProxy − rainfallProxy)
deliveredWater = irrigatedAreaHa × fieldWaterDeficit
withdrawnWater = deliveredWater / conveyanceEfficiency
```

`annualWaterPerFlux` は `cells.fl` と `deliveredWater` を同じ `AnnualWater` に写す host の校正定数である。現行の降水も年平均の proxy 値なので、単位を mm や m³/s と偽称しない。将来、河川生成が面積保存された年間体積と降水深を出せるようになれば、校正の implementation だけを物理単位へ置換する。

### 3.2 セグメントの収支

河川網は source から mouth へ有向の `RiverSegment` DAG として Module 内部へコンパイルする。`River.cells` は合流時の river id 再割当て、湖セル、`-1` の画面外出口を含むため、その配列を年次会計の順序として直接信頼しない。

```text
upstream residual + local natural inflow
  = environmental-flow reserve + withdrawals + downstream residual
```

- 同一セグメントの要求は `priority` 昇順、同順位なら比例配分、完全同順位なら `id` 昇順で解く。
- 取水は `min(requestedWithdrawal, maximumWithdrawal)` を超えない。
- 送水損失も取水時点で河川から失われる。`delivered = withdrawn × conveyanceEfficiency` であり、圃場到達量だけを差し引いてはならない。
- `residualFlow >= 0` と環境流量の下限を常に守る。
- Phase 1 は return flow を 0 とする。水は下流で再出現しない保守的なモデルである。

### 3.3 トポロジー生成

`Rivers.generate()` は水を下流へ渡す時点で、灌漑用途にも使える明示的な有向接続を出力する。候補は `pack.cells.riverDownstream?: Int32Array` とする（`-1` は河口・画面外）。河川編集・load migration はこの列を再構築する。

`compileRiverWaterNetwork()` はこの列と `cells.fl` を検証し、以下を診断する。

- 閉路、非河川セルへの接続、欠落した segment
- 上流自然流量和より小さい下流自然流量
- 負または非有限の flux

不正な要求・到達不能な取水口はその要求を未充足 0 配分にし、他の河川は継続する。網の閉路や必須トポロジー欠落は `unavailable` とし、Economy は天水農業へ fail-closed する。

## 4. Economy 側の責務

Economy は専用 slice に次のセル列を持つ。これらを `stateAgriculturalProductivity` へ混ぜない。

| 列 | 範囲 | 効果 |
| --- | --- | --- |
| `irrigationDevelopmentByCell` | 0..1 | 取水口・水路・維持の到達度。指揮面積と最大取水量を制約する。 |
| `irrigationConveyanceEfficiencyByCell` | 0..1 | 同じ取水量から畑へ届く比率。 |
| `irrigatedAreaHaByCell` | ha | 実際に配水された耕地。 |
| `irrigationDeliveredWaterByCell` | AnnualWater | 塩害・表示に使う実到達水量。 |
| `irrigationWaterStressByCell` | 0..1 | 未充足需要の比率。 |
| `floodProtectionByCell` | 0..1 | 洪水頻度・被害を下げる。取水量は変えない。 |
| `fieldDrainageByCell` | 0..1 | 塩害、溶脱、湛水被害を変える。取水量は変えない。 |

`IrrigationWorks`（Economy 内部）の所有者・建設費・維持費・水路能力・優先順位を、年次農業更新の直前に中立な `RiverWithdrawal[]` へコンパイルする。Core は作物、国家、所有者、収支を知らない。

## 5. 農業・人口への接続

`AgriculturalConditions` に、read-only な灌漑結果を渡す。

1. Economy が作物ミックス、天水、耕作上限、既存の投資から全セルの `RiverWithdrawal[]` を作る。
2. `allocateRiverWater()` を年に一度だけ呼ぶ。セルごとの問い合わせにしてはならない。そうすると入力順で上流・下流の結果が変わる。
3. 農業は `irrigatedAreaHa` と届いた水で、天水区画と灌漑区画を面積加重して作物適性・収量を出す。
4. 今年の収量は前年末の塩害を読む。今年の `irrigationDeliveredWater`、乾燥度、`fieldDrainage` は次年の塩害を更新する。需要と収量の同一年循環を避ける。
5. Food Ledger・農村労働・人口は、解決済みの food capacity を読む。人口から同じ年に再度水需要を増やす反復計算は行わない。

初期マップ生成時は灌漑投資を 0 とする。したがって core の `subsistenceCapacity` は、河畔の自然な水分・漁撈を別として、国家建設済みの人工灌漑を先取りしない。年次 Economy が投資を積み、農業食料容量の bridge を通じて人口上限へ反映する。

## 6. 投資の独立性

```text
Irrigation works ─► river withdrawal ─► irrigated area / crop water / salinity
Flood works      ─► flood exposure / damage only
Field drainage   ─► salinity leaching / waterlogging only
```

- 灌漑は収量を増やせるが、洪水への耐性を増やさない。
- 洪水対策は水害を抑えるが、平常時の河川水利や作物適性を増やさない。
- 圃場排水は塩害を緩和するが、取水権や水路能力を増やさない。
- 既存の `stateAgriculturalProductivity` は道路等の一般的な収量補正に縮小し、灌漑の代理値としては使わない。

## 7. 実装順序

### Phase 1: 河川帳簿（実装済み）

1. `riverDownstream` を river generation と load migration で生成・検証する。
2. `riverWaterAllocation.ts` に network compiler と純粋 solver を作る。
3. unit test で、合流、上流取水、同地点の不足時配分、環境流量、決定性、壊れた網の fail-closed を検証する。

### Phase 2: 灌漑需要と作物（実装済み）

1. Economy slice と `IrrigationWorks` を追加する。
2. `AgriculturalConditions` に area-weighted irrigation result を接続し、`desert && river` の無量特例と河川 +8% 収量補正を廃止する。
3. 気候ダイアログと Cell Info に、雨量、補填量、灌漑面積、水ストレス、取水後残流量を表示する（実装済み）。

### Phase 3: 年次投資・塩害・人口（初回実装済み）

1. 予算・Tools・維持費から灌漑開発度と送水効率を更新する。
2. `floodProtection` と `fieldDrainage` を別の投資列として追加する。個別の予算配分 UI は将来追加する。
3. 実際の灌漑水量と排水から塩害を更新する。
4. Economy の food capacity を人口シミュレーションの実効上限へ渡す公式 bridge を追加する。

## 8. テストの Interface

`riverWaterAllocation.test.ts` は Module の Interface だけをテストする。内部 segment の構築手順や配列順は検証しない。

- 同じ要求集合を並べ替えても同じ allocation になる。
- 上流の取水を増やすと、同じ河川の下流 residual は増えない。
- 合流では残流量だけが合計され、自然流量を二重計上しない。
- 送水効率を下げると同じ delivered water により大きい withdrawal が必要になる。
- 環境流量の予約を下回る取水を許可しない。
- 壊れた directed topology は `unavailable` であり、水を創出しない。
- 農業 adapter は部分灌漑地と天水地を面積加重し、配分されていない水を収量へ加えない。
