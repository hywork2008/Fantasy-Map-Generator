# 干魃・熱波と災害共通基盤 (Drought/Heatwave, and a Common Disaster Cycle)

## 状態

**実装済み（2026-08-21）。** [disaster-mode.md](./disaster-mode.md) の実装容易性表で「高」評価のまま
残っていた優先度0「災害共通基盤」と優先度1「干魃・熱波」を合わせて実装する。

## 1. 目的と非目的

### 目的

- [river-levee-and-flood-damage.md](./river-levee-and-flood-damage.md) と
  [epidemic-cholera-and-water-security.md](./epidemic-cholera-and-water-security.md) は、どちらも
  意図的に「連続的な背景ドラッグ／損耗」に留め、`平時の脆弱性 → 予兆 → 災害進行 → 発災 → 救済・復興` という
  disaster-mode.md の離散サイクルを本書（優先度0の共通基盤）に委ねていた。干魃・熱波を、その離散サイクルを
  実際に実装する最初の災害として仕上げる。
- `prec`/`temp` が生成時の静的値のままである制約の中で、「今年は例年より乾燥している」という**年ごとの
  気候変動**を、州スコープの軽量な確率ウォークとして導入する（フルの気候シミュレーションは対象外）。
- 干魃の被害を、disaster-mode.mdの実装前チェックが「ほぼ土台あり」と評価した既存の灌漑・備蓄・救済・輸入網
  （`irrigationDevelopment`、`stapleCropInventory.ts`、`cellFoodRescue.ts`、`foodImportNetwork.ts`）と
  既存の飢饉死経路（`demography-simulator.ts`の`roomForGrowth<0`）にそのまま接続する——epidemicのように
  新しい人口損耗経路を作る必要はない、というdisaster-mode.md自身の助言（「既存の生産減、価格上昇、飢饉死、
  収容力への傷跡を再利用できる」）に従う。
- 国庫を溶かす動機づけという災害モードの目的そのものを、干魃で具体化する: 発災中は緊急救済費を国庫から
  支出でき、支出できれば被害が緩和し、できなければ深刻化する。

### 非目的

- フルの気候シミュレーション（風向き・海流・季節内変動）。年1回・州単位の軽量ロールに留める。
- 熱波を干魃と別の災害として分離すること。両者は「高温・少雨による作物ストレス」という同じ因果と同じ
  対策（灌漑・穀倉）を共有するため、単一の`severity`指標に統合する（disaster-mode.mdの優先度1が
  「干魃・熱波」を最初から一つの行にまとめていることと整合）。
- 州境をまたぐ地域差（同じ州内の砂漠と湿潤地を区別しない）。既存のAgTechInvestmentの水利事業ボーナスも
  州一律であり、同じ粒度を踏襲する。将来的な州→属州粒度への細分化はフォローアップ候補。
- 洪水・疫病を本書の離散サイクルへ載せ替えること（フォローアップ候補、§6）。
- 新規Technologyノード、新規UI専用ダイアログ（TreasuryOverviewDialogへの列追加のみ行う）。

## 2. 現状監査（コード参照）

