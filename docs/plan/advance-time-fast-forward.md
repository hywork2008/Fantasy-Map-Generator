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
負——同ドキュメント§9.3の通り、追加の是正案「案B」に進むかどうかは論点として残っていた）。

**追記2（2026-09-06、同日）**: ユーザー指示により**案Bは実装しない**ことに決定。この時点の実測値
（案Aのみ適用後）を「標準」プリセットの国庫成長率として確定させた——§5.2参照。「標準」プリセットの
4項目（人口/価格/在庫/国庫）が全て確定し、Phase 0は完全に完了した。

**Phase 1（コアエンジン実装）完了（2026-09-06、ユーザー指示）。** ユニットテスト・timeEngine統合テストに加え、
実ブラウザでのライブ確認（Playwright）を行い、**ライブ確認でのみ顕在化する重大なバグ（ジッターの複利複合による
人口暴走）を発見しその場で修正した**——詳細・教訓は§9.2。国庫成長率が他の実計算システムとの並行実行で
プリセット通りにならない既知の限界（§9.4）と、`Production.produce()`スキップへの依存監査の必要性（§9.2.2）を
Phase 3のスコープとして明記した。

**Phase 2（設定UI）完了（2026-09-06、ユーザー指示）。** §6のワイヤーフレーム通り、`FastAdvanceSettingsDialog.tsx`
（7プリセットのラジオ＋詳細スライダー5本、`custom`時のみ編集可）を新設し、`AdvanceTimeDialog`に⚙導線を追加、
i18n（en/ja）を拡張した。`tsc`/`biome`/lint/`madge`/`build`/ユニットスイート（3718件）/i18nキー一致テスト、および
新規E2E`tests/e2e/fast-advance-settings.spec.ts`すべてgreen。新しい数値ロジックは足していない（UI配線のみ）ため
Phase 1のようなライブ限定バグは無し。詳細は§9.7。

**Phase 3（周辺システム依存監査＋§9.4国庫合成問題の是正）完了（2026-09-06、ユーザー指示）。** §9.4の是正方針は
ユーザー選択により「系統的な流出を停止」を採用——Fast-Forward中に実計算のまま残る年次システム群のうち、
`state.treasury`/`burg.treasury`を直接減らす**系統的な支出**（`chemMedCommon.debitTreasury()`を共有する
約20の化学/医療/土木インフラ施設モジュール＋`StateSecretKnowledge`＋`GreatLibrary`）の**treasury書き込みだけ**を
Fast-Forward中スキップし、非treasuryの処理（技術・知識の進捗、施設の建設/稼働状態）とRNG消費は一切変更しない
機構を新設した（`fastAdvanceEconomyGuard.ts`のtick単位フラグ）。ライブA/B実測（同一シード、実5年ウォームアップ後の
1年）で、実Advance Yearの国庫比 0.565 に対しFast-Forward「標準」は **0.832**（Phase 3前は実の二重ドレインで
約0.49相当に沈んでいた）——プリセットの-13%近傍に整合。§2.3の`MetallurgWork.*`はFast-Forward中そもそも
呼ばれない（`production.settle`パスごとスキップ済み）ことを確認、§9.2.2の`Production.produce()`依存も網羅監査した
（詳細は§9.8）。

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

### 5.2 プリセット表（確定・2026-09-06——「標準」の4項目はPhase 0実測値、他は実測値を起点にした相対見積もり）

| プリセット | 人口成長率/年 | 価格上昇率/年 | 在庫成長率/年 | 国庫成長率/年 |
| :--- | ---: | ---: | ---: | ---: |
| 崩壊 (Collapse) | -3.0% | +4.0% | -6.0% | -65% |
| 衰退 (Decline) | -1.0% | +2.0% | -2.0% | -35% |
| 停滞 (Stagnant) | +0.1% | +0.3% | +3.0% | -20% |
| **標準 (Steady)** | **+0.5%**（実測+0.49%） | **0.0%**（実測-0.11%） | **+8.5%**（実測+8.53%） | **-13%**（実測、中央値-12.88% ——下記参照） |
| 成長 (Growth) | +1.5% | -0.5% | +14.0% | 0% |
| 好況 (Boom) | +3.0% | -1.0% | +20.0% | +15% |
| カスタム (Custom) | ユーザー任意 | 同左 | 同左 | ユーザー任意 |

（ばらつき列は§5.1の`variancePct`と同じ意味で、いずれのプリセットも未実測のデザイナー見積もり——本表からは
省略し§5.1に一本化。）

**「標準」の4項目は全て実測値で確定した（2026-09-06）。** 人口/価格/在庫は2026-09-05の実測
（5シード、`characters,economy`拡張、ウォームアップ10年→計測5年、詳細は§5.3.1/5.3.2）から変更なし。

**国庫成長率だけは経緯が異なる。** 最初の実測（-42.47%、5シードで再現性あり）が当初の見積もり（+1.5%）と
符号ごと異なり、しかもその大きさが「Fast-Forwardのプリセット」として妥当なのか判断がつかなかったため、
2026-09-05にいったん未確定のまま保留し、原因調査を`docs/plan/treasury-structural-deficit-investigation.md`
として別途依頼した。調査の結果、原因は化学/医療/インフラ系19モジュールが施設の新設費と同額を毎年再徴収し
続ける単一パターンだと判明し、その是正（同ドキュメント「案A」——renewal debitを実世界ベンチマークに基づく
維持費率に減額）を実装した（2026-09-06）。是正後に同じ5シード・同じ条件で再計測したところ、平均
-19.01%/yr・中央値-12.88%/yrまで改善した（依然として全シードで負）。追加の是正案「案B」（州単位の集約
予算上限）は**ユーザー判断により実装しないことに決定**（2026-09-06）——**この時点（案Aのみ適用後）の
実測値を「標準」プリセットの確定値として採用する。**

平均ではなく中央値（-12.88% → 表では-13%に丸め）を採用した理由: 案A後もシードごとの標準偏差が12.49と大きく
（案A前は3.57）、これは各シードのその時点までの技術解禁進度によって化学/医療/インフラ施設群の数が
ばらつくため。人口/価格/在庫の3項目は標準偏差が小さく（0.45/0.89/1.17）平均で代表させても問題なかったが、
国庫だけは1シードの外れ値（-39.1%）に平均が大きく引きずられるため、より外れ値に頑健な中央値を採用した。

国庫成長率は5プリセットとも「標準」からの相対値として設計する方針のため（他4プリセットは個別に実測されて
いない、デザイナー見積もり——Phase 0のスコープは「標準」＝現行デフォルトバランスの実測のみ）、-13%を
アンカーに崩壊(-65%)〜好況(+15%)の単調な勾配を割り当てた。実際にプレイして違和感がないかはPhase 1実装後の
プレイテストで検証する必要がある（§10）。

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
その他10%）を実装済み。再実測の結果、国庫成長率は平均-19.0%/yr・中央値-12.9%/yrまで改善した（依然として
負のまま）。

