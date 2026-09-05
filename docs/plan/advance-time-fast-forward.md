# Advance Time Fast-Forward（近似シミュレーション注入）機能 設計

## 状態

**設計のみ。未実装。** 2026-09-05、ユーザー要望により起票。

**Phase 0（ベンチマーク拡張・キャリブレーション実測）完了、2026-09-05。** `scripts/benchmarkAdvanceYear.ts`に
人口/国庫/在庫/価格のスナップショット記録を追加し、新規`scripts/calibrateFastAdvance.ts`（`npm run
calibrate:fast-advance`）で複数シード・複数年のウォームアップを経た後の実測年間成長率を測定した。
「標準」プリセットの人口/価格/在庫成長率は実測値に更新済み。**国庫成長率は、実測値（約-42%/yr、5シードで
再現性あり——詳細は§5.3）が当初の見積もり（+1.5%/yr）と符号・桁とも大きく異なったため、ユーザー判断により
未確定のまま保留し、経済バランス側の原因調査を別途依頼した（2026-09-05）。**

**追記（2026-09-06）**: 依頼した調査は`docs/plan/treasury-structural-deficit-investigation.md`として完了し、
原因（施設維持費が新設費と同額のまま毎年再徴収され続ける設計）を特定した上で、その是正（同ドキュメント
「案A」）を実装済み。再実測の結果、国庫成長率は**平均-19.0%/yr・中央値-12.9%/yr**まで改善した（依然として
負——同ドキュメント§9.3の通り、追加の是正案「案B」に進むかどうかは未判断のまま）。**この数値も引き続き
「標準」プリセットとしては未確定のまま保留する**——案Bの要否が決まってから確定させる（§5.3.3・§10・§11）。

**Phase 1（コアエンジン実装）は着手せず、本書のレビュー待ちで一時停止中（2026-09-05、ユーザー指示）。**

`docs/plan/advance-time-loop-reduction.md` §3 Phase 3 が「本当に1コールで月/年を進めたい要望が別途強くあるなら」
の条件付きで留保していた「明示的な Fast-Forward 専用パス」を、ユーザーからの明確な要望を受けて具体化するもの。
本書はその Phase 3 を置き換える——ただし後述 §3.4 の理由により、Phase 3 が前提としていた「既存ボタンとは
別のUI導線・別コマンド型」という制約は踏襲しない設計を採る。

## 関連ドキュメント

| Doc / Code | 関係 |
| :--- | :--- |
| `docs/analytics/advance-year-benchmark-latest.json` | 本設計の調査対象データ（2026-09-05実測、4154cells/143burgs/characters+economy） |
| `docs/analytics/perf-economy.md` | 上記の人間可読サマリ |
| `docs/plan/advance-time-loop-reduction.md` | Phase 1a（manpower間引き）/ Phase 1b（多日バッチでの軍事解決スキップ、`isBulkAdvance`の初出） / Phase 3（本書の前身の留保事項） |
| `docs/simulation/advance-time.md` | Advance Time全体の仕様・RNG決定性契約（§7） |
| `src/generators/timeEngine.ts` | `advanceTimeMutation()`、`isBulkTimeAdvance()`、demographics/systems呼び出し地点 |
| `src/generators/simulationSystem.ts` | `SimulationStepContext`（`isBulkAdvance`・`rng`・`delta`） |
| `src/generators/demography-simulator.ts` | 人口動態の実計算（置換対象） |
| `src/extensions/economy/index.tsx` | 月次決済スケジューリング（`daysSinceLastProduction`・`productionSettlementsDue`）、置換対象 |
| `src/extensions/economy/generators/production-generator.ts` | `Production.produce()`本体、置換対象 |
| `src/extensions/economy/generators/balanceSnapshot.ts` | Balance History の集計スキーマ——フェイク後も維持すべき「見た目の整合性」の基準 |
| `src/extensions/economy/store/economyCalibrationState.ts` | 本設計が踏襲する「永続化されたオプトイン・トグル」の既存パターン |
| `src/ui/dialogs/AdvanceTimeDialog.tsx` | 拡張対象のUI |
| `scripts/lib/advanceYearHarness.ts` | Phase 0で新設。ベンチマーク/キャリブレーション両スクリプト共通のPlaywrightハーネス（マップ生成・拡張有効化・人口/経済スナップショット取得） |
| `scripts/calibrateFastAdvance.ts`（`npm run calibrate:fast-advance`） | Phase 0で新設。複数シード×ウォームアップ後の実測年間成長率を測定し`docs/analytics/fast-advance-calibration.json`に出力 |
| `docs/analytics/fast-advance-calibration.json` | Phase 0の実測結果データ（本書§5.3の根拠） |

---

## TL;DR

- **調査結果**: `npm run perf:advance-year`実測（Advance Year合計2405ms）の**約85%**が、Economy拡張の月次決済クラスタ
  （`production:settle`とその内部10ステップ、いずれも**年12回**しか呼ばれない）に集中している。残り約10〜15%は
  366回/年呼ばれる日次ゲート系24項目に薄く分散しており、個々のシェアは最大でも2.41%（`economy:dailyHiring`）。
- **提案**: 月次決済クラスタと`core:demographics`（人口動態）の**中身**を、実計算の代わりに「年間成長率プリセット」
  による定数式（O(burg数+market数)の単純な乗算）に差し替える、**デフォルトOFFのオプトイン・トグル**を新設する。
  ループ回数・tickCount・コミット粒度は一切変更しない——**変えるのは2つの重い処理の「中身」だけ**。
- **人口も対象にする理由**: ユーザーの要望である「経済活動と人口を縮小〜拡大させるプリセット」は、人口だけ実計算・
  経済だけ近似という組み合わせを許すと雇用/食料/都市化の比率が数十年で破綻する。両者を同じプリセットで動かす
  必要があるため対象に含める——`core:demographics`自体の実測コストは1.22%と軽く、これは性能目的ではなく
  「意図した世界史を作る」ためのスコープ拡張である。
- **既存の不変条件との関係**: 2026-07-20 commit `156910fe6`（P2-5）以降、「Advance Day×N ≡ Advance Month/Year×1」
  という結果一致とRNG決定性は保証された不変条件になっている。本設計はこれを**変更しない**。ループ・tickCount・
  RNGストリーム消費経路は今まで通りで、フェイク処理も既存の「経過日数カウンタ自己ゲート」パターン
  （Phase 1aと同じ手法）に乗せる。トグルがOFFなら今日の挙動と100%同一。

