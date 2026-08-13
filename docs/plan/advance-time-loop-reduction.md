# Advance Month/Year のループ回数削減 計画

## 状態

**Phase 1a・Phase 1b ともに実装完了(2026-08-13)。** Phase 2〜3は未着手。

- ユーザー要望「Advance Month は Day×30、Advance Year は Day×365 の代わりに、Month は1回・Year は12回(Month単位)か1回にまとめてループ回数を減らしたい」への回答として、実際のコード・過去の設計決定を調査し、「できること」「できないこと」を切り分けた(2026-08-13)。
- **Phase 1a**: `core:manpower`を経過日数カウンタで自己ゲート化。詳細は3節Phase 1a。実測で約93%削減を確認。
- Phase 1a実装着手時、`core:militaryFallback`側の詳細読み込みで当初の想定(下記2.5節「フォールバック経路には反応/索敵ロジックは無い」)が誤りだったことが判明。`advanceAllRegimentMovement`はフォールバック経路でもNobility側と同じ`applyReactionMarchOrder`を呼んでおり、索敵/反応ロジックを持つ。また`Military.updateDynamic`は死亡連隊のクリーンアップと回復レートを同一ガード内で行っており、素朴にまとめて間引くと「死んだ連隊が最大1週間残り続ける」という見た目の副作用が出ることも判明した。そのため**`core:militaryFallback`は当初のPhase 1スコープから外し、Phase 1bとして再設計待ちにした**。
- **Phase 1b**: ユーザーから明確な設計方針の指示を受けて実装。「Conflict autonomy が Player-directed の場合、まとめて時間を進める(bulk advance)ときはターン制の細かい戦争をするつもりが無いので、軍隊の動きが一切無くても良い」(ユーザー、2026-08-13)。この指示により、当初懸念していた「間引き」ではなく「(条件付きで)丸ごとスキップ」という、より単純かつ効果の大きい設計を採用できた。詳細は3節Phase 1b。
- 検証: `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npm run build` すべてクリーン。既存テスト全てグリーン(回帰なし、2584→2587件)。Phase 1a: 新規characterization test 3件(`manpower.test.ts`数値等価性、`timeEngine.systems.test.ts`登録確認+ゲート発火end-to-end)。実測: `core:manpower`が366回中294.1ms(avg 0.804ms/call)——実装前の実測値(711burgマップで4008ms/366回、avg 11.0ms/call、`docs/analytics/advance-year-performance.md`)から約93%削減(マップ規模が異なる参考値)。Phase 1b: 新規テスト3件(`conflictDirector.test.ts`に`shouldSuppressConflictAdvance`の純粋ロジックテスト2件、`timeEngine.systems.test.ts`に`SimulationStepContext.isBulkAdvance`配線テスト1件)。

## TL;DR