**追記2（2026-09-06、同日）**: 追加の是正案「案B」（州単位の集約予算上限）はユーザー判断により実装しない
ことに決定した。**Aのみ適用後のこの実測値（中央値-12.88%、表では-13%に丸め）を「標準」プリセットの
国庫成長率として確定した**（§5.2）。中央値を採用した理由（平均ではなく）も§5.2に記載。

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
| **Phase 0** | ✅ **完全に完了（2026-09-06）**。`scripts/benchmarkAdvanceYear.ts`にAdvance Year前後の人口/国庫/在庫/価格スナップショットを追加し、新規`scripts/calibrateFastAdvance.ts`（`npm run calibrate:fast-advance`）で5シード×ウォームアップ10年→計測5年の実測を実施。「標準」プリセットの4項目（人口/価格/在庫/国庫）を全て確定（§5.2, §5.3）。国庫成長率は途中で想定と符号ごと異なる恒常的赤字（-42%/yr）が判明したため、経済バランス側の原因調査・是正（下記）を挟んで確定した |
| **（派生）経済バランス是正「案A」** | ✅ **完了（2026-09-06）**。`docs/plan/treasury-structural-deficit-investigation.md`として調査・実装。国庫赤字を平均-42.5%/yr→-19.0%/yr（中央値-12.9%/yr）まで改善。**「案B」は実装しないことに決定（2026-09-06）** ——Aのみ適用後の値を「標準」プリセットとして確定した |
| **Phase 1** | ✅ **実装完了（2026-09-06）**。詳細は§9.5 |
| **Phase 2** | ✅ **実装完了（2026-09-06）**。`FastAdvanceSettingsDialog.tsx`（プリセットラジオ＋詳細スライダー）・i18n拡張・`AdvanceTimeDialog.tsx`への⚙導線（§6）。詳細は§9.7 |
| **Phase 3** | ✅ **実装完了（2026-09-06）**。§9.4の国庫合成問題を「系統的な流出を停止」方針で是正（`fastAdvanceEconomyGuard.ts`＋`chemMedCommon.debitTreasury`/`StateSecretKnowledge`/`GreatLibrary`のFF時treasuryスキップ）。§2.3/§9.2.2の依存監査も実施。詳細は§9.8 |
| **Phase 4（任意）** | ✅ **実装完了（2026-09-07）**。Phase 1-3後の残ボトルネックである日次ゲート系のうち、`core:manpower`（週次ゲート→FF時は30日ゲート）と`economy:dailyHiring`（毎tick→FF時は約30日ごとに`effectiveDays`をまとめて処理）のカデンス粗化。非FF経路は完全に不変。詳細は§9.9 |

## 9. 検証計画・Phase 1実装記録

### 9.1 実装したもの（§4.1の構成からの変更点付き）

| ファイル | 内容 | §4.1からの変更 |
| :--- | :--- | :--- |
| `src/generators/fastAdvance/fastAdvancePresets.ts` | `FastAdvanceRates`型・6プリセットのレート表（§5.2の確定値）・`getNamedPresetRates()` | なし |
| `src/store/fastAdvanceState.ts` | `useFastAdvanceState`（enabled/preset/customRates、`persist`）・`resolveFastAdvanceRates()`・`isFastAdvanceActive(isBulkAdvance)` | なし。`economyCalibrationState.ts`と同じ`persist`パターン |
| `src/generators/fastAdvance/fastAdvancePopulation.ts` | `applyFastForwardPopulation()` | なし |
| `src/extensions/economy/generators/fastAdvanceEconomy.ts` | `applyFastForwardEconomySettlement()` | **配置をcore（`src/generators/fastAdvance/`）からeconomy拡張側（`src/extensions/economy/generators/`）に変更**——`Market`型は`src/types/models.ts`ではなく economy拡張内部（`marketTypes.ts`）にしか存在せず、§4.1が想定した「core層にMarket/State/Burg型だけで書く」は不成立だったため。RNGは`context.rng`ではなく`api.appServices.rng`を使用（§9.4） |
| `src/extensions/hostCore.ts` | `isFastAdvanceActive`/`resolveFastAdvanceRates`の再エクスポート | 新規。economy拡張の`index.tsx`が`useOptionsState`等と同じ「host shim経由でcoreを参照する」慣習に従うために必要だった |
| `src/generators/timeEngine.ts` | §4.3(a)のフック配線 | ほぼ設計通り |
| `src/extensions/economy/index.tsx` | §4.3(b)のフック配線＋`production.settleFastForward`コマンド新設＋`economy.annualUrbanLabor`のガード（§9.3） | `runOneFastForwardSettlement()`は due月ごとに1回ではなく**flushごとに1回**（`monthsElapsed`にdue件数をまとめて渡す）——指数複利は結合的なので数学的に等価、かつJSマイクロタスクがいつ flush されるか（UIのrAFループは日ごと、バルクの単発`advanceTime()`呼び出しは年末に1回）に依存しない実装にできる |
| `src/ui/dialogs/AdvanceTimeDialog.tsx` | トグル+プリセット`<select>`（§6.2のワイヤーフレーム通り、詳細スライダー無し） | なし |
| `src/i18n/locales/{en,ja}.json` | `dialogs.advanceTime.fastForward*`キー | なし |

新規テスト: `fastAdvancePopulation.test.ts`（5件）、`fastAdvanceEconomy.test.ts`（6件）、`fastAdvanceState.test.ts`（4件）、
`timeEngine.systems.test.ts`に統合テスト1件追加（`isBulkAdvance`実測込みで実際にpopulationフェイクが発火することを
`stepDaySimulation()`/`runDaily()`で確認）。既存の`timeEngine.systems.test.ts`にあった「isBulkAdvanceの実測」
テストと同じ手法を流用。合計447ファイル・3717件、`tsc`・`biome`・`madge`・`lint:architecture`・`lint:world-writers`
すべてクリーン（デフォルトOFFなので既存テストは無影響）。

### 9.2 Playwright生UIでのライブ動作確認（ユニットテストでは検出できない不具合が2件見つかった）

ユニットテスト・timeEngine統合テストに加えて、**実際のUI（チェックボックス→プリセット選択→Advance Yearボタン）
を操作するPlaywrightスモークテストを追加で実行した**——`AdvanceTimeDialog`のトグル/プリセット`<select>`が実際に
DOMへ正しく反映されるか、economy拡張側の`production.settleFastForward`コマンドの配線が本物の`economy.foodCalendar`
→`scheduleProductionSettlement`→マイクロタスク→`dispatchExtensionCommand`という経路を通して実際に動くかは、
ユニットテストだけでは検証できていなかったため。**この確認で実際に2件の実装バグが見つかり、その場で修正した**
（本書の設計自体に立ち返る必要のある発見だったため詳細を記録する）。