| 項目 | 現状 | 参照 |
| --- | --- | --- |
| 州スコープの年次自己ゲート設定 | `getXxxLastSettledYear`/`setXxxLastSettledYear`パターンが約30種類存在。`Dams.settleAnnual()`/`Levees.settleAnnual()`と同型。 | [economyContext.ts:1719-1735](../../src/extensions/economy/economyContext.ts#L1719) |
| 州一律ブロードキャストの先例 | `AgTechInvestment.settleWaterWorks()`が`coverageByState`を1回のcellループで`cells.state[cellId]`経由でFloat32Arrayへブロードキャストする。 | [agTechInvestment.ts:169-196](../../src/extensions/economy/generators/agTechInvestment.ts#L169) |
| 未接続の背景ドラッグ接続点 | `AgriculturalConditions.floodProtectionByCell`が`calculateClimateYield()`内で乗算されている——同じ関数に`climateFoodStressByCell`を追加する。 | [agriculturalLandUse.ts:1039-1099](../../src/extensions/economy/generators/agriculturalLandUse.ts#L1039) |
| Stateの物語ログ（chronicle）先例 | `state.councilSessionLog`——リングバッファ、`summary`必須のプレーン文字列＋`messageKey`任意のi18nキー。新規ダイアログを作らずとも`summary`だけで機能する設計。 | [councilSession.ts:76-101](../../src/extensions/economy/generators/councilSession.ts#L76)、[models.ts:924-936](../../src/types/models.ts#L924) |
| 治水投資が作物適性に直結する既存経路 | `irrigationDevelopmentByCell`/`irrigationWaterStress`（河川取水の充足率）がすでに州の灌漑投資水準を反映。 | [economyContext.ts:549-596](../../src/extensions/economy/economyContext.ts#L549) |
| 既存の飢饉死経路 | `demography-simulator.ts`が`roomForGrowth<0`のとき`famine`死因で人口を削る——`foodPotential`/`yieldPerArea`の低下は自動的にこの経路へ波及する。 | disaster-mode.md実装前チェック表 |
| 部分支出ヘルパーの欠如 | `debitTreasury(stateId, amount)`は全額調達できない場合に**何もせず失敗**する（all-or-nothing）。緊急救済は「出せるだけ出す」必要があるため、専用の部分支出ヘルパーを新設する。 | [chemMedCommon.ts:124-129](../../src/extensions/economy/generators/chemMedCommon.ts#L124) |
| 州単位の既存フロンティア災害モデル | `frontierGovernance.ts`の`FrontierDisaster`（`drought`/`flood`/`epidemic`/`bandits`）は州編入前のフロンティア開拓地限定で、既存の州・都市には効かない。本書はこれを一般化するのではなく、`AgriculturalConditions`接続を前提に別実装する（フロンティアの`drought`ロジックとは独立)。 | [frontierGovernance.ts:166-195](../../src/generators/frontierGovernance.ts#L166) |

## 3. 設計

### 3.1 州単位の年次気候ロール: `climateDisasters.ts`（新規）

```ts
export type DisasterStage = "calm" | "watch" | "active" | "severe" | "recovering";
```

`ClimateDisasters.settleAnnual(rng)`が年1回（`Dams`/`Levees`と同じ`getClimateDisastersLastSettledYear`
自己ゲート）、3パスで実行する。

1. **集計パス**: 全陸地セル（`cells.h >= 20`）を1回走査し、`cells.state[cellId]`でグルーピングして
   州ごとの平均`prec`/`temp`（`world.grid.cells`、`cells.g`経由）と平均`irrigationDevelopment`を求める。
2. **判定パス**: 州ごとに
   - `aridity = computeStateAridity(avgPrec, avgTemp)`（降水75%・気温25%の重み付け、乾燥/高温ほど1に近づく）
   - `anomaly = rollClimateAnomaly(state.climateAnomaly, rng)`（前年の`state.climateAnomaly`を60%保持する
     平均回帰ランダムウォーク。`rng.gauss()`を使用——`rng.rand(min,max)`は整数しか返さないため不適）
   - `severity = computeDroughtSeverity(aridity, anomaly, avgIrrigation)`（`aridity`55%・`max(0,anomaly)`45%を
     合成した後、灌漑水準で最大55%まで軽減）
   - `stage = advanceDisasterStage(previousStage, severity, consecutiveActiveYears)`——ヒステリシス付き
     ステージマシン（下記3.2）
   - 緊急救済（`active`/`severe`のみ、下記3.3）を差し引いた`climateFoodStress`を確定
   - ステージが変化した年だけ`state.disasterLog`にチronicleを1行追加（下記3.4）
3. **ブロードキャストパス**: 全陸地セルを再度走査し、`climateFoodStressByCell[cellId] = stressByState[cells.state[cellId]] ?? 0`
   を書き込む（`AgTechInvestment.settleWaterWorks()`と同型）。

`index.tsx`では`AgTechInvestment.settleAnnual()`の直後・`DevelopmentPotential.updateAnnualAgriculture()`の
直前に置く——この年の乾燥が翌年ではなく**この年の収穫**に効くようにする（Dam/Leveeの1年遅延`floodProtectionByCell`
とは異なり、干魃は当年即時反映が因果的に正しいため）。

### 3.2 ステージマシン（ヒステリシス付き）

| 遷移元\条件 | severity ≥ 0.75、または(severity ≥ 0.5 かつ連続2年目) | severity ≥ 0.5 | severity ≥ 0.28 | それ以外 |
| --- | --- | --- | --- | --- |
| calm/watch | severe | active | watch | calm |
| active/severe | severe | active | watch | **recovering**（即座にcalmへは戻らない） |
| recovering | severe | active | watch | severity < 0.2 なら calm、それ以外は recovering 継続 |

`state.droughtYears`（`active`/`severe`の連続年数）が2年以上続くと、severity 0.5でも`severe`へ格上げする
——EU4的な「長引くほど深刻化する」進行を表現する。`recovering`は最低1年（severityが0.2を下回るまで）維持し、
一度の小康で即座に「平常」表示へ戻らないようにする。

### 3.3 緊急救済支出（`active`/`severe`のみ）

```ts
function spendAvailableTreasury(state, wanted): number {
  const spent = rn(Math.max(0, Math.min(wanted, state.treasury ?? 0)), 2);
  if (spent > 0) state.treasury = rn((state.treasury ?? 0) - spent, 2);
  return spent;
}
```

`debitTreasury()`と異なり全額未満でも部分支出する——国庫が足りない州は「一部しか救済できない」形で
被害緩和が目減りする。`wanted`は`active=8`/`severe=18`（calibration TBD、DAM_BUDGET=26未満）。
`coverage = spent/wanted`で`climateFoodStress`を最大35%（`DROUGHT_RELIEF_MITIGATION`）まで追加緩和する。
`state.lastDisasterRelief`に今年の支出額を記録し、TreasuryOverviewDialogで可視化する（§3.5）。

### 3.4 chronicle: `state.disasterLog`（新規リングバッファ）

`councilSessionLog`と同じ「`summary`必須のプレーン文字列、ダイアログ無しでも成立する」設計を踏襲する
（`messageKey`のようなi18n連携は、専用ダイアログを作る際のフォローアップとする）。

```ts
export interface DisasterLogEntry {
  id: number;
  kind: "drought"; // 将来flood/epidemicを離散化する際にユニオンを拡張
  stage: DisasterStage;
  year: number;
  severity: number;
  reliefSpent?: number;
  summary: string;
}
```

ステージが変化した年だけ追記（最大24件のリングバッファ）。

### 3.5 収穫高への接続: `agriculturalLandUse.ts`

`AgriculturalConditions`に`climateFoodStressByCell?: Float32Array`を追加し、`calculateClimateYield()`内で
`floodFactor`と同じ乗算パターンを適用する。

```ts
const droughtStress = conditions.climateFoodStressByCell?.[cellId] ?? 0;
const irrigationCoverage = conditions.irrigationDevelopmentByCell?.[cellId] ?? 0;
const droughtFactor = 1 - droughtStress * (1 - irrigationCoverage * DROUGHT_IRRIGATION_YIELD_MITIGATION) * DROUGHT_YIELD_DAMAGE_SEVERITY;
```

`DROUGHT_YIELD_DAMAGE_SEVERITY = 0.45`（calibration TBD、`FLOOD_YIELD_DAMAGE_SEVERITY`(0.35)よりやや大——
干魃・熱波はdisaster-mode.mdの表で洪水と同じ「非常に大」評価だが、灌漑という直接的な対策があるため、
`DROUGHT_IRRIGATION_YIELD_MITIGATION = 0.8`でセル単体の灌漑développementが強く効くようにして帳尻を合わせる）。
`state.climateFoodStress`（州平均、TreasuryOverviewDialog表示用）とは別に、セル毎の`climateFoodStressByCell`
は州の値をそのままブロードキャストしたもの——将来、州内の局所灌漑の有無で被害に濃淡がつくのは、この
`irrigationCoverage`項がセル単位で効くため。

### 3.6 可視化: `TreasuryOverviewDialog`への列追加のみ

専用の災害ログ・ダイアログは本書の範囲外とする（river-levee-and-flood-damage.md・
epidemic-cholera-and-water-security.mdが揃って「専用Overviewダイアログ」を対象外としたのと同じ判断）。
干魃は国庫支出と直結するため、既存の`TreasuryOverviewDialog`（state横断の会計デバッグ/透明性ビュー）に
`droughtStage`/`droughtSeverity`/`lastDisasterRelief`の3列を追加する——`controllers/treasury-overview.ts`・
`store/treasuryOverviewState.ts`・ダイアログの見出し/行に、既存の`warFooting`等と同型で追加する。

### 3.7 永続化

- `state`直下にフィールドを追加する（`councilSessionLog`/`supplyStrain`と同じ——Stateはpack.statesの一部として
  既に永続化されるため、`extensionStateSlices.ts`への新規登録は不要）: `climateAnomaly`、`droughtStage`、
  `droughtSeverity`、`droughtYears`、`lastDisasterRelief`、`disasterLog`。
- `economyContext.ts`: `getClimateFoodStress`/`setClimateFoodStress`（Float32Arrayセル列、`floodProtection`と
  同型）、`getClimateDisastersLastSettledYear`/`setClimateDisastersLastSettledYear`（年次自己ゲート）。
- `DevelopmentPotentialModule.clear()`に`setClimateFoodStress(new Float32Array())`を追加
  （`setFloodProtection`と同じ扱い——書き込み元のモジュールではなく、`AgriculturalConditions`を束ねる
  DevelopmentPotential側がセル列のクリアを一括で持つ既存方針に合わせる）。

## 4. 決定事項

1. **干魃と熱波は単一の`severity`指標に統合する**。両者は同じ因果（高温・少雨→作物ストレス）と同じ対策
   （灌漑・穀倉）を共有し、disaster-mode.mdの優先度表でも最初から同じ行にまとめられている。
2. **粒度は州単位**。属州・セル単位の局所差は将来のフォローアップ（既存のAgTechInvestment水利事業も
   州一律であり、同じ粒度で一貫性を保つ）。
3. **`rng.rand(min,max)`ではなく`rng.gauss()`を使う**。`rand()`は整数しか返さないため、年ごとの
   なめらかな気候ウォークには不適——`gauss(0, 28, -100, 100, 0)/100`で滑らかな±1ショックを得る。
4. **緊急救済は部分支出**。`debitTreasury()`のall-or-nothingでは「国庫が1でも足りなければ救済ゼロ」に
   なってしまい、disaster-mode.mdが意図する「国家の資本を溶かす動機づけ」という漸近的な圧力にならない。
5. **`DisasterLogEntry`は`messageKey`を持たない**。`councilSessionLog`の`summary`必須パターンを踏襲し、
   専用ダイアログが無くても機能を完結させる。i18nキー連携は専用ダイアログを作る時のフォローアップ。
6. **専用ダイアログは作らない。既存のTreasuryOverviewDialogに列を3つ追加するに留める**。
   river-levee-and-flood-damage.md・epidemic-cholera-and-water-security.md双方の先例と同じスコープ判断。
7. **干魃による人口損耗は新しい死因を作らず、既存の`famine`経路をそのまま再利用する**。
   `climateFoodStressByCell`は`foodPotential`/`yieldPerArea`を下げるだけで、`demography-simulator.ts`の
   `roomForGrowth<0`判定に自然に波及する——epidemicが新しい`disease`死因を必要としたのは、その被害経路が
   既存の飢餓判定と独立していたためで、干魃には同じ理由が無い。

## 5. テスト計画

- `climateDisasters.test.ts`: `computeStateAridity`/`rollClimateAnomaly`/`computeDroughtSeverity`の純関数、
  `advanceDisasterStage`のヒステリシス（calm→watch→active→severe→recovering→calmの一巡、2年連続activeでの
  severeへの格上げ、recoveringの最低1年維持）、`settleAnnual()`の年次自己ゲート、緊急救済の部分支出と
  `climateFoodStress`緩和、`disasterLog`がステージ変化時のみ追記されること、州間で州の平均prec/tempが
  正しく分離されること。
- `agriculturalLandUse.test.ts`: `climateFoodStressByCell`未接続時は無変更（後方互換）、`droughtStress=0`は
  ドラッグ0、`irrigationDevelopmentByCell=1`ならほぼ完全に軽減、両方最大なら`DROUGHT_YIELD_DAMAGE_SEVERITY`
  満額のドラッグ。

## 6. フォローアップ候補（本書の範囲外）

- 専用の「災害ログ」ダイアログ（`disasterLog`の`messageKey`i18n連携を含む）。
- 洪水・疫病を本書の離散サイクル（`DisasterStage`/`disasterLog`/緊急救済）に載せ替え、
  `floodProtectionByCell`・`burg.waterSecurity`の背景ドラッグに離散的な発災イベントを上乗せする。
- 州→属州粒度への細分化。
- `frontierGovernance.ts`の`FrontierDisaster`との統合・共通化。
