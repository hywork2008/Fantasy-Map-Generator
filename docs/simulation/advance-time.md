# Advance Time: 時間経過シミュレーション仕様

本ドキュメントは、Tools タブの Advance Time ボタン（年/月/日）と `window.fmg.actions.advanceTime()` を起点とする
ゲーム内時間経過の仕組みと、それにフックする各拡張機能のティック処理をまとめた仕様書です。
基盤は `docs/plan/shipbuilding.md` の Phase 0 で年単位の仕組みとして導入され、`docs/plan/military-movement.md` と
`docs/plan/military-time-advance-review-findings.md` の作業で日/月単位の粒度に拡張されました。

## 0. 全体像

時間を進める経路は2つあります。

**UIボタン経由（日次ループ、`runTimeSimulation`）**

```
ユーザーが Tools タブの Advance Time（年/月/日いずれかのボタン）をクリック
  → CustomEvent "react-tool-action"（detail: { action: "advanceTimeButton", years, months, days }）
  → src/controllers/tools.ts のディスパッチャ → runTimeSimulation(years, months, days)
  → src/generators/timeEngine.ts の runTimeSimulation()
      1. 年/月/日の合計を「経過日数」に換算（うるう年考慮）
      2. requestAnimationFrame ループで advanceTime(0, 0, 1) を1日ずつ繰り返し呼ぶ
      3. useTimeSimulationState（Zustand）に進捗を反映、stopRequested で中断可能
```

**プログラム経由（一括、`window.fmg.actions.advanceTime`）**

```
window.fmg.actions.advanceTime(deltaYears, deltaMonths?, deltaDays?)  // app.ts で advanceTime を直接バインド
  → advanceTime() を1回だけ呼ぶ（日次ループを経由しない）
```

E2E テストやスクリプトからの一括操作はこちらを使う想定。UIボタンは日次ループを通すため、日単位で解決される
tick フック（森林回復・造船・軍事シミュレーション等）が「1年分を1回で処理する」のではなく「365回、1日分ずつ処理する」
点が一括呼び出しと異なる（§6参照）。

`advanceTime(deltaYears, deltaMonths, deltaDays)`（`src/generators/timeEngine.ts`）本体の処理:

1. 全国家の連隊の `actionStatus` を `"waiting"` にリセット
2. `simulationContext.currentYear`/`currentMonth`/`currentDay` を更新（月末繰り上げ・うるう年を考慮した日付演算）
3. `simulationContext.tickCount` をインクリメント、`worldContext.options.year`/`month`/`day` へミラー
4. `simulateDemographics()` を実行（人口動態）
5. 登録済み `_tickHooks` を全て実行（`fn(deltaYears, deltaMonths, deltaDays)`）
6. `fmg:time-advanced` / `fmg:simulation-updated` を dispatch
7. 開発ビルドでは `useDebugSnapshotState` にスナップショットを追加（デバッグ用）

## 1. State層: `SimulationContext`

- 定義: `src/context/simulationContext.ts`
- フィールド: `currentYear: number`, `currentMonth: number`（1-12）, `currentDay: number`（1-31）, `era: string`,
  `tickCount: number`, `intelligence: Record<number, Record<number, IntelligenceReport>>`（Nobility拡張のespionage-generator.tsが書く諜報推定値）,
  `strategicGoals: Record<number, StrategicGoal[]>`（Nobility拡張のstrategic-planner.tsが書く国家ごとの戦略目標）
- `WorldContext` の4つ目のカテゴリとして独立している理由（`AGENTS.md` にも明記）:
  `worldContext.options.year`/`era` はマップ生成パラメータの静的な値だが、`SimulationContext` は
  セッション中に `advanceTime()` の呼び出しごとに反復して変化する「生きた時計」であり、意味論が異なる。
- `intelligence`/`strategicGoals` はNobility拡張のドメインデータだが、`advanceTime()`と同じ「tickごとに変化する生きた状態」という性質からここに同居している（AGENTS.mdの定義通り）。