#### 9.2.1 発見1: ジッターの複利複合による人口の暴走（Boom プリセットで大半のBurgが人口崩壊）

`characters,economy`拡張・ウォームアップ5年後、Boomプリセットで実際にAdvance Yearを1回実行したところ、
**大半のBurgの人口が数百〜数千分の1に崩壊し、ごく一部のBurgだけ数倍に膨れ上がる**という、「+3%/年成長」の
意図から全くかけ離れた結果になった（73 burg中、上位のburgは2.3→26.9のように3倍超に成長する一方、大多数は
2.6→0.0009のように99.96%消失）。

**原因**: `applyFastForwardPopulation()`は`core:demographics`の代わりとして**毎日**呼ばれる
（timeEngine.tsの日次ループは変更していないため、§3.3の通り）。1回の呼び出しごとに`rng.rand()`で
独立なジッターを引いていたため、Advance Year 1回で**約365回の独立な乗算的ジッターが複利で積み重なる**ことに
なっていた。ジッター自体は平均1.0（対称区間`[1-a, 1+a]`の一様分布）だが、独立な乗算的ノイズを多数複利で
重ねると（Jensenの不等式により）**幾何平均は1.0を下回る**——大多数の経路は指数的に0へ収束し、ごく少数の
「運よく高い値を引き続けた」経路だけが指数的に発散する、という古典的な「対称ノイズの複利複合は対称でない」
現象そのものだった。経済側の`applyFastForwardEconomySettlement()`も同型のジッターを月次決済のflushごとに
引いていたため、規模は小さいものの同じ問題を抱えていた。

**修正**: ジッター振幅を「この呼び出しが年のうち何分の1を占めるか」の平方根でスケールする
（`variancePct/100 * Math.sqrt(deltaYears)`、経済側は`Math.sqrt(yearsElapsed)`）。独立な正規分布に似た
乗算的ノイズを複利で重ねる場合、分散は加算的に積み上がる（`Var[sum] = N * Var[each]`）ため、**各回の分散を
1/Nにスケールしておけば、何回に分けて複利計算しても最終的な分散が「年1回だけジッターを引いた場合」と
一致する**——`fastAdvancePopulation.ts`/`fastAdvanceEconomy.ts`の該当コード＋コメント参照。この修正により、
同じBoomプリセットでのAdvance Year後、Burg人口は+5%〜+50%程度の妥当な範囲に収まることをライブ確認済み。

**教訓**: `docs/plan/advance-time-fast-forward.md` §4.4/§4.7で「ジッターは`rng.rand()`由来」とだけ書き、
「ジッターが何回に分けて適用されるか」（＝この関数が実際にはtimeEngine.tsの日次ループから**毎日**呼ばれる
という§4.3(a)の配線の帰結）を設計時に見落としていた。ユニットテスト（`fastAdvancePopulation.test.ts`）は
関数を1回だけ呼び出して検証していたため、この複利複合はユニットテストでは再現されず、**実際のUI経由での
ライブ実行でしか顕在化しなかった**。

#### 9.2.2 発見2（副次的、修正済みだが根本原因ではなかった）: `economy.annualUrbanLabor`の雇用需要依存

発見1の原因調査の過程で、`UrbanLaborIntake.updateAnnualState()`（`economy:annualUrbanLabor`、Fast-Forward下でも
実計算のまま毎年実行される——§2.2の「対象外」システムの一つ）が、`Production.produce()`が本来毎月更新する
craft/employment記録を参照してBurg間の人口移動を決めていることに気づいた。`Production.produce()`が
Fast-Forward中は呼ばれないため、この雇用需要シグナルが古いまま固定され、理論上は不安定な再配分を引き起こし
うる。**発見1の修正だけで実際の暴走は解消したため、これ単体が主因だったわけではなさそうだが**、念のため
Fast-Forward中はこの関数呼び出し自体をスキップするガードを追加済み（`isFastAdvanceActive(context.isBulkAdvance)`
で分岐、§4.6の「MetallurgWork等のスキップ候補」と同じ扱い）。`reconcileAnnualBasicEmploymentWorkers()`等の
後続処理は`urbanMobility`がnullなら自動的にスキップされるため追加の分岐は不要だった。

**この発見が示す一般的なリスク**: `Production.produce()`を丸ごとスキップすることで、それに依存する**他の
「実計算のまま残す」システム**（§2.2のリスト）が古いデータを参照し続ける可能性がある。§2.3で名指ししていた
`MetallurgWork.*`はこのリスクの一例に過ぎず、`economy:annualUrbanLabor`はドキュメント作成時点で予見して
いなかった2例目だった。**§2.2のリストにある残り約18システムについて、同様の依存が無いかの網羅的な監査は
未実施のまま**——Phase 3のスコープとして明記する（§10）。

### 9.3 実測結果（ライブ、修正後）

Playwright経由でUIを操作し、`characters,economy`拡張・ウォームアップ5年後にBoomプリセットでAdvance Yearを
実行:

| 指標 | 実測比率（実測後/実測前） | Boomプリセットの理論値 |
| :--- | ---: | ---: |
| 人口合計 | 1.008 | 1.030（±jitter） |
| 在庫合計 | 1.462 | 1.200（±jitter、複数Good/Marketの集計なので単一値との乖離は想定内） |
| 価格（在庫加重平均） | 0.938 | 0.990（同上） |
| 国庫合計 | 0.993 | 1.150 |

人口・在庫・価格は妥当な範囲（ジッターの影響を考慮すれば理論値と整合）。**国庫だけ理論値（+15%）と大きく
乖離した（ほぼ横ばい）**——原因は§9.4で説明する、Fast-Forward設計に内在する既知の限界であり、新たな実装
バグではない。

壁時計時間: UIのrAFループ経由でAdvance Year（Boomプリセット、Fast-Forward有効）= 約740〜850ms
（`page.waitForTimeout(100)`込み）。§1.1の元の実測（2405ms、ただしバルク単発`advanceTime()`経由で
レンダリング/rAFオーバーヘッドを含まない計測）とは経路が異なるため単純比較はできないが、明確な高速化は
確認できた。バルク経路での対称な比較実測はまだ行っていない（§10）。

### 9.4 国庫が「理論値どおりに動かない」既知の限界（実装バグではない、設計上の限界）