---

## 1. 調査: 現状のコスト内訳

### 1.1 ベンチマーク実測（`docs/analytics/advance-year-benchmark-latest.json`, 2026-09-05）

Advance Year 1回（366暦日、characters+economy拡張、4154 cells / 143 burgs）= wall-clock 2405.4ms。
プロファイル25項目のうち上位10項目（`topTotalShare`）を、**呼び出し回数**で二分して並べ直す:

| ラベル | totalMs | share | calls | 由来 |
| :--- | ---: | ---: | ---: | :--- |
| `production:settle` | 1689.4 | 26.82% | **12** | 月次決済コマンド全体のラッパー（[index.tsx:2699](../../src/extensions/economy/index.tsx)） |
| `production:produce` | 1166.6 | 18.52% | **12** | `Production.produce()`本体（[production-generator.ts:230](../../src/extensions/economy/generators/production-generator.ts)） |
| `production:finishCycle` | 501.3 | 7.96% | **12** | 生産サイクル終了処理 |
| `production:syncLedgers` | 428.6 | 6.80% | **12** | burg/market台帳同期 |
| `production:startCycle` | 337.2 | 5.35% | **12** | 生産サイクル開始（rural/mines/quarry含む） |
| `production:burgLoop` | 327.9 | 5.21% | **12** | burg単位の生産ループ本体 |
| `production:playerCommerce` | 260.5 | 4.14% | **12** | プレイヤー商業同期 |
| `production:planRetail` | 259.3 | 4.12% | **12** | 小売補充計画 |
| `production:rural` | 225.8 | 3.59% | **12** | 農村生産収集 |
| `production:taxes` | 166.8 | 2.65% | **12** | `Taxes.collectTaxes()` |
| `economy:dailyHiring` | 151.5 | 2.41% | 366 | 日次雇用 |
| `core:manpower` | 100.5 | 1.60% | 366 | Phase 1a済み・週次間引き後 |
| `economy:annualAgTech` | 89.0 | 1.41% | 366 | 農業/工業投資（年次自己ゲート） |
| `core:demographics` | 76.8 | 1.22% | 366 | 人口動態 |
| `production:metallurgProcurement` | 70.8 | 1.12% | **12** | 製鉄調達 |
| （以下14項目は個別シェア1%未満） | — | 合計 ≈6% | 366系12件・12系2件 | — |

**calls=12の10項目の合計 = 4363.4ms（69.3%）**。ここに`production:metallurgProcurement`
`production:pricesAndLabor`等の残り calls=12 項目（1.12%+0.94%+0.17%+0.13%+0.04%+0.19%+0%）を足すと
**約85%**が「月次決済コマンド1本」に集約される。これは全て[index.tsx:2699](../../src/extensions/economy/index.tsx)の
`runOneProductionSettlement()`が dispatch する`production.settle`コマンド（[index.tsx:1087-1121](../../src/extensions/economy/index.tsx)）
1本の中身である。

一方 calls=366 の14項目合計は約344ms（14.3%）で、最大でも`economy:dailyHiring`の2.41%。個々は軽いが束にすると
無視できない。

### 1.2 結論: 置換対象の優先順位

1. **最優先**: `production.settle`コマンド一式（月次・年12回・全体の約85%）。これを丸ごと「実計算 → 定数式」に
   置き換えれば、Advance Yearは理論上 2405ms → 350〜400ms 程度まで縮む。
2. **次点（性能目的ではなくスコープ整合性のため）**: `core:demographics`（人口動態、1.22%）。§0のTL;DR参照。
3. **対象外**: 残り約13%は20項目以上に分散し、個々のフェイク化がもたらす「他ダイアログとの不整合リスク」が
   節約時間に見合わない（§2.2で詳述）。

この整理は「ユーザーが名指しした`npm run perf:advance-year`のJSON」を根拠にした一次調査結果である。

---

## 2. 何を「実計算せず数値だけ差し込む」対象にするか

### 2.1 対象に含める

| システム | 置換する理由 | 置き換え後に触る状態 |
| :--- | :--- | :--- |
| `production.settle`一式（`Production.produce()`, `Taxes.collectTaxes()`, `synchronizePlayerCommerce()`, `planRetailReplenishment()`, `Markets.collectRuralProduction()`ほか） | コストの約85% | `Market.goods[i].{stock,price}`, `State.treasury`, `Burg.treasury` |
| `core:demographics`（`simulateDemographics()`） | 経済と同じプリセットで人口も動かす必要があるため（TL;DR参照）。性能目的ではない | `pack.cells.{children,maleAdults,femaleAdults,elders}`, `Burg.population` |

### 2.2 対象に含めない（既存対応済み、または費用対効果が低い）

| システム/カテゴリ | 現状シェア | 対象外にする理由 |
| :--- | ---: | :--- |
| `core:manpower` | 1.60% | Phase 1a（週次間引き）で既に約93%削減済み。追加のフェイク化は不要 |
| `core:militaryFallback` / Nobility拡張の紛争解決 | （本ベンチマーク未計測） | Phase 1bで「多日バッチ×player-directed」時は既に丸ごとスキップ済み。本設計の`isBulkAdvance`ゲートと同じ仕組みを再利用するだけで足りる（§4.2） |
| `economy:annualAgTech`, `annualInfrastructure`, `annualPlants`, `annualKnowledge`, `annualBurgGroups`, `annualUrbanLabor`, `warIntensity`, `forestProspect`, `marketTerritorySync`, `economyMarketTerritories`, `caravans`, `retailInventory`, `strategicProcurement`, `technologyProgress`, `nobility`, `frontierExpansion`, `wildernessEcology`, `seasonalClimate`, `shipbuilding`, `dungeonEcology` | 個別0.71%以下、合計しても約10% | Advance Year当たり最大でも約240ms相当。フェイク化した場合の「他システムとの整合性が壊れるリスク」（§2.3）の方がこの節約より高い。**Fast-Forward有効時もこれらは今まで通り実計算のまま毎日実行し続ける**——フェイクされた`treasury`/`population`/`stock`を「入力」として素直に読みに行くだけなので、動作は自然に保たれる（例: `AgTechInvestment.settleAnnual()`は`state.treasury`の出どころを区別しない） |

### 2.3 依存関係の監査（実装時に個別確認が必要な項目）