- **トップレベルの「1回のAdvance Month操作＝1回の内部処理呼び出し」化は非推奨。** 2026-07-20（commit `156910fe6`, P2-5）に、まさにこれと同じ「月/年をまとめて1コミットで処理するbulk経路」を**意図的に廃止**し、「暦日1日＝1コミット」に統一した経緯がある（`docs/plan/unite-data-and-map.md` §6.2、`docs/reviews/unite-data-and-map-remediation.md`）。理由はUIの日次ループとpublic API(`window.fmg.actions.advanceTime`)とで tickCount・RNG消費・hook回数・四半期処理が食い違っていたため。これを戻すと「Advance Dayを30回押す」と「Advance Monthを1回押す」が同じ結果にならなくなる、という現在保証されている不変条件を壊す。
- **しかし実際に計測すると、Advance Month/Yearの「重い処理」の大半はすでに月次・年次境界ちょうどにしか実行されていない**（2026-08-03のP0/P1最適化で経過日数カウンタ方式に変更済み）。「Day×30」という体感は正しいが、それは「30回重い処理をしている」のではなく「365回のループの中に、まだ自己ゲートされていない軽くない処理（core:manpower ~11ms/日、core:militaryFallback ~7ms/日）が挟まっている」ことが主因。
- **できること・実装済み（Phase 1a）**: `core:manpower`を、既存の経済拡張と同じ「経過日数カウンタで自己ゲート」パターンに変換した。ループ回数（tickCount・コミット数）は変えず、この処理だけを実質「週1回」に間引く。数学的にほぼ同値（レート×deltaYearsの線形計算のみで、確率ロールに依存しない）。実測で約93%削減を確認済み。
- **できること・実装済み（Phase 1b）**: `core:militaryFallback`と`nobility.tick`の両方で、conflictAutonomyが`playerDirected`かつ多日バッチ（Advance Week/Month/Year等）のとき、連隊の移動・反応・攻城・小競り合いの解決を丸ごとスキップする。ユーザー自身がこの挙動差（Advance Dayなら通常どおり、まとめて進めるときは軍事解決を一切行わない）を明示的に許容・指示したため、Phase 1aのような「間引き」ではなくシンプルな条件付きスキップとして実装した。`conflictAutonomy`が`autonomous`のマップは影響を受けない（AIは継続解決が必要なため）。
- **できないこと（対象外のまま）**: `autonomous`ポリシー下でのNobility軍事解決（`localSkirmish.ts`）は「1日ごとの緩やかな消耗ロール」を明示的な設計として持ち、月/年単位に潰すと戦争のペース・結果そのものが変わる。これは性能最適化ではなくゲームデザインの変更になるため、本計画の対象外のまま。

---

## 1. 背景・現状分析

### 1.1 現在の実行モデル

`window.fmg.actions.advanceTime(deltaYears, deltaMonths, deltaDays)` も Tools タブの Advance Day/Month/Year ボタン（`runTimeSimulation`）も、最終的にはどちらも [`durationToCalendarDays()`](../../src/runtime/calendarDuration.ts) で期間を実際の暦日数に変換し、[`stepDaySimulation()`](../../src/generators/timeEngine.ts) を1日ずつ繰り返し呼ぶ（[timeEngine.ts:364-407](../../src/generators/timeEngine.ts)、UI側は[timeEngine.ts:754-835](../../src/generators/timeEngine.ts)）。1暦日＝1 `tickCount`・1回の[`SimulationSystem`レジストリ実行](../../src/generators/simulationSystem.ts)。Advance Month は約30回、Advance Year は約365回この内部ループが回る。

これは事故ではなく2026-07-20の意図的な設計決定（後述4.1）。

### 1.2 実測データ

[`docs/analytics/advance-year-performance.md`](../analytics/advance-year-performance.md)（2026-08-03調査、`npm run perf:advance-year`で再現可能）より:

| 処理 | 周期 | 実測コスト |
| :--- | :--- | ---: |
| 日次 retail reconcile | 毎日 | P0後 ~0.02s/年（すでに解決済み） |
| 月次 production settle | 実質12回/年 | ~7.8s/年（P1後） |
| **`core:manpower`** | **毎日・未ゲート** | **~11ms/日 ≒ ~4s/年** |
| **`core:militaryFallback`** | **毎日・未ゲート** | **~7ms/日 ≒ ~2.5s/年** |
| `core:demographics` | 毎日・未ゲート | ~0.6ms/日（軽微） |

Economy拡張ONでのAdvance Year合計は約15秒（P1後）。うち `core:manpower` + `core:militaryFallback` で約6.5秒（**~43%**）を占め、これが同じ文書の「次の本命（P2）」として名指しされている。

### 1.3 すでに「実質バッチ化」されている処理（誤解の補正）

「Advance Month = Day×30 の重い処理を30回」という前提は、経済拡張に関してはすでに成立していない。以下のように、経過日数カウンタで暦月/暦年境界に自己ゲートするパターンがすでに複数箇所で使われている:

| システム | 自己ゲートの仕組み | 場所 |
| :--- | :--- | :--- |
| 月次生産・税収決済 | `daysSinceLastProduction`（経過日数を蓄積し30日ごとに`settledMonths`をカウント、大きな`effectiveDays`が一度に来ても正しく複数回分決済する） | [economy/index.tsx:2229](../../src/extensions/economy/index.tsx), [:2447-2479](../../src/extensions/economy/index.tsx) |
| 鉱山探査 | `daysSinceLastProspecting` + `PROSPECTING_INTERVAL_DAYS = 365` | [economy/index.tsx:2234-2235](../../src/extensions/economy/index.tsx) |
| 建設雇用の申請待ち | `app.daysRemaining -= deltaDays` のカウントダウン | [constructionHire.ts:257-276](../../src/extensions/economy/generators/constructionHire.ts) |
| Guild/Academy/UrbanWater等の年次決済 | `settleAnnual()` が年境界を比較して自己ゲート（`cadence: {every:1}`で毎tick呼ばれるが中身は年1回だけ実行） | economy/index.tsx 各所 |
| `technology.tick` | `settleTechnologyAnnual(year)` が `lastEvaluatedYear === year` で自己ゲート | [timeEngine.ts:206-218](../../src/generators/timeEngine.ts) |

したがって Advance Year を1コミットで受けても、`production.settle` は365回ではなく実際に12回だけ走る（`docs/analytics/advance-year-performance.md` §2.1で366日/12回実測確認済み）。**この設計パターンは既存の慣習であり、Phase 1で新規に発明するものではなく踏襲するだけ**（後述）。

`docs/plan/seasonal-temperature-variation.md` にも同じ結論が明記されている: 「`SimulationSystem`の`cadence.every`は『月に1回』の意味では使えない（tick回数基準であり、日次連続再生もbulk一括ジャンプも同じ1tickとして数えられるため）。既存の`technology.tick`が正にこの問題への回答になっている」。**`cadence.every`フィールドは今回の用途には使えない** — これは罠なので、Phase 1でも使わない（後述4節）。

### 1.4 まだ365回/年フルで実行されている処理

`core:manpower`（[timeEngine.ts:696-702](../../src/generators/timeEngine.ts)）と `core:militaryFallback`（[timeEngine.ts:732-743](../../src/generators/timeEngine.ts)）は `registerSimulationSystem()` を使わず `advanceTimeMutation()` に直書きされており、自己ゲートを持たない。毎日、その日のtiny `effectiveDeltaYears`（≈1/365.2425）で比例計算を行う。これが1.2節のコストの正体。

加えて、ループそのものの固定オーバーヘッド（全国家の連隊`actionStatus`リセット、暦計算、`timeTickSystems.run()`のRNGストリーム切替・`TransactionWriter`生成、day-batchスナップショット/commit/通知）が365回分積み上がる。

---

## 2. なぜ単純に「Advance Month=1回、Advance Year=1回」にできないか

### 2.1 過去に一度試して、意図的に廃止された経緯（P2-5）

`docs/plan/unite-data-and-map.md` §6.2にはっきり書かれている:

> 日を target architecture の canonical step とする。（…）ただし、これは architecture migration と同時に現行挙動を変更してよいという意味ではない。現在は UI が `advanceTime(0,0,1)` を日数回呼ぶ一方、public action は期間全体を一回で渡すため、hook 回数、`tickCount`、RNG 消費、四半期処理が異なり得る。（…）**target の初期版には multi-day command を設けない。**

実際、以前は `simulation.advance` という「月/年をまとめて1コミットで処理するbulk経路」が存在した（[worldRuntime.ts:2422-2425](../../src/runtime/worldRuntime.ts)の`advanceSimulation()`は今も残骸として残っているが、呼び出し元は無い）。2026-07-20のcommit `156910fe6`でこれを廃止し、`advanceLegacyBulk`を「daily alias（deprecated）」に格下げして、UI日次経路・public bulk API・headless runnerのすべてが同一の日次コマンド列を通るよう統一した（[simulationRunner.test.ts:110-146](../../src/runtime/simulationRunner.test.ts)の`P2-5`テストが今もこの不変条件を固定している）。

理由は`docs/reviews/unite-data-and-map-remediation.md`の該当エントリに明記: 「UI 日次経路と public bulk 経路が別 semantics のまま」だったのを、「各 system の bulk/日次差を versioned migration で解消し、UI と `window.fmg.actions.advanceTime` が同じ daily command 列から同一 state・tickCount・RNG・event を作る」ことをもって解決 = Verified とした。