## 2. Generator層: `src/generators/timeEngine.ts`

| 関数 | 説明 |
| :--- | :--- |
| `registerTimeTickHook(fn)` | `advanceTime()` 呼び出しごとに `fn(deltaYears, deltaMonths, deltaDays)` を実行するフックを登録する。セッション中永続（unregister なし）。拡張は `api.isExtensionEnabled()` でガードすること。 |
| `initSimulationClock()` | `worldContext.options.year`/`month`/`day`/`era` から `simulationContext` を再構築し、`tickCount` を 0 にリセットする。**マップ生成完了時**（`src/main.ts`）と**マップ読込完了時**（`src/io/load.ts`、`fmg:reinitialize-map-layers` 処理後）に呼ばれる。 |
| `syncSimulationClockFromOptions()` | `tickCount` はそのままに `currentYear`/`currentMonth`/`currentDay`/`era` だけを `worldContext.options` から再同期する。Options の Generation タブで Year/Era をユーザーが編集した際に呼ばれる。 |
| `advanceTime(deltaYears, deltaMonths=0, deltaDays=0)` | §0参照。3引数とも0以下ならno-op。 |
| `runTimeSimulation(targetDeltaYears, targetDeltaMonths, targetDeltaDays)` | 3つの引数を合計日数に換算し、`requestAnimationFrame` ループで `advanceTime(0, 0, 1)` を1日ずつ呼ぶ。`useTimeSimulationState`（Zustand）で多重起動を防止し進捗・中断を管理する。 |
| `isLeapYear(year)` / `getDaysInMonth(year, month)` | 日付演算のユーティリティ。 |

## 3. イベント契約

| イベント名 | detail | 発火元 | 用途 |
| :--- | :--- | :--- | :--- |
| `fmg:time-advanced` | `{ deltaYears, deltaMonths, deltaDays, currentYear }` | `advanceTime()` | 差分ベースの購読者向け。 |
| `fmg:simulation-updated` | `{ currentYear, currentMonth, currentDay, era }` | `advanceTime()` / `initSimulationClock()` / `syncSimulationClockFromOptions()` | UI（カレンダーオーバーレイ、ToolsTab 表示）の再描画トリガー。currentYear/era が変わりうる**全ての**経路で発火する。 |
| `fmg:generate-post-core` | なし | `src/main.ts`（コア生成完了後） | 拡張機能がマップ生成データを元に自身のデータを生成するタイミング。Shipbuilding/Economy/Nobility が購読。 |
| `fmg:shipbuilding-ship-completed` | `{ burgId, stateId, owner, shipClassId }` | `src/extensions/shipbuilding/generators/shipyardQueue.ts` | Military 側の `navalTechBonus.ts` が購読し、国家所有の完成船数に応じた海軍技術ボーナスを蓄積する（拡張間の直接 import を避けるイベント経由連携の例）。 |
| `fmg:shipbuilding-log-harvested` | `{ cellId, burgId, amount, deltaYears }` | `src/extensions/shipbuilding/generators/logging.ts` | Economy拡張がWood産出係数を減衰させるトリガー。 |

## 4. UI表示

- **常時表示カレンダーオーバーレイ**（マップ右上固定）: `src/renderers/draw-calendar.ts` の `drawCalendar()`。`fmg:simulation-updated` 受信時に再描画。
- **Tools タブ Simulation セクション**（`src/ui/components/tabs/ToolsTab.tsx`）: 年/月/日それぞれ個別に数量を指定して進める3つのボタンがあり、いずれも `react-tool-action`（`advanceTimeButton`）経由で `runTimeSimulation()` を呼ぶ。実行中は `useTimeSimulationState` の進捗・中断ボタンを表示する。

## 5. Year/Era 初期値とロック機構