`applyFastForwardEconomySettlement()`は`Production.produce()`/`Taxes.collectTaxes()`の代わりに
`treasuryGrowthPctPerYear`を掛けるだけだが、**§2.2の「対象外」システム（`AgTechInvestment`・
`civilAdministration`・`stateSecretKnowledge`・`dams`/`levees`等の年次renewal debit・`fiscalEvents`等、
`docs/plan/treasury-structural-deficit-investigation.md`が調査した対象と同じ集合）は全てFast-Forward下でも
実計算のまま毎年実行され続け、これらも直接`state.treasury`/`burg.treasury`を書き換える。** つまり
Fast-Forwardの`treasuryGrowthPctPerYear`は「国庫の全体像」ではなく「本来`Taxes.collectTaxes()`が担っていた
はずの税収側」だけを代替しているが、実際にはそれ以外の実支出システムがそのまま並行して効き続けるため、
**プリセットの`treasuryGrowthPctPerYear`をそのまま「最終的な年間国庫成長率」として字面通り信用してはならない**
——観測される実際の年間成長率は「プリセットの値」と「§2.2の残りシステムが生む実際の年間純増減（`docs/plan/
treasury-structural-deficit-investigation.md`が測定した中核経済分、案A適用後で中央値-13%前後）」の**合成**に
なる。ライブ実測（§9.3、Boom=+15%狙いが+0%弱に相殺）はこの合成効果と整合する。

是正には「§2.2の残りシステムのうち、どれが`state.treasury`/`burg.treasury`を直接書き換えているかを棚卸しし、
Fast-Forward中はそれらもスキップ/近似するか、逆に`treasuryGrowthPctPerYear`側を『それらの実効果を差し引いた
上振れ/下振れ分』として再定義し直す」必要があり、これは§2.3が最初から予期していた「周辺システム依存監査」
そのもの——Phase 3のスコープとして持ち越す（§10）。人口/在庫/価格の3指標はこの種の「他の実計算システムが
同じ状態を並行して書き換える」問題を持たない（`applyFastForwardPopulation`/`applyFastForwardEconomySettlement`
が書き込む状態を他のどの実計算システムも通常時に書き換えないため）ので、国庫だけに特有の限界である。

### 9.5 まとめ

Phase 1は実装完了。設計通りに動くことをユニットテスト・timeEngine統合テスト・実ブラウザでのライブ確認の
3段階で検証し、ライブ確認でのみ顕在化する重大なバグ（ジッター複利複合による人口暴走）を発見・修正した。
国庫の「他の実計算システムとの合成」問題は実装バグではなく§2.2/§2.3が元々予期していた設計上の既知の限界
として記録し、Phase 3の監査スコープに明示的に追加した（§10）。

### 9.6 残タスク（次の検証計画）

1. ~~**バルク経路での実測比較**: `npm run perf:advance-year`をFast-Forward ON/OFF双方で再実行し、UIのrAFループ
   ではなく単発`advanceTime()`経由での短縮率を§1.1の表と並べて記録する。~~ **完了（2026-09-06、§9.9）。**
   `benchmarkAdvanceYear.ts`に`--warmupYears`/`--fastForward`を追加し実測。バルク経路 **8378→1869ms（4.48×、
   −78%）** / **7313→1666ms（4.39×）**、UI経路 10108→3063ms（3.30×）。「トータルではほぼ改善していない」という
   体感との乖離の分析も§9.9に記載（結論: 大幅改善は実在。体感差はUI経路のrAF/描画オーバーヘッドと、改善後に
   相対的に目立つ日次ゲート系24項目——`simManpower`等、§1.2で元々スコープ外——のため）。
2. **決定性テスト**: 同一シード・同一プリセットでの2回実行比較は`fastAdvancePopulation.test.ts`/
   `fastAdvanceEconomy.test.ts`内のユニットレベルでは確認済み。実ブラウザでのend-to-end決定性確認は未実施。
3. ~~**§9.4の国庫合成問題の是正**（Phase 3）。~~ **完了（2026-09-06、§9.8.1）。**
4. ~~**§9.2.2で見つかった「produce()依存」リスクの網羅監査**（Phase 3、§2.2の残り約18システム）。~~
   **完了（2026-09-06、§9.8.3）。** 追加ガードが必要な新規事例は無し（`urbanWaterSystem`等は許容範囲の凍結ドリフト）。

### 9.7 Phase 2実装記録（2026-09-06）

§6のUIを実装した。Phase 1で`AdvanceTimeDialog`に暫定的に置いた「トグル＋プリセット`<select>`（詳細スライダー
無し）」を、§6.2の2枚のワイヤーフレーム通りに拡張した。

| ファイル | 内容 | §6設計からの変更 |
| :--- | :--- | :--- |
| `src/ui/dialogs/FastAdvanceSettingsDialog.tsx` | 新規。7プリセットのラジオグループ＋`<details open>`の「Advanced」セクションに5本のスライダー（人口成長/価格上昇/在庫成長/国庫成長/ばらつき）。`custom`選択時のみ編集可、名前付きプリセット選択時は`disabled`でそのプリセットのレートベクトルを表示。フッターは`[Reset][Close]`。ダイアログid`"fastAdvanceSettings"`を`useDialogState`/`openDialog`で開閉（§6.3の想定通り、`EDITOR_REGISTRY`不要） | スライダーの可動域を§5.1の「編集用の狭い帯」ではなく**全名前付きプリセット値を表示できる幅**に広げた（国庫は§5.3.3のキャリブレーション後-65〜+15にわたるため-80〜+20、在庫-10〜+25）。§5.1の`stockFloorMultiplier`/`stockCapMultiplier`は§6.2ワイヤーフレームに無いためv1のUIには出さず、プリセット既定値（0.2/5.0）のまま |
| `src/ui/components/SliderInput.tsx` | 共有コンポーネントに`disabled?: boolean`を追加（range/number両方の`<input>`へ伝播）。オプショナルで既定`undefined`のため既存の全呼び出し元は無影響 | §6.3は「`SliderInput`をそのまま流用」としていたが、読み取り専用表示のために最小限の非破壊拡張が必要だった |
| `src/store/fastAdvanceState.ts` | `resetCustomRates()`を追加（`customRates`を`steady`既定へ巻き戻す。`preset`は触らない）——⚙ダイアログのResetボタン用 | §6.3のインターフェース列挙になかったが、Reset挙動の置き場所としてstoreが自然 |
| `src/generators/fastAdvance/fastAdvancePresets.ts` | `FAST_ADVANCE_PRESET_SELECT_IDS`（名前付き6種＋`custom`）を追加。両ダイアログのプリセット列挙が共有 | なし |
| `src/ui/dialogs/AdvanceTimeDialog.tsx` | プリセット`<select>`の隣に⚙ボタンを追加（`openDialog("fastAdvanceSettings")`）。`<select>`は`custom`も選択肢に含めるようになり、Phase 1の`custom→steady`読み替えを撤去。⚙と`<select>`はFast-Forward無効時は`disabled` | なし |
| `src/ui/dialogs/DialogsContainer.tsx` | `<FastAdvanceSettingsDialog />`を登録 | なし |
| `src/i18n/locales/{en,ja}.json` | `dialogs.advanceTime.fastForwardPresets.custom`＋`fastForwardSettings`/`fastForwardSettingsTip`/`fastForwardAdvanced`/`fastForwardCustomHint`/5スライダーのラベル＋Tip/`fastForwardPctPerYear`/`fastForwardPct`/`fastForwardWarning`/`fastForwardReset` | §6.4は`fastForward.*`のネスト名前空間を提案していたが、Phase 1が既に`fastForwardEnable`等のフラット命名で実装済みだったためそれに揃えた |