つまり **今のAdvance Month/Yearボタンを「1回のまとめ呼び出し」に戻すことは、3週間前に意図的に閉じた互換性ギャップを再度開けることになる。**

### 2.2 RNGストリームの決定性

`docs/simulation/advance-time.md` §7: tickフック内のRNGは「system ID と tick / date から独立した deterministic stream を得る」設計（`runWithSystemRng`）。tick回数そのものがストリーム導出の入力に入っているため、同じ暦日の出来事でも「365 tickに分けて到達した場合」と「12 tickにまとめて到達した場合」ではRNG消費列が変わる。これは同じシードでも「粒度を変えると違う世界史が生成される」ことを意味し、2.1で確認した不変条件（Advance Day×30 == Advance Month×1）と表裏一体で崩れる。

### 2.3 Nobility拡張の軍事解決は「日次」が意図的な設計

[`localSkirmish.ts:21-27`](../../src/extensions/nobility/generators/localSkirmish.ts)のコメント:

> army. Restores the pre-daily-tick "isolated exclave, no hope of relief" protection (…) Ordinary skirmishes between forces within this ratio still resolve as **gradual per-day attrition**.

死傷率は `5%〜10%` を**呼び出し1回ごとに**RNGでロールする（[localSkirmish.ts:206-207](../../src/extensions/nobility/generators/localSkirmish.ts)）。`deltaYears`でスケールされておらず、「1日ごとに緩やかに削れていく」ことそのものがペース設計。月/年単位に潰すと:

- スケールせずに集約すると：1ヶ月分の戦闘が「1日分」の消耗にしかならず、戦争が不自然に長引く。
- 逆にスケールを足すと：ロール回数と分散が変わり、統計的な結果（全滅か持ちこたえるか）が変質する。
- `ANNIHILATION_RATIO`による「即時全滅」判定も「このtickの時点の兵力比」を見るため、判定タイミング自体が変わる。

これは性能最適化ではなくゲームバランス/デザインの変更であり、本計画のスコープ外。

### 2.4 「今日は月初か」をその場スナップショットで判定しているゲート

[`nobility/index.tsx:318`](../../src/extensions/nobility/index.tsx):

```ts
if (api.simulationContext.currentDay === 1) {
  if (api.simulationContext.currentMonth === 1) advanceFrontierGovernance(...);
  if (canAdvanceConflict) StrategicPlanner.evaluatePlans();
  Mobilization.conscript(api.worldContext.pack);
}
```

これは経済拡張の`daysSinceLastProduction`のような「経過日数カウンタ」方式ではなく、「今日の暦日が1かどうか」を見るだけの判定。日次ループが前提だからこそ、暦が進むたびに`currentDay`が正しく1→2→…→31→1と遷移し、月初にちょうど1回だけ`true`になる。もしAdvance Monthを`(years:0, months:1, days:0)`の1回呼び出しに変えると、`currentDay`はそのまま変化しない（`advanceTimeMutation`は`deltaDays`分しか`currentDay`を進めない）ため、呼び出し前の暦日次第で「毎回発火し続ける」か「二度と発火しない」かのどちらかに壊れる。**Phase 1着手前に、こういう`currentDay===1`型の判定がNobility以外にも無いか棚卸しが必要**（現状把握している限りではNobilityのみ）。

### 2.5 反応・索敵の粒度喪失（盲目行進）

[`regimentMovement.ts:1019-1077`](../../src/generators/regimentMovement.ts)の`advanceAlongPath()`自体は「1回の呼び出しで複数セル分の移動距離を消化する」設計になっており、これ自体は月/年単位の移動距離をまとめて処理できる。しかし`advanceAllRegimentMovement()`内の索敵・反応（`applyReactionMarchOrder`、目標の再設定）は**呼び出しの先頭で現在位置を見て1回だけ**評価される（[regimentMovement.ts:1152-1178](../../src/generators/regimentMovement.ts)）。日次ループなら「今日接近してきた敵に明日反応する」がほぼリアルタイムに機能するが、月/年単位にまとめると、その期間中に射程に入ってくる敵に気づかず、開始時点の古い情報のまま丸々1ヶ月/1年分の距離を突っ切ってしまう「盲目行進」が発生する。