- Options > Generation タブの「Year and era」は `useOptionsState`（Zustand）の `year`/`era` フィールド
- 入力すると `updateOptionAndLock()`（`GenerationSettingsTab.tsx`）が自動的に `lock(id)` を呼び、`localStorage[id]` に値を保存する
- マップ再生成時、`generateEra()`（`src/controllers/options.ts`）が `stored("year")`/`stored("era")` を見て、ロックされていなければ乱数で再生成する
- ロックされている Year/Era は再生成後もそのまま維持され、`initSimulationClock()` がそれを読むことで
  シミュレーションの開始年がロックされた値になる

## 6. 各拡張機能の tick フック一覧

すべて `registerTimeTickHook(fn)` で `(deltaYears, deltaMonths, deltaDays)` の3引数を受け取る。UIボタン経由の
日次ループは `advanceTime(0, 0, 1)` を繰り返すため、**`deltaYears` は常に `0`** になる — 年ベースの処理だけを
見るフックはこれで実質的に無効化されてしまう既知の落とし穴があった（`docs/plan/military-time-advance-review-findings.md` §1.3）。
現在は全てのフックが `effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425` を自前で
計算し、どの経路（一括呼び出しでも日次ループでも）でも正しく進行するようになっている。

| 拡張 | フック内容 | ファイル |
| :--- | :--- | :--- |
| Shipbuilding | `runLoggingTick`（伐採量計上） → `runShipyardTick`（造船キュー進行・技術ポイント蓄積） → `checkForeignInterference`（外国干渉フレーバーログ） → 表示中なら `drawShipyards()` 再描画 → `refreshShipyardsOverviewIfOpen()`。全て `effectiveDeltaYears` を使用。 | `src/extensions/shipbuilding/index.ts` |
| Economy | `tickForestRegrowth(effectiveDeltaYears)`（伐採で減少した森林生産性の自然回復） → 変化があれば `scheduleProductionRefresh()` | `src/extensions/economy/index.tsx` |
| Nobility | `Characters.advanceAge` → `assignOfficers`/`assignProvinceLords` → （`currentDay === 1` の日のみ）`StrategicPlanner.evaluatePlans()` → `Espionage.generate()` → `StrategicPlanner.generate()` → `StrategicPlanner.advanceTension()`（tension蓄積・宣戦布告・`resolveSiege()`呼び出し） → `LocalSkirmish.resolve()`（隣接連隊の背景小競り合い） → 変化があれば軍事レイヤー再描画 → `Military.updateDynamic()`（自然回復・死亡連隊の掃除） → `advanceAllRegimentMovement()`（連隊の日単位移動、`bordersChanged`の有無に関係なく毎tick実行） → `refreshCharactersOverviewIfOpen()` | `src/extensions/nobility/index.tsx` |
| Military | 直接の tick フックは**持たない**（core generatorのため、代わりにNobility拡張のtick hookから `Military.updateDynamic()`/`advanceAllRegimentMovement()` が呼ばれる）。`fmg:shipbuilding-ship-completed` イベント経由で `navalTechBonus.ts` にボーナスが蓄積されるのみで、実際に艦隊数へ反映するには `Military.generate()` の**手動**再実行（`bordersChanged`時にNobility拡張が呼ぶか、Toolsの regenerate ボタン）が必要。 |

## 7. 決定性（シード再現性）

Nobility拡張のtickフック内の乱数（小競り合いの損耗率、諜報の誤差、包囲戦の奇襲判定など）は `AppServices.rng`
（`src/context/appServices.ts`）を使う。マップ生成時に呼ばれる `setSeed()`（`src/main.ts`）で `initRng(seed)` が
`appServices.rng` を専用の Alea ストリームで再シードし、これは**グローバルな `Math.random`（マップ生成そのものが
使う、こちらも同じタイミングで再シードされる）とは独立したストリーム**になる。分離している理由: UIのID生成や
オートセーブなど、シミュレーションと無関係な箇所でも `Math.random()` が呼ばれることがあり、それらがグローバル
ストリームの状態を消費してしまうと、同じシードで再読み込みしても tick フックの乱数列が再現されなくなる
（`docs/plan/military-time-advance-review-findings.md` §2.1）。tick フック内で新たに乱数が必要になった場合は
`Math.random()` ではなく `appServices.rng.rand()`/`.P()` 等を使うこと。