**検証**: `tsc`・`biome`・`lint:legacy`（legacy-ui/world-writers/architecture）・`madge`・`npm run build`すべてクリーン。
ユニットスイート447ファイル・3718件green（`fastAdvanceState.test.ts`に`resetCustomRates`のテスト1件追加、6 skipは既存）。
i18nのen/jaキー一致テスト（`src/i18n/index.test.ts`）もgreen。新規E2Eスペック`tests/e2e/fast-advance-settings.spec.ts`
を追加し、実ブラウザで「⚙ボタンの有効/無効」「ダイアログ開閉」「7プリセットのラジオ表示」「名前付きプリセット時は
スライダー`disabled`かつそのプリセット値（Boom=人口+3）を表示」「`custom`選択でスライダー編集可＋`localStorage`
（`fmg-fast-advance`）へ永続化」「Resetで`customRates`が`steady`既定へ巻き戻り`preset`は`custom`のまま」を確認——
全てpass。Phase 1の§9.2のようなライブ限定バグは今回は無し（Phase 2は新しい数値ロジックを一切足しておらず、
UI配線のみのため）。

**未対応（意図的にv1スコープ外）**: `stockFloorMultiplier`/`stockCapMultiplier`の詳細スライダー（§5.1で
「詳細設定のみ」とされていたが§6.2ワイヤーフレームに無い）。必要になれば別途追加。

### 9.8 Phase 3実装記録（2026-09-06）

#### 9.8.1 §9.4の是正 — 「系統的な流出を停止」

ユーザー選択（`AskUserQuestion`、2026-09-06）で3案（絶対軌道で上書き / 系統的な流出を停止 / プリセットの意味を
再校正）のうち **「系統的な流出を停止」** を採用した。実装:

| ファイル | 内容 |
| :--- | :--- |
| `src/extensions/economy/generators/fastAdvanceEconomyGuard.ts` | 新規。`setFastForwardTickActive(bool)` / `isFastForwardTickActive()` のtick単位モジュールフラグ。economy tickの実行中かつそのtickがFast-Forward対象バッチの一部である間だけ`true`。 |
| `src/extensions/economy/index.tsx`（`registerEconomyTickSystem`のラッパ） | 各economy tickの`run()`呼び出しを`setFastForwardTickActive(isFastAdvanceActive(context.isBulkAdvance))` → `try { run } finally { setFastForwardTickActive(false) }`で囲む。`context`（＝`isBulkAdvance`）を持つ唯一の共通地点。 |
| `src/extensions/economy/generators/chemMedCommon.ts`（`debitTreasury()`） | Fast-Forward tick中は`state.treasury`に触れず`true`を返す（＝「支払い済み」扱い）。この共有ヘルパーを使う約20モジュール（`dams`・`levees`・`acidPlants`・`hospitalInstallations`・`experimentalWorkshops`・`apothecaryWorkshops`ほか——treasury-deficit調査「案A」適用後で残存ドレインの約68%）を一括で処理する。返り値`true`により施設は建設/稼働を継続（非treasuryの処理はそのまま走る）。 |
| `src/extensions/economy/generators/stateSecretKnowledge.ts:70` | `spend`/`coverage`/在庫EWMAの計算はプリセット駆動のtreasuryを読んだまま（＝pyrotechnics知識は進み続ける）、`state.treasury -= spend`の一行だけをFF時スキップ。§2診断で非chemMed最大の系統ドレイン（-89/yr相当）。 |
| `src/extensions/economy/generators/greatLibrary.ts:378,457` | 同上パターン。建設進捗（`settleBuilding`）と維持基金（`settleCompleted`）の`coverage`計算は不変、`state.treasury -= spend`の2行だけをFF時スキップ。 |

**新規テスト**: `fastAdvanceEconomyGuard.test.ts`（4件：フラグの往復、`debitTreasury`の通常時/FF時挙動、FF時でも
不正stateや非正amountは拒否）。`stateSecretKnowledge.test.ts`・`greatLibrary.test.ts`に各1件（FF時は在庫/進捗は
伸びるがtreasuryは減らないことをアサート）。

**RNG決定性**: どのガードも`isFastForwardTickActive()`のみで分岐（プリセット非依存）し、**RNG消費行は一切
削っていない**（`state.treasury = …`の代入だけをスキップ）。したがってFF-ONの決定性（同一シード+プリセット）は
保たれ、RNGストリームは「FFパスからtreasury代入だけ抜いたもの」とバイト一致する。

**ライブA/B実測**（`tests/e2e/fast-advance-phase3.spec.ts`、seed=`fast-advance-phase3`、実5年ウォームアップ後の
1 Advance Year）:

| | 国庫比（後/前） | 年率換算 |
| :--- | ---: | ---: |
| 実Advance Year（FF-OFF） | 0.565 | 約-43.5%/yr（このシードは§5.3.2レンジの急な側） |
| Fast-Forward「標準」（FF-ON、Phase 3後） | **0.832** | 約-16.8%/yr（プリセット-13%＋シード固有傾向＋ジッター） |
| （参考）Phase 3前のFF-ON推定 | ≈0.49 | 実ドレインがプリセットに複利で乗る二重計上 |

#### 9.8.2 §2.3（`MetallurgWork.*`）の監査結果 — 対応不要

`MetallurgWork.fulfillFromMarkets()` / `.settleMonthly()` / `requestMetallurgMaterials()` / `.refreshMaterialForecasts()`
は全て`production.settle`コマンド（[index.tsx](../../src/extensions/economy/index.tsx)）の中だけで呼ばれており、
Fast-Forward時は`production.settleFastForward`が代わりに走って`production.settle`自体を一切実行しない
（§4.3(b)）。したがって**Fast-Forward中`MetallurgWork.*`はそもそも動かず、スタブ化/スキップの追加は不要**。

#### 9.8.3 §9.2.2（`Production.produce()`依存）の網羅監査結果