**重要**: `advanceAllRegimentMovement()`は**単一の共有関数**であり、Nobility拡張のtick（[nobility/index.tsx:345](../../src/extensions/nobility/index.tsx)）とNobility無効時のcore fallback（[timeEngine.ts](../../src/generators/timeEngine.ts)の`core:militaryFallback`）の**両方から同じ実装を呼んでいる**。つまり`applyReactionMarchOrder`のこの索敵/反応ロジックは、Nobilityが無効なfallback経路でも動いている（呼び出し引数`onCellEntered`/`activeSiegeTargetsByState`が未指定になるだけで、索敵/反応ロジック自体は無条件に実行される）。Phase 1着手時にこの点を見落とし、「fallback経路は反応/索敵ロジックを持たない単純な移動」という誤った前提で計画していたことが実装中に判明した。**fallback経路の移動もこの盲目行進の懸念から逃れられない**（3節Phase 1b参照）。

---

## 3. 提案: フェーズ分割計画

### Phase 1a（実装済み・2026-08-13）— manpowerの経過日数カウンタ化

**対象**: [`timeEngine.ts`](../../src/generators/timeEngine.ts)の`advanceTimeMutation()`に直書きされていた`core:manpower`呼び出し。`manpower.tick`という新規`SimulationSystem`（`phase: "population"`）に昇格し、旧来のインライン呼び出しは削除した。

**実装内容**: economy拡張の`daysSinceLastProduction`と同じ「経過日数カウンタで自己ゲート」パターン（1.3節）。`cadence: {every: 1}`のまま**毎tick呼ばれる**が、中身は:

```ts
const MANPOWER_GATE_DAYS = 7;
let manpowerDaysAccumulated = 0;

registerSimulationSystem({
  id: "manpower.tick",
  phase: "population",
  // ...
  run: (context, writer) => {
    const sim = useOptionsState.getState();
    if (!sim.simManpower || !worldContext.pack?.states) {
      manpowerDaysAccumulated = 0; // オフ中に蓄積した端数を持ち越して再開時に不意打ちしない
      return;
    }
    const { years, months, days } = context.delta;
    manpowerDaysAccumulated += years * DAYS_PER_YEAR + months * DAYS_PER_MONTH + days;
    if (manpowerDaysAccumulated < MANPOWER_GATE_DAYS) return;
    const dueDeltaYears = manpowerDaysAccumulated / DAYS_PER_YEAR;
    manpowerDaysAccumulated = 0;
    tickManpower(worldContext.pack, dueDeltaYears, worldContext.populationRate);
    writer.markChanged("simulation.states", "simulation.military");
  }
});
```

`cadence.every`（tick回数ベース）ではなく、経済拡張と同じ「関数内部の経過日数カウンタ」を使う点が重要（1.3節末尾で確認した通り、`cadence.every`はこの用途に使えない）。間引き間隔は週次（7日）を採用（保守的な初期値。数値を見て将来調整可）。

**安全性の根拠**:

- `tickManpower`はすべて `(定数) × deltaYears` の線形レート計算（`manpower.ts` — `ANNUAL_DRAFT_SHARE`・`DEMOBILIZATION_SHARE_PEACE`・`ANNUAL_NATURAL_WASTAGE`はいずれも「年間◯%」の定数）。確率ロールに依存する分岐は無い。
- `loss < 0.5`で打ち切る箇所（[manpower.ts:468](../../src/generators/manpower.ts)）があり、1日分（deltaYears≈1/365）の消耗は端数が小さすぎて毎日切り捨てられていた。7日分まとめて適用する方が、むしろ数値的に正確になる（過小計上が減る）。
- `manpower.tick`は`registerSimulationSystem`の`phase: "population"`（`economy`/`politics`/`military`フェーズより先）に登録されているため、旧インライン呼び出しが`timeTickSystems.run()`より前に実行されていたのと同じ相対順序を維持する。