| 懸念 | 詳細 | 対応方針 |
| :--- | :--- | :--- |
| `MetallurgWork.fulfillFromMarkets()` / `.settleMonthly()` / `requestMetallurgMaterials()` | `production.settle`コマンド内で`Production.produce()`の直後に呼ばれており（[index.tsx:1104-1111](../../src/extensions/economy/index.tsx)）、`produce()`が生成する`ProductionRecord`/`getBurgProductionRecords()`を読んでいる可能性がある | 実装時にコード読解で確認。依存する場合はFast-Forward中はスキップ（合計シェア1.12%+0.17%+0.04%程度なので、スキップしても実害は小さい） |
| `refreshStateEconomySummaries()` / `synchronizePlayerCommerce()` | Overview系ダイアログが読む集計値（Treasury Overview等）を更新する | フェイク後の`treasury`/`stock`を反映するため、**これらは実計算のまま残す**（安価: 合計約4.3%、かつ「表示の整合性」に直結するため置換しない） |
| Balance History（`recordAdvanceBalanceSnapshot`） | `fmg:time-advance-completed`一回につき1行記録（[advance-time.md §3](../simulation/advance-time.md)） | イベント発火自体は変更しない。行の中身がフェイク値になるだけで、スナップショット機構自体は無傷 |
| キャラバン/小売消費（`economy:caravans`, `economy:retailInventory`） | `produce()`が止まっている間も実計算のまま毎日在庫を消費し続けると、フェイクの`stock`更新が月次1回だけなので**日々の実消費だけが先行し在庫が枯渇して見える**リスクがある | §4.5で「stock更新を月次ではなく決済クラスタと同じ経過日数カウンタで按分する」ことにより、日次消費と同じ粒度感になるよう緩和。加えて§5.1の`stockFloorMultiplier`で下限を設ける |
| Good種別ごとの偏り | 全Goodに同一倍率をかけると、意図的なシナリオ（特定資源の枯渇など）が「なかったこと」になる | v1では許容（§10 オープンクエスチョンに記録、Good種別ごとのレート分岐はv2以降） |

---

## 3. 設計方針

### 3.1 ゴール

1. Advance Yearの体感時間を1桁改善する（実測2405ms → 目標350〜500ms程度、§1.2参照）。
2. 「今後数十年、こういう世界史にしたい」という**意図的なシナリオ制御ツール**としても使える
   （`docs/plan/advance-time-loop-reduction.md` Phase 3が想定していた「マップ生成直後に背景史を一気に進める」
   ユースケースを包含する）。
3. 既存の不変条件（P2-5の結果一致・RNG決定性・tickCount）を一切変更しない。デフォルトOFF。

### 3.2 非ゴール

- 個々のGood/Burg/Marketについて、実シミュレーションと同じ相対関係を寸分違わず再現すること。
  Fast-Forwardは「近似」であり、UI上でも明示する（§6）。
- Nobility拡張の軍事/外交解決のフェイク化。Phase 1a/1bで別アプローチ（丸ごとスキップ）が既にユーザー承認済みで、
  本設計はそれを変更しない（§2.2）。
- Advance Dayの単発呼び出し（`isBulkAdvance === false`）の挙動変更。後述§4.2の通りFast-Forwardは
  多日バッチにのみ適用される。

### 3.3 既存の不変条件との関係

`SimulationStepContext.isBulkAdvance`（[simulationSystem.ts:33-54](../../src/generators/simulationSystem.ts)）
のドキュメントコメントは、実はこの用途をほぼそのまま想定して書かれている:

> Intended for systems that want to skip expensive, purely-cosmetic-at-this-timescale per-day resolution
> during a large fast-forward without changing daily-granularity behavior.

`isBulkAdvance`は「Advance Week/Month/Yearボタン、または複数日の`advanceTime`/`runDaily`呼び出しの内部にいるか」
を表すフラグで、UI rAFループ・public bulk API・headless runnerの**全経路が共通して通る**
`enterDayBatch(totalDays)`（[timeEngine.ts:640-642](../../src/generators/timeEngine.ts)）から導出される。
つまり「Advance Day入力欄に7と入れて実行」も「Advance Weekボタン」も同じ`isBulkAdvance=true`になり、
「Advance Dayを1ずつ7回クリック」は各回`isBulkAdvance=false`になる——後者は「あえて1日ずつ結果を見たい」
操作なので、Fast-Forwardが有効でも実計算のまま据え置かれるのは望ましい挙動である。

本設計は**この既存フラグをそのままゲート条件に使う**（§4.2）。ループ回数・tickCount・コミット粒度・
`daysSinceLastProduction`のような経過日数カウンタの進み方は一切変えず、**該当システムの`run()`内部で
どちらの式を使うか**だけを分岐させる。したがって「Advance Day×N ≡ Advance Month/Year×1」という
P2-5の不変条件は、**Fast-Forwardが同じ設定でONの場合もOFFの場合も、それぞれの中で独立に保たれる**
（OFFとONを跨いだ比較は元々近似との比較なので一致しなくてよい）。

### 3.4 Phase 3（`advance-time-loop-reduction.md`）との関係・なぜ「別コマンド」にしないか

Phase 3は「進捗表示・中断機能を持たない、既存ボタンとは完全に別のUI導線・別コマンド型」を条件として明記していた。
これは**当時提案されていた「日ループ自体を1コミットに畳む」案**（Phase 2寄りの発想）への懸念——tickCount・
RNG消費・hook回数が経路によって食い違う——に対する回答であり、2026-07-20のP2-5で一度閉じたはずのギャップを
再び開けないための制約だった。

本設計はPhase 3が書かれた**後**（同じ2026-08-13）に追加された`isBulkAdvance`インフラ（Phase 1b）を使う。
このインフラは「日ループの回数はそのまま、個々のtickの中身だけを条件分岐する」という、Phase 3執筆時点では
存在しなかった第三の道を提供する。日ループ・tickCount・RNGストリーム消費経路を一切変更しないため、
Phase 3が懸念した問題がそもそも発生しない。よって:

- 既存の`window.fmg.actions.advanceTime()` / Advance Day/Month/Yearボタンは**そのまま**使う。
- 「別コマンド」ではなく、**既存パターン（`simManpower`, `applyCalibration`と同じ「永続化されたオプトイン・
  トグル」）**として実装する（[economyCalibrationState.ts](../../src/extensions/economy/store/economyCalibrationState.ts)参照）。
  デフォルトOFFなので、既存の全テスト・既存の外部呼び出し元は無変更で影響を受けない。