Fast-Forward中も実計算のまま走る系統（§2.2）について、`Production.produce()`が毎月更新する出力
（`getBurgProductionRecords()` / `ProductionRecord` / craft・employment記録 / `burg.product`）への依存を洗い出した。

| 依存箇所 | 状況 | 対応 |
| :--- | :--- | :--- |
| `economy:annualUrbanLabor`（`UrbanLaborIntake.updateAnnualState`） | burg間の人口再配分を古いcraft/employment記録で駆動 → Phase 1のライブ確認で人口暴走の副次要因 | **Phase 1でガード済み**（`isFastAdvanceActive`で`updateAnnualState`ごとスキップ、`reconcileAnnualBasicEmploymentWorkers`/`ConstructionOperations.constrainEffectiveCapacity`も`urbanMobility`がnullで自動スキップ） |
| `urbanWaterSystem.ts`（`workshopIntensity`、`UrbanWater.settleAnnual`経由） | `getBurgProductionRecords(burg)`で工房稼働度を見積もり`burg.sanitation` civic scoreへ | **許容**。記録が凍結されても`burg.sanitation`が横ばいになるだけで複利的な暴走要因は無い。空配列時は`burg.product`フォールバックがあり破綻しない。近似モードの明示された制限（§3.2）の範囲内 |
| `economyTotals.ts` / `economyApi.getProductionTable()` | Overview系ダイアログ・Balance Snapshotが読む集計 | **許容**。Fast-Forward区間の生産内訳が凍結値で表示されるが、これは「近似モード」としてUI警告済み（§6.2 warning）。treasury/stock/populationの集計はフェイク値が正しく反映される |
| `civilAdministration` / `revenueMix` / `fiscalEvents` / `legitimacyWar` | いずれも`Taxes.collectTaxes()`の内部でのみ呼ばれる | **Fast-Forward中は不活性**（`production.settle`パスごとスキップ）。追加対応不要 |
| `minting`（seigniorage収入）/ `smelterOperations`（upkeep）/ production-generator内のwage・market debit | `Production.produce()`の内部 | **Fast-Forward中は不活性**。追加対応不要 |
| `reconcileAnnualBasicEmploymentWorkers()` | craft/employment記録を消費 | `annualUrbanLabor`で`urbanMobility`がnullの時（＝FF時）呼ばれない。追加対応不要 |

**意図的に実計算のまま残したtreasury書き込み**（系統的ドレインではない、あるいは净额ゼロの内部振替）:
`foreignDebt` / `bondMarket` / `publicDebtActions` / `creditPool` / `foreignDebtDiplomacy` / `tradeSanctions`（既存
債務の利払い・償還——過去の借入という現実の債務であり止めるべきでない）、`playerCommerce`（プレイヤー操作の
売上税）、`escortHire`（護衛契約のエスクロー）、`guildTreasury` / `treasuryAllocation` / `domainFiscalPolicy` /
`urbanWaterSystem`（burg↔state/部局間の内部再配分——净额ほぼゼロ、§2診断でも非表示レベル）、
`strategicProcurement`（財の購入と在庫移動が連動した取引で純粋なドレインではない）、`agTechInvestment`（§2診断
-1.6/3yr＝ノイズ、主支出は`marketTreasury.balance`で`state.treasury`ではない）、`climateDisasters`の救援支出
（§2診断-8/3yr＝ノイズ、旱魃severityのロールは維持すべき）、`wildernessEcology`（core側、州のモンスター狩り
補助——§2.2で「実計算のまま」と明記、-27/yr程度）。

#### 9.8.4 残る既知の限界

- `chemMedCommon.debitTreasury`のFF no-opは**新設debitも**スキップするため、Fast-Forward中は施設が実質無料で
  建設される。長期Fast-Forwardで施設数が「本来より多い」状態になりうるが、treasury/stockはプリセットが支配する
  ため経済指標には波及しない。復帰後の実計算で維持費（案A後のレート）が課され始める。
- 非chemMedの小規模ドレイン（`wildernessEcology` -27/yr、`portDevelopment` -10/yr等）は止めていない。§2診断で
  「6.9% / ほぼ均衡」に含まれる水準で、プリセット-13%に対する誤差としては小さい。

### 9.9 バルク経路での短縮率実測（2026-09-06、§9.6 item 1）

`scripts/benchmarkAdvanceYear.ts`に`--warmupYears=N`（計測前に実Advance Yearを走らせて経済に質量を持たせる）と
`--fastForward=<preset>`（ウォームアップ後にAdvance Timeダイアログ経由でFast-Forwardを有効化）を追加し
（`scripts/lib/advanceYearHarness.ts#enableFastForwardViaUI`）、同一シード・同一ウォームアップでON/OFFを実測した。

| シード | 経路 | FF OFF | FF ON「標準」 | 短縮率 |
| :--- | :--- | ---: | ---: | ---: |
| `ff-perf-1`（5242 cells / 608 burgs、8年ウォームアップ） | バルク（`advanceTime(1)`） | 8378 ms | **1869 ms** | **4.48× / −78%** |
| `ff-perf-1` | UI（rAF日ループ、`--path=ui`） | 10108 ms | **3063 ms** | **3.30× / −70%** |
| `ff-perf-2`（4407 cells / 594 burgs、6年ウォームアップ） | バルク | 7313 ms | **1666 ms** | **4.39× / −77%** |

生データ: `docs/analytics/advance-year-benchmark-latest.json`（FF OFF）/ `advance-year-benchmark-ff-steady.json`
（FF ON）。

**（2026-09-07追記）** `benchmarkAdvanceYear.ts`への`--warmupYears`/`--fastForward`追加および
`enableFastForwardViaUI`ヘルパーはユーザー判断でリバートされた（本節の実測値そのものは有効）。以後の
FF ON/OFF実測は使い捨てのPlaywrightスペックで行う（Phase 4の§9.10も同方式）。

**プロファイルの変化（`ff-perf-1`バルク、totalMs）**:

| ラベル | FF OFF | FF ON | 備考 |
| :--- | ---: | ---: | :--- |
| `production:settle`一式（`produce`+`finishCycle`+…） | 約5762（×12） | **約62（×1）** | 月次決済クラスタが消滅——設計通り（§1.2の最優先ターゲット） |
| `production:produce` | 4667 | 1.9 | |
| `core:demographics` | 500（×365） | **103（×365）** | `applyFastForwardPopulation()`は`simulateDemographics()`より**軽い**——日次処理はむしろ速くなっている |
| `core:manpower`（`simManpower`） | 424（×365） | 424（×365） | 不変。FF対象外（§2.2）。**FF後は単独最大項（残1869msの23%）** |
| `economy:dailyHiring` | 327（×365） | 320（×365） | 不変。FF対象外。FF後2位（17%） |
| `economy:foodCalendar` | 194 | 200 | 不変 |
| `economy:annualAgTech` | 189 | 188 | 不変（年次自己ゲート、treasuryドレインは§9.8.1でガード済みだが処理自体は走る） |