**この変更が2節の不変条件を壊さない理由**: `stepDaySimulation()`の呼び出し回数（tickCount・コミット数）は一切変えていない。経過日数カウンタは「Advance Dayを7回押す」でも「Advance Weekを1回相当で進める」でも同じ回数だけ蓄積されて同じタイミングで発火するため、P2-5が保証した「粒度非依存の結果一致」を壊さない（経済拡張の`daysSinceLastProduction`が既にこの性質を持っていることは`docs/analytics/advance-year-performance.md` §2.1で実証済み）。manpower.tickはRNGを消費しないため、RNG決定性への影響もない。

**検証（実施済み）**:

1. `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npm run build` — 全てクリーン。
2. 既存テストスイート全体（345ファイル・2584件）— 全てグリーン、回帰なし。
3. 新規characterization test:
   - `manpower.test.ts`「batching a week's worth of deltaYears into one call matches seven separate daily calls closely」— 7日分を1日ずつ7回に分けて適用した結果と、7日分をまとめて1回で適用した結果が1%未満の相対誤差で一致することを固定。
   - `timeEngine.systems.test.ts`「registers the built-in manpower.tick system in the population phase」— 登録確認。
   - `timeEngine.systems.test.ts`「manpower.tick self-gates on an accumulated-day counter...」— `stepDaySimulation()`を6回呼んでも連隊容量が変化せず、7回目で初めて変化することをend-to-endで固定。
4. `npm run perf:advance-year -- --seed=phase1-verify --extensions=characters,economy`実測（4844cells/344burgsマップ）: `core:manpower`は366回中294.1ms合計（avg 0.804ms/call）。実装前の実測基準（711burgsマップで4008ms/366回、avg 11.0ms/call、`docs/analytics/advance-year-performance.md`）と比較して概ね93%の削減（マップ規模が異なるため参考値）。同じ実行内の`core:militaryFallback`（1999.4ms/366回、Phase 1bでは未変更）には影響が無いことも確認。

### Phase 1b（実装済み・2026-08-13）— 多日バッチ×player-directedで軍事解決を丸ごとスキップ

**当初の想定と何が変わったか**: 元々は「Phase 1aと同じ間引きパターンを`core:militaryFallback`にも適用する」計画だったが、着手時のソース再読で(a)fallback経路もNobility側と同じ索敵/反応ロジック（`applyReactionMarchOrder`）を持つこと、(b)死亡連隊クリーンアップと回復レートが`Military.updateDynamic()`の同一ガード内にあり分割が必要なことが判明し（2.5節）、素朴な間引きは「盲目行進」「ゾンビ連隊」という副作用を招くと分かった。

その後ユーザーから明確な設計方針の指示を受けた:

> Conflict autonomyがPlayer-directedかつ、まとめて時間を進めたい時はターン制の細かい戦争をするつもりは無いので軍隊の動きは一切無くても良いです。

これにより「間引いて数値精度を保つ」から「特定条件下で丸ごとスキップしてよい」への方針転換ができ、2.3〜2.5節で挙げた懸念（盲目行進・スナップショット判定・死亡連隊クリーンアップのタイミング）が一括で無効化された——動かない/戦わないなら、それらの懸念はそもそも発生しない。

**実装内容**:

1. **`isBulkAdvance`フラグの新設**（[simulationSystem.ts](../../src/generators/simulationSystem.ts)の`SimulationStepContext`、[timeEngine.ts](../../src/generators/timeEngine.ts)）: 「今日は複数日にまたがる1回のトップレベル進行（Advance Week/Month/Yearや複数日の`advanceTime`/`runDaily`呼び出し）の一部か、それとも単発のAdvance Day/`stepDaySimulation`か」を表す。既存の`enterDayBatch()`/`exitDayBatch()`（day-batchスナップショット機構、Phase 1a以前から存在）を`enterDayBatch(totalDays)`に拡張し、そのバッチが何日分かを保持することで実現。UI（`runTimeSimulation`）・public bulk API（`advanceTime`）・headless（`runDaily`/`advance`、`simulationRunner.ts`の`DayBatchController.enter(totalDays)`）の全経路が同じ仕組みを通るため、一貫して判定できる。単発の`stepDaySimulation()`/`stepDay()`は常に`false`。
2. **`shouldSuppressConflictAdvance(isBulkAdvance)`**（[conflictDirector.ts](../../src/extensions/nobility/conflictDirector.ts)）: `isBulkAdvance && !mayAdvanceAutonomousConflict()`——多日バッチかつconflictAutonomyが`playerDirected`のときだけ`true`。
3. **`nobility.tick`**（[nobility/index.tsx](../../src/extensions/nobility/index.tsx)）: `canAdvanceConflict`に`&& !suppressConflictAdvance`を合成。これにより`StrategicPlanner.evaluatePlans/generate/advanceTension`・`LocalSkirmish.resolve`・攻城目標の取得・略奪/奪還コールバックが既存の`canAdvanceConflict`ガード経由で連鎖的に止まる。さらに`advanceAllRegimentMovement()`の呼び出し自体も`suppressConflictAdvance`のとき丸ごとスキップ（`regimentsMoved = false`）——これにより最もコストの大きい経路グラフ再構築（`buildSeaRouteGraph`/`buildLandRouteGraph`/`analyzeFrontiers`等）も回避できる。`Military.updateDynamic`（回復・死亡連隊クリーンアップ）は変更せず毎日実行のまま。
4. **`core:militaryFallback`**（[timeEngine.ts](../../src/generators/timeEngine.ts)）: 同じ条件（`bulkAdvance && normalizeConflictAutonomy(worldContext.options.conflictAutonomy) === "playerDirected"`）で`advanceAllRegimentMovement()`をスキップ。`Military.updateDynamic`は変更なし。Nobility無効時は`conflictAutonomy`はNobility固有の概念ではなくコアオプション（`worldContext.options.conflictAutonomy`、デフォルト`playerDirected`）なので、拡張の有無に関わらず同じ判定式が使える。

**`autonomous`ポリシーは無影響**: `mayAdvanceAutonomousConflict()`が`true`を返す間は`suppressConflictAdvance`が常に`false`になるため、AIが自律的に戦争を行うモードでは日次と同じ完全な解決が多日バッチでも継続する。

**P2-5不変条件との関係**: この変更は「Advance Day×N == Advance Month×1」という不変条件に、意図的かつ限定的な例外を導入する——ただし対象はNobility/military-fallbackの軍事解決パイプラインのみで、tickCount・RNGストリーム消費・経済/人口/技術等の他の全システムの挙動は一切変わらない。ユーザー自身がこの差異を明示的に許容・指示しているため、P2-5が守ろうとした「UIパス非依存の決定性」の趣旨（テスト再現性・セーブロード整合性）を損なわない範囲の、オプション駆動の意図的な仕様差として扱う。

**検証（実施済み）**:

1. `npx tsc --noEmit`・`npm run lint`・`npm run madge`・`npm run build` — 全てクリーン。
2. 既存テストスイート全体 — 全てグリーン、回帰なし。
3. 新規テスト:
   - `conflictDirector.test.ts`: `shouldSuppressConflictAdvance`が`playerDirected`×bulkのときのみ`true`を返し、`autonomous`では常に`false`であることを固定。
   - `timeEngine.systems.test.ts`: `stepDaySimulation()`単発では`isBulkAdvance===false`、`runDaily(3)`の3日間は`isBulkAdvance===true`であることをプローブシステムでend-to-end固定。
4. 深い統合テスト（実際に連隊が「移動しない」ことを行軍中の連隊で検証するテスト）は、`advanceAllRegimentMovement`が既存の進軍命令（`r.path`）を前提とし、最小フィクスチャでは索敵/駐屯/前線ロジックが命令をそもそも生成しないため確実な検証が難しく、見送った。代わりに上記2点（フラグ配線の正しさ・純粋な条件判定ロジックの正しさ）とコードレビューで足りるロジックの単純さ（1行の早期return×2箇所）で品質を担保している。

### Phase 2（中リスク・要事前計測）— ループ自体の固定オーバーヘッド削減