- ユーザーが明示的にトグルをONにした場合のみ、かつ`isBulkAdvance===true`の間だけ、内部の2システムが
  近似式に切り替わる。トグルONであってもAdvance Day単発は今まで通り実計算のまま。

---

## 4. アーキテクチャ設計

### 4.1 新規モジュール構成（提案）

```
src/store/fastAdvanceState.ts           … 永続化トグル + プリセット選択 + カスタム倍率（Zustand, persist）
src/generators/fastAdvance/
  fastAdvancePresets.ts                 … FastAdvanceRates型・プリセットテーブル・解決関数
  fastAdvancePopulation.ts              … applyFastForwardPopulation(deltaYears, rates, rng)
  fastAdvanceEconomy.ts                 … applyFastForwardEconomySettlement(monthsElapsed, rates, rng)
src/ui/dialogs/FastAdvanceSettingsDialog.tsx  … プリセット選択・詳細スライダー
src/ui/dialogs/AdvanceTimeDialog.tsx          … 既存ファイルを拡張（トグル行 + 設定歯車を追加）
```

`fastAdvance/`配下は`core`層（`src/generators/`）に置く——人口（core）と経済（extension）の両方から
参照されるため、economy拡張への依存を作らないよう、経済側の関数（`applyFastForwardEconomySettlement`）は
`Market`/`State`/`Burg`の型（`src/types/models.ts`）のみに依存し、economy拡張固有の内部型
（`ProductionRecord`等）には触れない。

### 4.2 ゲーティング条件

```ts
function isFastAdvanceActive(context: { isBulkAdvance: boolean }): boolean {
  const { enabled } = useFastAdvanceState.getState();
  return enabled && context.isBulkAdvance;
}
```

- `enabled`: ユーザーがFast-Advance設定ダイアログで明示的にON。デフォルト`false`。
- `context.isBulkAdvance`: 既存フラグを再利用（§3.3）。Advance Day単発では常に`false`なので影響しない。
- 追加の日数しきい値（例:「7日未満の多日バッチは対象外」）は**v1では設けない**——`isBulkAdvance`の二値判定
  だけの方が、P2-5的な「粒度に応じて結果が変わる」余地を増やさずに済む。将来必要なら`§10`で検討。

### 4.3 フック地点

**(a) 人口** — [timeEngine.ts:824-827](../../src/generators/timeEngine.ts):

```ts
if (sim.simDemographics) {
  topics.push("simulation.cells", "simulation.states", "simulation.burgs");
  result = measureTickStep("core:demographics", () =>
    isFastAdvanceActive({ isBulkAdvance: isBulkTimeAdvance() })
      ? applyFastForwardPopulation(effectiveDeltaYears, resolveFastAdvanceRates(), appServices.rng)
      : simulateDemographics(effectiveDeltaYears)
  );
}
```

`isBulkTimeAdvance()`は`bulkAdvance`変数が計算される839行目より前で既に定義済みの関数なのでそのまま呼べる
（[timeEngine.ts:640-642](../../src/generators/timeEngine.ts)）。RNGは`appServices.rng`
（system外なので`context.rng`は使えない。人口ジッターの決定性は§4.7参照）。

**(b) 経済** — [index.tsx:3341-3383](../../src/extensions/economy/index.tsx)の`economy.foodCalendar`システム。
ここは`registerEconomyTickSystem`経由で`context: SimulationStepContext`を直接受け取れる数少ない箇所であり、
`productionSettlementsDue`をインクリメントしている当人でもある:

```ts
if (settledMonths > 0) {
  productionSettlementsDue += settledMonths;
  // 追加: このバッチがFast-Forward対象かどうかを、消費される側の scheduleProductionSettlement() に
  // 伝播できるよう記録しておく（マイクロタスクはSimulationStepContextを持たないため）。
  productionSettlementsFastForward ||= isFastAdvanceActive(context);
  foodSettlementsAlreadyApplied += foodSettlementsThisTick;
  scheduleProductionSettlement();
}
```

`scheduleProductionSettlement()`のマイクロタスク（[index.tsx:2710-2731](../../src/extensions/economy/index.tsx)）
側で、捕捉した`productionSettlementsFastForward`を見て`runOneProductionSettlement()`
（実計算、[index.tsx:2698-2708](../../src/extensions/economy/index.tsx)）の代わりに
`runOneFastForwardSettlement(settledMonths)`を呼ぶよう分岐する。**due件数のループ自体は変えない**
（`times`回のうち1回1回が安い処理に置き換わるだけ）——Balance History等が期待する
「`production.settle`相当のイベント頻度」を保つため。

### 4.4 人口の置換式

```ts
function applyFastForwardPopulation(deltaYears: number, rates: FastAdvanceRates, rng: RNGService): void {
  const { pack } = worldContext;
  const growth = Math.pow(1 + rates.populationGrowthPctPerYear / 100, deltaYears);

  for (const i of pack.cells.i) {
    if (pack.cells.pop[i] <= 0) continue;
    const jitter = 1 + (rng.rand() * 2 - 1) * (rates.variancePct / 100);
    const factor = Math.max(0, growth * jitter);
    pack.cells.children[i] *= factor;
    pack.cells.maleAdults[i] *= factor;
    pack.cells.femaleAdults[i] *= factor;
    pack.cells.elders[i] *= factor;
  }
  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed || !(burg.population > 0)) continue;
    const jitter = 1 + (rng.rand() * 2 - 1) * (rates.variancePct / 100);
    burg.population = Math.max(0, burg.population * growth * jitter);
  }
}
```

`simulateDemographics()`にある「土地の扶養力（`getCellSubsistenceCapacity`）を超えたら移住/餓死」という
制約は**意図的に外す**——近似モードの明示された制限であり、`Decline`系プリセットで負の成長率を使うことで
過密状態は回避できる想定。都市化ドリフト（rural→urban人口移動）はv1では扱わず、比率据え置きとする
（§10オープンクエスチョン）。

### 4.5 経済の置換式