**「トータルではほぼ改善していない」という体感との乖離について**: 実測では**バルク−78%・UI−70%の大幅改善が
実在する**。体感差の要因は2つと考えられる:

1. **日次処理は「重くなって」いない**——`core:demographics`はむしろ500→103msに軽くなっている。ただし月次
   クラスタ（5762ms）が消えた結果、**残った日次ゲート系24項目（`simManpower` 424ms・`dailyHiring` 320ms・
   `foodCalendar` 200ms・`annualAgTech` 188ms・`caravans` 153ms…）が相対的に前面化**し、「日次が重い／月次と
   同等」という印象になる。これらは§1.2で明示的にFFスコープ外とした項目で、絶対時間は不変。
2. **UI（rAFループ）経路は圧縮率が低い**（3.3× vs バルク4.5×）。365日を最低365フレーム回す構造上、
   1フレーム16msとしても約6秒の下限があり、そこにレイヤー再描画等が乗る。600 burg級の大きなマップでは
   FF後でもUI経路3秒は残り、「まだ待たされる」感覚になりやすい。

**次の一手（任意、Phase 4相当）**: FF後の新ボトルネックは`simManpower`（週次間引き後もなお424ms）と
`economy:dailyHiring`。§8のPhase 4「追加レバー」でこれらもFF時に間引く／プリセット化すれば、バルク経路は
さらに1869→約900ms程度まで縮む見込み。→ **§9.10で実装（2026-09-07）。**

### 9.10 Phase 4実装記録（2026-09-07）

§9.9で「FF後の新ボトルネック」と特定した日次ゲート系のうち、上位2項目のカデンスをFF時のみ粗くした。
**追加レバー（`manpower成長率`等の"プリセット値"化）ではなく、既存処理の呼び出し頻度を落とすだけ**にとどめ、
FF後も各システムの挙動（軍役の徴募・除隊、雇用ボードのラグ処理）は近似的に維持する。

| ファイル | 変更 | 非FF経路への影響 |
| :--- | :--- | :--- |
| `src/generators/timeEngine.ts`（`manpower.tick`） | ゲート日数を`isFastAdvanceActive(context.isBulkAdvance)`時のみ7日→**30日**（`MANPOWER_FAST_ADVANCE_GATE_DAYS`）。`tickManpower`は「gapの一定割合/年 × deltaYears」の線形式なので、月次スライス（年徴募率39.7%）は週次スライス（39.3%）と±0.4pt——近似モードでは無視できる。O(states × (cells + burgs))の本体呼び出しが約1/4に | 完全に不変（`gateDays`は非FF時`MANPOWER_GATE_DAYS`=7のまま、`dueDeltaYears`計算も不変） |
| `src/extensions/economy/index.tsx`（`economy.dailyHiring`） | FF時のみ`hiringDaysAccumulated`に日数を溜め、**約30日ごとに1回**だけ本体を実行（溜めた`effectiveDays`をまとめて渡す）。ボード期限・採用ラグ等は全て`effectiveDays`スケールで、これは既存の「Advance Month」経路が毎回通しているコードパスそのもの | 完全に不変（`ffActive`偽の分岐で`effectiveDays`/`effectiveDeltaYears`は従来式のまま毎tick実行） |

**新規テスト**: `timeEngine.systems.test.ts`に1件——FF有効＋多日バッチ（`runDaily`）で`manpower.tick`のゲートが
30日になる（29日目まで`regiment.t`不変、30日目で増加）ことを既存の「7日ゲート」テストと対で確認。

**RNG決定性**: `manpower.tick`は確率ロールを一切含まない（線形式のみ）。`economy.dailyHiring`は
`tickCullHiring`/`tickEscortHiring`が`context.rng`を消費するが、FF-ON時に一貫して月次化されるだけなので
FF-ON同士の決定性（同一シード＋プリセット）は保たれる（§4.7、FF-ON≠FF-OFFは元々許容）。非FF経路はRNG消費列も含めて完全に不変。

**ライブ実測**（使い捨てPlaywrightスペック、seed=`ff-perf-phase4`、実6年ウォームアップ、`tickProfiler`有効、
バルク`advanceTime(1)`）:

| 指標 | FF OFF | FF ON「標準」（Phase 4後） |
| :--- | ---: | ---: |
| wall | 2511 ms | **824 ms**（3.05× / −67%） |
| `production:settle`一式 | 1411 ms | 6 ms |
| `core:manpower` | 211 ms | **55 ms**（−74%） |
| `economy:dailyHiring` | 172 ms | **100 ms**（−42%） |

このマップ（`ff-perf-1`/`ff-perf-2`より小規模）でPhase 4の寄与は約-228 ms（Phase 4なしなら FF ON ≈ 1050 ms
だったところ 824 ms）。大きいマップ（`core:manpower` 424 ms・`dailyHiring` 320 ms）では絶対削減幅も比例して
大きくなる（推定 -440 ms 前後、§9.9の「1869→約900 ms」見込みに整合）。

**残るFF後ボトルネック**（Phase 4スコープ外・許容）: `economy:foodCalendar`（毎日`daysSinceLastProduction`を
進めて月次決済境界を検出する構造上、呼び出し自体を粗くできない——約200 ms はほぼ純粋なループオーバーヘッド）、
`economy:annualAgTech`（既に年次自己ゲート、188 ms は年1回の農業tech再計算そのもの）、
`economy:caravans`/`economy:retailInventory`（§4.6で在庫消費の粒度維持のため実行継続と明記）。

## 10. オープンクエスチョン

- 在庫/価格を全Good一律倍率で動かす設計（§2.3）でよいか、Good種別（食料/資源/製品）ごとに別レートを持たせる
  必要があるか。
- 都市化ドリフト（rural→urban人口移動）をv1で完全に据え置いてよいか、それとも簡易な比率シフトを入れるか。
- セーブデータに「Fast-Forwardで進行した区間」の来歴を残すか（§7）。
- Nobility/Shipbuilding拡張有効時の追加コスト（本ベンチマーク未計測）に対しても同様のフェイク化が必要か
  ——現状はPhase 1a/1bの既存スキップで足りると判断しているが、実測されていない。
- `isBulkAdvance`のみのゲートで十分か、それとも「最小適用日数」のような追加しきい値
  （例: Advance Weekのような短い多日バッチは対象外にする）を設けるべきか。