## 8. 生存中データの UI 更新パターン（in-place mutation + refresh）

`pack.characters` や造船キューなどは tick のたびに**参照はそのまま**でオブジェクトの中身だけが変異する
（`AGENTS.md` の「Object In-place Mutation Constraint」に従うため）。React はオブジェクトの中身の変化を
検知できないため、開いたままのダイアログは何もしないと古い値を表示し続ける。本実装では 2 パターンを使い分けている。

- **パターン A（Shipyards 方式）**: 専用 Zustand ストア（`shipyardsOverviewState.ts`）に描画用の「行データ」を
  都度コピーして保持し、tick 後に再構築して `setState()` する。ダイアログはそのストアだけを購読する。
  行データの導出ロジックが複雑な場合や、フィルタ/ソート対象が複数ダイアログにまたがる場合に向く。
- **パターン B（Characters Overview 方式）**: 既存の UI 状態ストア（`nobilityUiState.ts`）に軽量な
  `refreshToken: number` カウンターを追加し、tick 後に `bumpRefreshToken()` するだけ。ダイアログ側は
  `useMemo` の依存配列に `refreshToken` を加えることで、`characters` 配列参照は同じでも再計算を強制する。
  既存のフィルタ/ソートロジックをそのまま使い回せる場合に向く、より低コストな選択。

どちらのパターンも、tick フック側で「ダイアログが開いているときだけ」処理するガード
（`refreshXxxIfOpen()`）を通す。閉じている間は無駄な再計算を行わない。

## 9. 既知の制約・today's scope 外

- **Military.generate()は毎tick再実行されない**: 艦隊数・部隊構成の完全な再計算は `bordersChanged`（都市陥落等）発生時、または Tools の Military regenerate ボタンでのみ走る。日常の移動・自然回復・死亡連隊の掃除は `advanceAllRegimentMovement()`/`Military.updateDynamic()` が毎tick処理するため、これは「Advance Timeに何も追従しない」という意味ではない点に注意（旧版の本ドキュメントの記述は誤り）。
- **連隊の攻撃アニメーション中のロック**: `regiment-editor.ts` の手動攻撃クリックは、d3トランジション（約1秒）完了後に `Battle` インスタンスを生成する。この間にAdvance Timeが割り込んで対象連隊が消えることを防ぐため、`src/generators/battleLock.ts` が該当連隊を一時的にクリーンアップ対象から除外するロックを提供する（`docs/plan/military-time-advance-review-findings.md` §1.6）。
- **Nobility の死亡・後継者システムと役職の「席替え」**:
  現在 `Characters.advanceAge()` は年齢加算と外見/武勇の漸減のみを行っていますが、今後は**健康状態・老衰・病気による死亡**判定が追加されます。
  役職者が死亡または辞任した場合、後任を選ぶ処理が走ります。この時、単に新規キャラクターを生成するだけでなく、政権中枢の**ベテラン役職者が空いた椅子の「旨味」を評価して鞍替えする（Musical Chairs）**ロジックが発動します。ベテランの鞍替えにより、新規生成されたキャラクターが排除されたり、連鎖的な役職交代が発生するダイナミックな政争がシミュレートされる予定です。また、血縁者への継承システムも導入されます（詳細は `docs/plan/characters.md` 参照）。
- **Economy を生成後にトグルで有効化するとクラッシュする既知のバグ**が別途あり、本仕様とは無関係だが
  Advance Time 周りの検証中にたびたび遭遇するため注記しておく（Economy 側の将来的な書き直しで対応予定）。