```ts
function applyFastForwardEconomySettlement(monthsElapsed: number, rates: FastAdvanceRates, rng: RNGService): void {
  const yearsElapsed = monthsElapsed / 12;
  const priceFactor = Math.pow(1 + rates.priceInflationPctPerYear / 100, yearsElapsed);
  const stockFactorRaw = Math.pow(1 + rates.goodsStockGrowthPctPerYear / 100, yearsElapsed);

  for (const market of getMarkets()) {
    for (const goodId of Object.keys(market.goods)) {
      const entry = market.goods[Number(goodId)];
      const jitter = 1 + (rng.rand() * 2 - 1) * (rates.variancePct / 100);
      entry.price = Math.max(0.01, rn(entry.price * priceFactor * jitter, 2));
      const stockFactor = clamp(stockFactorRaw * jitter, rates.stockFloorMultiplier, rates.stockCapMultiplier);
      entry.stock = Math.max(0, rn(entry.stock * stockFactor, 2));
    }
  }

  const treasuryFactor = Math.pow(1 + rates.treasuryGrowthPctPerYear / 100, yearsElapsed);
  for (const state of worldContext.pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    state.treasury = Math.max(0, rn((state.treasury ?? 0) * treasuryFactor, 2));
  }
  for (const burg of worldContext.pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    burg.treasury = Math.max(0, rn((burg.treasury ?? 0) * treasuryFactor, 2));
  }

  // Overview系ダイアログの整合性のため、集計だけは実計算のまま呼ぶ（§2.3）。
  refreshStateEconomySummaries();
  synchronizePlayerCommerce();
}
```

`stockFloorMultiplier`/`stockCapMultiplier`は暴走防止の安全弁（§5.1）——何十年もフェイク成長させ続けても、
在庫が0に張り付いたり実計算時の非現実的な倍数に発散したりしないための下限/上限（フェイク開始時点の在庫を
基準にした相対倍率）。

### 4.6 周辺システムの扱い

§2.3で洗い出した通り、`MetallurgWork.*`系はFast-Forward中スキップ候補（実装時に依存確認）。
`refreshStateEconomySummaries()`/`synchronizePlayerCommerce()`は実計算のまま残す（§4.5内で明示）。
caravans/retailInventoryは実計算のまま残すが、月次決済がFast-Forwardで軽くなっても
**同じ経過日数カウンタ（`daysSinceLastProduction`）の粒度でstockが更新される**ため、実消費が先行して
枯渇する懸念は実計算時とほぼ同じ頻度に収まる（§4.3(b)で決済自体のコマンド回数は変えていないため）。

### 4.7 決定性・RNG

- 人口側は`appServices.rng`、経済側は`context.rng`（`economy.foodCalendar`システムに渡される、系統ごとに
  独立したストリーム）を使う。既存のtickフックがRNGを消費する規約
  （[advance-time.md §7](../simulation/advance-time.md)）にそのまま従うため、Fast-Forward自体が新しい
  ストリームを勝手に作ることはない。
- `simulateDemographics()`/`Production.produce()`/`Taxes.collectTaxes()`は元々RNGを消費していない
  （デモグラフィクス・生産・税は決定論的な計算式のみで、確率ロールを含まない——確認済み、grep該当なし）。
  したがって「Fast-Forward ON時のジッターが新たに使うRNG消費量」以外に、既存のRNG消費列への影響はない。
- 同一シード・同一プリセット・同一操作列であれば、Fast-Forward ON時の結果も完全に再現可能
  （ジッターは`rng.rand()`由来で、`Math.random()`は使わない）。

---

## 5. プリセット設計

### 5.1 パラメータ一覧（`FastAdvanceRates`）

| フィールド | 意味 | 既定範囲 |
| :--- | :--- | ---: |
| `populationGrowthPctPerYear` | 人口の年間純成長率 | -5.0 〜 +5.0 % |
| `priceInflationPctPerYear` | 商品価格の年間ドリフト | -2.0 〜 +6.0 % |
| `goodsStockGrowthPctPerYear` | 市場在庫（交易量の代理指標）の年間成長率 | -5.0 〜 +8.0 % |
| `treasuryGrowthPctPerYear` | 国庫・burg金庫の年間成長率 | -5.0 〜 +8.0 % |
| `variancePct` | burg/market単位のランダムなばらつき幅（相対%） | 0 〜 50 % |
| `stockFloorMultiplier` | 在庫の下限（開始時点比） | 既定 0.2（詳細設定のみ） |
| `stockCapMultiplier` | 在庫の上限（開始時点比） | 既定 5.0（詳細設定のみ） |

### 5.2 プリセット表（「標準」はPhase 0実測値、他は実測値を起点にした相対見積もり——§5.3参照）

| プリセット | 人口成長率/年 | 価格上昇率/年 | 在庫成長率/年 | 国庫成長率/年 |
| :--- | ---: | ---: | ---: | :--- |
| 崩壊 (Collapse) | -3.0% | +4.0% | -6.0% | ⚠保留（§5.3.3） |
| 衰退 (Decline) | -1.0% | +2.0% | -2.0% | ⚠保留 |
| 停滞 (Stagnant) | +0.1% | +0.3% | +3.0% | ⚠保留 |
| **標準 (Steady)** | **+0.5%**（実測+0.49%） | **0.0%**（実測-0.11%） | **+8.5%**（実測+8.53%） | ⚠**保留（是正後の再実測-19.0%（中央値-12.9%）だが未確定——§5.3.3）** |
| 成長 (Growth) | +1.5% | -0.5% | +14.0% | ⚠保留 |
| 好況 (Boom) | +3.0% | -1.0% | +20.0% | ⚠保留 |
| カスタム (Custom) | ユーザー任意 | 同左 | 同左 | ユーザー任意 |

（ばらつき列は§5.1の`variancePct`と同じ意味で、いずれのプリセットも未実測のデザイナー見積もり——本表からは
省略し§5.1に一本化。旧版で置いていた列は数値未更新のまま残すと実測欄と紛らわしいため削除した。）

**「標準」の人口/価格/在庫の3項目は2026-09-05実測値**（5シード、`characters,economy`拡張、ウォームアップ
10年→計測5年、詳細は§5.3）で、見積もり段階からの想定レンジに収まった。**国庫成長率だけは実測値
（-42.47%、5シードで再現性あり）が当初の見積もり（+1.5%）と符号ごと異なり、しかもその大きさが「Fast-Forward
のプリセット」として妥当な数値なのか判断がつかなかったため、ユーザー判断でいったん未確定（保留）とした**
（2026-09-05）——採用するかどうかは経済バランス側の原因調査の結果を待つ（§5.3.3・§10・§11）。国庫成長率は
5プリセットとも「標準」からの相対値として設計する方針だったため（§5.2旧版）、この1項目が未確定だと連鎖的に
他4プリセットの国庫成長率も未確定になる——表の当該列は全て保留マークにした。他プリセットの残り3項目
（人口/価格/在庫）は引き続き「標準」を実測アンカーとした相対見積もりのままで、**個別に実測されていない**
（Phase 0のスコープは「標準」= 現行デフォルトバランスの実測のみ、他プリセットは意図的な乖離幅をデザイナー
判断で決める設計のまま——§10オープンクエスチョン参照）。