Phase 1後に改めて`perf:advance-year`で内訳を取り、「ループそのものの固定コスト」（regiment状態リセット、暦計算、RNGストリーム切替、`TransactionWriter`生成、day-batchスナップショット/commit/通知）が全体のどの程度を占めるか再計測してから着手判断する。現状のデータからは経済ON時で残りは数百ms/年程度と推測され、優先度はPhase 1より明確に低い。着手する場合も「365回のコミット自体は残したまま、各回の固定費を削る」方向であり、Phase 1と同じくP2-5の不変条件には触れない。

### Phase 3（本計画の対象外）— 明示的な「Fast-Forward」専用パス

「本当に1コールで月/年を進めたい」という要望が別途強くあるなら、それは既存のAdvance Day/Month/Yearボタンの内部最適化としてではなく、`docs/plan/unite-data-and-map.md` §6.2が明示する設計方針に従い、**進捗表示・中断機能を持たない、既存ボタンとは完全に別のUI導線・別のコマンド型**として新設する:

> 将来 profiling により必要になった場合も、interactive な progress / cancel を保つ日次 runner と、途中 commit を持たない明示的な headless batch command を別 interface とし、外部 caller の知らない所で semantics を切り替えない。

想定用途は「マップ生成直後に背景史を100年分一気に進めてから遊び始めたい」のような、日次の戦闘ペース・反応精度を求めないシナリオに限定。結果が既存の日次ループ経路と異なることをUI上で明示する必要がある（バグではなく仕様）。Nobility拡張をこのモードでどう扱うか（完全スキップ／簡易外挿／対象外にする）は別途ミニ計画が必要で、本計画のスコープには含めない。

---

## 4. できる/できないまとめ

| 項目 | 可否 | 理由 |
| :--- | :--- | :--- |
| `core:manpower`を経過日数カウンタで間引く | ✅ **実装済み（Phase 1a）** | 線形レート計算のみ、確率ロール無し。実測で約93%削減 |
| `core:militaryFallback`/`nobility.tick`の軍事解決を多日バッチ×player-directedで丸ごとスキップ | ✅ **実装済み（Phase 1b）** | ユーザーが明示的にこの挙動差を許容・指示。autonomousポリシーは無影響 |
| ループの固定オーバーヘッドを削る | 🔶 部分的にできる（Phase 2、未着手） | 効果未計測、優先度は要再評価 |
| `stepDaySimulation`の呼び出し回数自体を月/年単位に減らす | ❌ 非推奨 | P2-5で意図的に廃止した経緯があり、Advance Day×30==Advance Month×1の不変条件・RNG決定性を壊す（Phase 1bは軍事解決に限定した例外——ユーザー承認済み） |
| `autonomous`ポリシー下のNobility軍事解決（skirmish/siege）の粒度を落とす | ❌ 対象外 | 「日次の緩やかな消耗」が明示的なゲームデザイン、性能問題ではない。AIは継続解決が必要 |
| Nobility月初ゲート（`currentDay===1`）をそのまま月/年バッチに使う | ❌ 壊れる | スナップショット判定であり経過日数カウンタ方式に作り替えが必要（Phase 1bはこのガード自体は変更せず、`canAdvanceConflict`を経由する分岐だけを止めている） |
| 別建ての非対話Fast-Forwardコマンドを新設する | 🔶 将来検討 | 公式の設計方針に沿う形なら可能。既存ボタンとは別インターフェースが必須（Phase 3、別計画） |

---

## 5. 次のアクション

1. ~~Phase 1aの実装: `core:manpower`を`registerSimulationSystem()`化し、経過日数カウンタ自己ゲートを実装。~~ **完了（2026-08-13）**
2. ~~characterization testを追加してPhase 1aの数値等価性を固定。~~ **完了**
3. ~~Phase 1b: conflictAutonomy=playerDirected×多日バッチで軍事解決を丸ごとスキップ。~~ **完了（2026-08-13、ユーザー指示に基づく設計）**
4. Phase 2着手要否はPhase 1a/1b適用後の実運用での体感・追加計測を見て判断。
5. Phase 3（Fast-Forward専用パス）はユーザーから明確な要望が出た場合にのみ、別途ミニ計画を立てる。