- **（Phase 0で新規発見→調査・是正・確定まで完了）** 現行デフォルトバランスの国家財政の恒常的赤字は、
  `docs/plan/treasury-structural-deficit-investigation.md`で原因を特定し「案A」（施設維持費レートの適正化）
  を実装、平均-42.5%/yr→-19.0%/yr（中央値-12.9%/yr）まで改善した（2026-09-06）。それでもなお全シードで
  負のままだったが、追加の是正案「案B」（州単位の集約予算上限）はユーザー判断により実装しないことに決定し
  （2026-09-06）、案Aのみ適用後の実測値（中央値-12.88%）を「標準」プリセットの国庫成長率として確定した
  （§5.2）。
- Collapse〜Boomの5プリセットのうち「標準」以外は未実測の相対見積もりのまま（§5.2）——実際にプレイして
  違和感がないか、Phase 2実装後にプレイテストで検証する必要がある。
- ~~**（Phase 1実装のライブ確認で新規発見、§9.4）** Fast-Forward中も実計算のまま残す§2.2のシステム群が
  Fast-Forwardの`treasuryGrowthPctPerYear`と並行して`state.treasury`/`burg.treasury`を直接書き換え続けるため、
  プリセットの国庫成長率が字面通りの結果を生まない。~~ **Phase 3で是正（2026-09-06、§9.8.1）。** ユーザー選択
  「系統的な流出を停止」方針で、`debitTreasury`家族＋`StateSecretKnowledge`＋`GreatLibrary`のFF時treasury書き込みを
  スキップ。ライブ実測でFF「標準」の国庫比が0.832（プリセット-13%近傍）に整合。
- ~~**（Phase 1実装のライブ確認で新規発見、§9.2.2）** `Production.produce()`をスキップすることで、それに依存する
  §2.2の「対象外」システムが古いデータを参照し続けるリスク。~~ **Phase 3で網羅監査（2026-09-06、§9.8.3）。**
  `annualUrbanLabor`（Phase 1でガード済み）以外に追加ガードが必要な事例は無し——`urbanWaterSystem.workshopIntensity`
  等の凍結ドリフトは`burg.sanitation`等の civic score を横ばいにするだけで複利的暴走は無く、近似モードの
  明示された制限の範囲内。`MetallurgWork.*`・`civilAdministration`・`minting`等はFF中そもそも不活性。

## 11. 次のアクション

1. ~~Phase 0（ベンチマーク拡張・キャリブレーション実測）に着手し、「標準」プリセットの数値を確定させる。~~
   **完了（2026-09-05）** — 結果は§5.2/§5.3、生データは`docs/analytics/fast-advance-calibration.json`。
2. ~~国庫の恒常的赤字（§5.3.3）は、Fast-Forwardのプリセットに採用するかどうかを決める前に、経済バランス側の
   原因調査を別途依頼することになった。~~ **調査完了（2026-09-05）、一次是正（案A）実装完了・「標準」
   プリセット国庫成長率も確定（2026-09-06）** ——新規起票した
   [`docs/plan/treasury-structural-deficit-investigation.md`](treasury-structural-deficit-investigation.md)
   で実施。結論: 総赤字の93%が、`chemMedCommon.ts#debitTreasury()`を共有する化学/医療/インフラ施設系
   モジュール群（ダム・実験工房・薬種工房・堤防・病院——うち計測時点で解禁済みの5モジュールのみ）の
   「新設費＝恒久的な年間予算（減額なし）」という単一パターンで説明できる。中核経済（税収・行政・機密研究等）
   はそれ自体年-74程度で安定しており問題ない。「維持費不足による停滞」効果（崩壊リスク・死亡率結合等）は
   ユーザー指示によりスコープ外とし、renewal debitを実世界ベンチマークに基づく維持費率（土木2%/その他10%）
   に減額する「案A」のみ実装した。再実測の結果、国庫成長率は平均-19.0%/yr・中央値-12.9%/yrまで改善した
   ものの、依然として負のまま——「案B」（州単位の集約予算上限）はユーザー判断により実装しないことに決定し、
   案Aのみ適用後の値（中央値-12.88%、丸めて-13%）を「標準」プリセットの国庫成長率として確定した（§5.2）。
3. ~~（ユーザー決定、2026-09-05）Phase 1（コアエンジン実装）には未着手のまま、いったん停止して本書全体の
   レビュー待ちとする。~~ **「標準」プリセットの4項目が全て確定した（2026-09-06）ため、Phase 0は完全に
   完了した。**
4. ~~Phase 1（コアエンジン実装）に着手するかどうかは、改めてユーザーに確認する。~~ **実装完了（2026-09-06）**
   ——ユニットテスト・timeEngine統合テスト・実ブラウザでのライブ確認の3段階で検証し、ライブ確認でのみ顕在化
   したジッター複利複合バグ（人口暴走）を発見・修正した（§9.2.1）。国庫の「他システムとの合成」問題（§9.4）
   と`Production.produce()`依存の網羅監査（§9.2.2）はPhase 3に持ち越し。
5. ~~**未着手・要ユーザー判断**: Phase 2（詳細スライダーUI・i18n拡張・`FastAdvanceSettingsDialog.tsx`）に
   進むか、それより先にPhase 3（§9.4/§9.2.2の是正）を優先するか、あるいはここで一区切りとするかを確認する。~~
   **Phase 2実装完了（2026-09-06、ユーザー指示）** ——詳細は§9.7。`tsc`/`biome`/lint/`madge`/`build`/ユニット
   スイート（3718件）/i18nキー一致テスト、および新規E2E`tests/e2e/fast-advance-settings.spec.ts`すべてgreen。
6. ~~**未着手・要ユーザー判断**: Phase 3（§2.3の周辺システム依存監査＋§9.2.2の`Production.produce()`依存の
   網羅監査＋§9.4の国庫合成問題の是正）に進むか、あるいはここで一区切りとするか。~~ **Phase 3実装完了
   （2026-09-06、ユーザー指示。§9.4の方針は`AskUserQuestion`で「系統的な流出を停止」を選択）** ——詳細は§9.8。
   `tsc`/`biome`/`lint:legacy`/`madge`/`build`/ユニットスイート（3730件、448ファイル）green、新規E2E
   `tests/e2e/fast-advance-phase3.spec.ts`（実5年ウォームアップ後の実 vs FF「標準」A/B）もgreen——FF「標準」の
   国庫比0.832がプリセット-13%近傍に整合することをライブ確認。
7. **未着手・要ユーザー判断**: ここで一区切りとするか、さらに§9.6の残タスク（バルク経路`npm run perf:advance-year`
   でのFF ON/OFF短縮率実測、実ブラウザでのend-to-end決定性確認）や§10の未決事項（Collapse〜Boomの非「標準」
   プリセットのプレイテスト検証、Good種別ごとのレート分岐、都市化ドリフト、セーブ来歴、`isBulkAdvance`のみの
   ゲートで十分かの判断）に進むか。