### 5.3 キャリブレーション手法と結果（Phase 0実施、2026-09-05）

#### 5.3.1 手法

`npm run calibrate:fast-advance`（`scripts/calibrateFastAdvance.ts`、共通ハーネスは
`scripts/lib/advanceYearHarness.ts`）を新設。`characters,economy`拡張を有効化した後、

1. **ウォームアップ**: `window.fmg.actions.advanceTime(warmupYears)`で計測前に助走を走らせ、結果を破棄する。
2. **計測**: ウォームアップ直後に人口/国庫/在庫/価格のスナップショットを取得（`captureEconomySnapshot()`）、
   `advanceTime(years)`で追加のN年を進め、再度スナップショットを取得。`(after/before)^(1/years) - 1`を
   年率換算した成長率として記録する（`annualizedGrowthPct()`）。
3. 複数シードで繰り返し、平均・中央値・標準偏差を算出。

**ウォームアップが必須な理由**: 最初にウォームアップ無し（generate直後→1年）で試したところ、在庫成長率が
**+2465%/yr**という明らかな異常値になった——Economy拡張を有効化した直後は市場在庫がほぼ0の「コールドスタート」
状態で、そこから1年分の生産が積み上がるとほぼ0除算に近い比率になるため。ウォームアップ年数を3年→10年と
深くしても人口・国庫の傾向は大きく変わらなかったが、**在庫成長率はウォームアップが浅いほど過大評価される**
ことが分かった（3年ウォームアップでは平均+16.2%/yr、10年ウォームアップでは平均+8.5%/yrに収束——在庫が
飽和に向かうロジスティックな立ち上がり局面を、浅いウォームアップだと定常成長と誤認するため）。**最終的に
ウォームアップ10年→計測5年（計15年分の実シミュレーション）を採用した。**

#### 5.3.2 実測結果（5シード、`characters,economy`、ウォームアップ10年→計測5年）

| シード | cells | burgs | 人口 %/yr | 国庫 %/yr | 在庫 %/yr | 価格 %/yr |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| fast-advance-calibration-1 | 5231 | 79 | +0.43 | -40.12 | +8.24 | -0.47 |
| fast-advance-calibration-2 | 3682 | 119 | -0.21 | -44.78 | +8.58 | -1.06 |
| fast-advance-calibration-3 | 4853 | 308 | +1.00 | -46.36 | +9.28 | +1.36 |
| fast-advance-calibration-4 | 3956 | 77 | +0.70 | -43.48 | +9.79 | -0.21 |
| fast-advance-calibration-5 | 4105 | 97 | +0.56 | -37.58 | +6.73 | -0.15 |
| **平均** | — | — | **+0.49** | **-42.47** | **+8.53** | **-0.11** |
| 中央値 | — | — | +0.56 | -43.48 | +8.58 | -0.21 |
| 標準偏差 | — | — | 0.45 | 3.57 | 1.17 | 0.89 |

マップ規模（3682〜5231 cells、77〜308 burgs）がばらついても4項目とも大きく揺れておらず、特に国庫（標準偏差
3.57）と在庫（標準偏差1.17）は再現性が高い。生データは`docs/analytics/fast-advance-calibration.json`。

#### 5.3.3 想定外だった結果: 国庫が恒常的に赤字（-42%/yr）

**これは本書がPhase 0着手前に見積もっていた+1.5%/yrと符号ごと逆で、しかも一過性ではない。** ウォームアップ
年数を3年/10年/15年と変えて確認したところ、-34〜-59%/yrの範囲でいずれも大幅なマイナスのままだった
（3年ウォームアップ・3年計測: 平均-44.6%/yr、10年ウォームアップ・5年計測: 平均-42.5%/yr、15年ウォームアップ・
5年計測: 単一シードで-42.3%/yr）——ゲーム開始直後だけの「初期資金を使い切る」立ち上がり現象ではなく、
**少なくともシミュレーション20年目時点でも同程度の赤字ペースが続く、現行デフォルトバランスの構造的特性**
であると判断できる。

これは本Fast-Forward設計が生み出した問題ではなく、**既存のEconomy拡張が現在のデフォルト設定で実際にそう
振る舞っている**という測定事実である（`state.treasury`は複数箇所で`Math.max(0, ...)`によって下限0にクランプ
されるため、この年率が今後も等比的に続くわけではなく、0に漸近するモデルとして解釈すべき——ただし本書の
Phase 0では原因追及は行っていない。年次投資系システム（`AgTechInvestment`/`IndustrialTechInvestment`等の
`settleAnnual()`群、[index.tsx:2994以降](../../src/extensions/economy/index.tsx)）やGuild/軍事維持費が
税収を上回るペースで`state.treasury`を消費している可能性が高いが未検証）。

**この実測値（-42%）を「標準」プリセットの国庫成長率としてそのまま採用するかどうかは、ユーザー判断で保留とした**
（2026-09-05）。§4.5の指数式（`Math.pow(1+rate/100, years)`）は`treasury`が0に近づくほど絶対額の変化が小さく
なる減衰カーブになるため、値が0でクランプされる実際の仕様と定性的には整合する——「採用しても数式上は破綻しない」
ことは確認できているが、それとは別に「現行デフォルトバランスがそもそも意図通りなのか」が分からない状態で
Fast-Forwardのプリセットに焼き込んでよいかは設計判断の外側にある問題だと判断し、**採用の可否を決める前に
経済バランス側の原因調査を別途依頼することになった**。

**追記（2026-09-06、調査完了）**: 依頼した調査は`docs/plan/treasury-structural-deficit-investigation.md`として
新規起票・完了した。原因は「化学/医療/インフラ施設系19モジュールが、新設費と同額を毎年renewal debitとして
再徴収し続ける」という単一パターンで、既存の結合度監査（`docs/plan/economy-coupling-audit.md`）や財政配分
（`docs/plan/state-treasury-department-budget.md`）とは独立した、新規の系統的発見だった（同ドキュメント§3）。
是正案（同ドキュメント「案A」——renewal debitを実世界ベンチマークに基づく維持費率に減額、土木インフラ2%/
その他10%）を実装済み。再実測の結果、国庫成長率は平均-19.0%/yr・中央値-12.9%/yrまで改善したが、依然として
負のままであり、追加の是正案（「案B」——州単位の集約予算上限）に進むかどうかは未判断（同ドキュメント§9.3・
§10）。**その判断が出るまで、本書「標準」プリセットの国庫成長率は確定させない**（§10・§11）。

---

## 6. UI設計

### 6.1 配置方針

既存の`AdvanceTimeDialog.tsx`（[AdvanceTimeDialog.tsx](../../src/ui/dialogs/AdvanceTimeDialog.tsx)）に
トグル行を追加する。既存のYear/Month/Dayボタン3行はそのまま変更しない。

### 6.2 ワイヤーフレーム

```
┌ Advance Time ─────────────────────────────────┐
│ 712 / 3 / 14  Bronze Age                       │
│ ┌─────────────────────────────────────────┐   │
│ │ ⚡ Fast-Forward (approximate)        [ ] │   │ ← トグル（既定OFF）
│ │     Preset: [ Steady Growth        ▾]  ⚙│   │ ← ONの時のみ活性化。⚙で詳細設定ダイアログ
│ └─────────────────────────────────────────┘   │
│ [ 1 ] [        Advance Year         ]          │
│ [ 1 ] [        Advance Month        ]          │
│ [ 1 ] [        Advance Day          ]          │
└─────────────────────────────────────────────────┘
```

```
┌ Fast-Forward Settings ──────────────────────────────────┐
│ Preset                                                   │
│  ( ) Collapse   ( ) Decline   ( ) Stagnant                │
│  (•) Steady     ( ) Growth    ( ) Boom      ( ) Custom    │
│                                                            │
│ ▾ Advanced（Customを選ぶと編集可能。他プリセット選択時は  │
│    プリセット値を表示するのみで読み取り専用）             │
│   Population growth     [-5 ───●───── +5]   +0.5 %/yr    │
│   Price inflation       [-2 ────●──── +6]   +1.0 %/yr    │
│   Goods stock growth    [-5 ────●──── +8]   +1.0 %/yr    │
│   Treasury growth       [-5 ────●──── +8]   +1.5 %/yr    │
│   Per-burg variation    [ 0 ──●────── 50]    15 %        │
│                                                            │
│ ⚠ Approximate mode replaces the monthly production/tax   │
│   settlement and population growth with a flat annual    │
│   rate. Turn it off for exact per-Good simulation.        │
│   Only affects multi-day advances (Week/Month/Year) —    │
│   single Advance Day steps are always exact.              │
│                                                            │
│                                       [ Reset ] [ Close ] │
└────────────────────────────────────────────────────────────┘
```

### 6.3 コンポーネント/state設計

```ts
// src/store/fastAdvanceState.ts
interface FastAdvanceState {
  enabled: boolean;
  preset: "collapse" | "decline" | "stagnant" | "steady" | "growth" | "boom" | "custom";
  customRates: FastAdvanceRates;
  setEnabled: (v: boolean) => void;
  setPreset: (p: FastAdvanceState["preset"]) => void;
  setCustomRate: <K extends keyof FastAdvanceRates>(key: K, value: FastAdvanceRates[K]) => void;
}

export const useFastAdvanceState = create<FastAdvanceState>()(
  persist(/* ...既定値: enabled:false, preset:"steady"... */ { name: "fmg-fast-advance" })
);

export function resolveFastAdvanceRates(): FastAdvanceRates {
  const { preset, customRates } = useFastAdvanceState.getState();
  return preset === "custom" ? customRates : FAST_ADVANCE_PRESETS[preset];
}
```

既存の`SliderInput`コンポーネント（[SliderInput.tsx](../../src/ui/components/SliderInput.tsx)）と
`rangeInputStyles.ts`をそのまま流用し、`WorldConfiguratorDialog.tsx`と同様のスライダー表現に揃える。
ダイアログの開閉は既存の`useDialogState`/`dialogService`パターンに新規id
（例: `"fastAdvanceSettings"`）を1つ追加するだけで済む。

### 6.4 i18n

`dialogs.advanceTime.*`と同じ名前空間に`fastForward.*`キー群を追加（`enable`, `presetLabel`, `presets.collapse`
〜`presets.custom`, `advanced`, `populationGrowth`, `priceInflation`, `goodsStockGrowth`, `treasuryGrowth`,
`variance`, `warning`, `reset`）。

---

## 7. 影響範囲・注意点

- **Balance History**: イベント発火頻度は不変（§4.6）。記録される数値がフェイク値になるだけ。CSVエクスポート
  を見るユーザーには「近似モードで進めた区間」だと分かるよう、`BalanceSnapshot`に
  任意フィールド`approximated?: boolean`を追加することを推奨（§9のテストにも使える）。
- **Overview系ダイアログ**（Market/Goods/Treasury/Production Overview）: 均一倍率でも表示自体は破綻しない
  （個別Goodの相対比が保たれるため）。ただし「なぜ急に価格が動いたか」の内訳ドリルダウンは近似モード中意味を
  持たない——ツールチップ等で注記するかは§10で保留。
- **セーブ/ロード**: `fastAdvanceState`はUI設定であり`.fmg`アーカイブには含めない（`economyCalibrationState`
  と同じ扱い、localStorage永続化のみ）。ただし「このセーブのどの区間がFast-Forwardで進行したか」という来歴は
  現状記録されない——バグ報告の切り分けに有用なら`simulationContext`に軽量なログを残すことを§10で検討。
- **Nobility/Shipbuilding拡張**: 本ベンチマークはcharacters+economyのみで計測しており、これらの拡張のコストは
  含まれていない。Nobility拡張が有効な場合、`core:militaryFallback`の代わりにNobility自身のtickが動くが、
  Phase 1bの`shouldSuppressConflictAdvance`は`isBulkAdvance`ベースで既に独立して機能しているため、本設計との
  相互作用は無い（両者とも同じフラグを見るだけで、互いを呼び出さない）。

---

## 8. 実装フェーズ計画

| Phase | 内容 |
| :--- | :--- |
| **Phase 0** | ✅ **完了（2026-09-05）**。`scripts/benchmarkAdvanceYear.ts`にAdvance Year前後の人口/国庫/在庫/価格スナップショットを追加し、新規`scripts/calibrateFastAdvance.ts`（`npm run calibrate:fast-advance`）で5シード×ウォームアップ10年→計測5年の実測を実施。「標準」プリセットの人口/価格/在庫は確定（§5.2, §5.3）。国庫成長率は想定と符号ごと異なる恒常的赤字（-42%/yr）が判明し、**採否をユーザー判断で保留**（§5.3.3, §10, §11） |
| **（派生）経済バランス是正「案A」** | ✅ **完了（2026-09-06）**。`docs/plan/treasury-structural-deficit-investigation.md`として調査・実装。国庫赤字を平均-42.5%/yr→-19.0%/yr（中央値-12.9%/yr）まで改善。「案B」着手の要否は未判断のまま |
| **⏸ Phase 1（一時停止中、2026-09-05ユーザー指示）** | 着手せず、本書のレビュー待ち。§11参照。着手条件が整い次第: `fastAdvanceState.ts` / `fastAdvancePresets.ts` / `fastAdvancePopulation.ts` / `fastAdvanceEconomy.ts`を新設し、§4.3のフック地点2箇所を配線。UIはまず簡易（トグル+プリセットdropdownのみ、詳細スライダーなし）で動作確認 |
| **Phase 2** | `FastAdvanceSettingsDialog.tsx`の詳細スライダー・i18n・`AdvanceTimeDialog.tsx`のワイヤーフレーム実装（§6） |
| **Phase 3** | §2.3の周辺システム依存監査（`MetallurgWork.*`等）を個別に確認し、必要ならスキップ/ダミー化を追加 |
| **Phase 4（任意）** | manpower成長率・discontentドリフト・technology進行倍率など追加レバー。v1スコープ外（§10） |

## 9. 検証計画

1. **数値**: 「標準」プリセットでN年フェイクした場合の人口/国庫/価格の値と、同じN年をフル計算した場合の値との
   乖離が許容範囲（例: 20%）に収まることを確認するcharacterization test。
2. **決定性**: 同一シード・同一プリセットで2回実行し、フェイク適用後の状態が完全一致することを確認するテスト
   （§4.7）。
3. **既存回帰**: `simulationRunner.test.ts`のP2-5固定テストを含む既存テストスイート全体が無変更でグリーンの
   まま（デフォルトOFFなので当然だが明示的に確認する）。
4. **実測**: 実装後に`npm run perf:advance-year`をFast-Forward ON/OFF双方の設定で再実行し、実際の短縮率を
   本書§1.1の表と並べて記録する。

## 10. オープンクエスチョン

- 在庫/価格を全Good一律倍率で動かす設計（§2.3）でよいか、Good種別（食料/資源/製品）ごとに別レートを持たせる
  必要があるか。
- 都市化ドリフト（rural→urban人口移動）をv1で完全に据え置いてよいか、それとも簡易な比率シフトを入れるか。
- セーブデータに「Fast-Forwardで進行した区間」の来歴を残すか（§7）。
- Nobility/Shipbuilding拡張有効時の追加コスト（本ベンチマーク未計測）に対しても同様のフェイク化が必要か
  ——現状はPhase 1a/1bの既存スキップで足りると判断しているが、実測されていない。
- `isBulkAdvance`のみのゲートで十分か、それとも「最小適用日数」のような追加しきい値
  （例: Advance Weekのような短い多日バッチは対象外にする）を設けるべきか。
- **（Phase 0で新規発見→調査・一次是正完了、次のアクション参照）** 現行デフォルトバランスの国家財政の
  恒常的赤字は、`docs/plan/treasury-structural-deficit-investigation.md`で原因を特定し「案A」（施設維持費
  レートの適正化）を実装、平均-42.5%/yr→-19.0%/yr（中央値-12.9%/yr）まで改善した（2026-09-06）。**それでも
  なお全シードで負のままであり**、追加の是正案「案B」（州単位の集約予算上限）に進むかどうかは未判断
  ——この判断が出るまで「標準」プリセットの国庫成長率は確定させない（本書§5.2/§5.3.3の保留マーク、および
  直後の「次のアクション」参照）。
- Collapse〜Boomの5プリセットのうち「標準」以外は未実測の相対見積もりのまま（§5.2）——実際にプレイして
  違和感がないか、Phase 1実装後にプレイテストで検証する必要がある。

## 11. 次のアクション

1. ~~Phase 0（ベンチマーク拡張・キャリブレーション実測）に着手し、「標準」プリセットの数値を確定させる。~~
   **完了（2026-09-05）** — 結果は§5.2/§5.3、生データは`docs/analytics/fast-advance-calibration.json`。
2. ~~国庫の恒常的赤字（§5.3.3）は、Fast-Forwardのプリセットに採用するかどうかを決める前に、経済バランス側の
   原因調査を別途依頼することになった。~~ **調査完了（2026-09-05）、一次是正（案A）実装完了（2026-09-06）**
   ——新規起票した
   [`docs/plan/treasury-structural-deficit-investigation.md`](treasury-structural-deficit-investigation.md)
   で実施。結論: 総赤字の93%が、`chemMedCommon.ts#debitTreasury()`を共有する化学/医療/インフラ施設系
   モジュール群（ダム・実験工房・薬種工房・堤防・病院——うち計測時点で解禁済みの5モジュールのみ）の
   「新設費＝恒久的な年間予算（減額なし）」という単一パターンで説明できる。中核経済（税収・行政・機密研究等）
   はそれ自体年-74程度で安定しており問題ない。「維持費不足による停滞」効果（崩壊リスク・死亡率結合等）は
   ユーザー指示によりスコープ外とし、renewal debitを実世界ベンチマークに基づく維持費率（土木2%/その他10%）
   に減額する「案A」のみ実装した。再実測の結果、国庫成長率は平均-19.0%/yr・中央値-12.9%/yrまで改善した
   ものの、依然として負のまま——「案B」（州単位の集約予算上限）に進むかどうかは未判断。本書の「標準」
   プリセット国庫成長率は、この判断が出るまで引き続き⚠保留のままとする。
3. **（ユーザー決定、2026-09-05）Phase 1（コアエンジン実装）には未着手のまま、いったん停止して本書全体の
   レビュー待ちとする。** レビューでのフィードバックを本書に反映してから、上記2の調査結果と合わせて
   Phase 1着手の要否を改めて判断する。
