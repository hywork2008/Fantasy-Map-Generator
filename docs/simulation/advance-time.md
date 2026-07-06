# Advance Time: 時間経過シミュレーション仕様

本ドキュメントは、`window.fmg.actions.advanceTime()`（Tools タブの "Advance Time" ボタン）を起点とする
ゲーム内時間経過の仕組みと、それにフックする各拡張機能のティック処理をまとめた仕様書です。
実装は `docs/plan/shipbuilding.md` の Phase 0 で導入され、以降のフェーズ・後続セッションで各拡張が
順次フックを追加しています。

## 0. 全体像

```
ユーザーが Tools > Advance Time をクリック
  → openPrompt() で年数を入力 (src/controllers/tools.ts)
  → window.fmg.actions.advanceTime(deltaYears)
  → src/generators/timeEngine.ts の advanceTime()
      1. simulationContext.currentYear += deltaYears
      2. simulationContext.tickCount += 1
      3. worldContext.options.year をミラー更新（レガシー読み手のため）
      4. registerTimeTickHook() で登録された全フックを実行
      5. fmg:time-advanced / fmg:simulation-updated を dispatch
```

## 1. State層: `SimulationContext`

- 定義: `src/context/simulationContext.ts`
- フィールド: `currentYear: number`, `era: string`, `tickCount: number`
- `WorldContext` の 4 つ目のカテゴリとして独立している理由（`AGENTS.md` にも明記）:
  `worldContext.options.year`/`era` はマップ生成パラメータの静的な値だが、`SimulationContext` は
  セッション中に `advanceTime()` の呼び出しごとに反復して変化する「生きた時計」であり、意味論が異なる。

## 2. Generator層: `src/generators/timeEngine.ts`

| 関数 | 説明 |
| :--- | :--- |
| `registerTimeTickHook(fn)` | `advanceTime()` 呼び出しごとに `fn(deltaYears)` を実行するフックを登録する。セッション中永続（unregister なし）。拡張は `api.isExtensionEnabled()` でガードすること。 |
| `initSimulationClock()` | `worldContext.options.year`/`era` から `simulationContext` を再構築し、`tickCount` を 0 にリセットする。**マップ生成完了時**（`src/main.ts`）と**マップ読込完了時**（`src/io/load.ts`、`fmg:reinitialize-map-layers` 処理後）に呼ばれる。 |
| `syncSimulationClockFromOptions()` | `tickCount` はそのままに `currentYear`/`era` だけを `worldContext.options` から再同期する。Options の Generation タブで Year/Era をユーザーが編集した際（`react-change-year`/`react-change-era` イベント、`src/controllers/options.ts`）に呼ばれる。 |
| `advanceTime(deltaYears)` | 上記の全体像の通り。`deltaYears <= 0` は no-op。 |

## 3. イベント契約

| イベント名 | detail | 発火元 | 用途 |
| :--- | :--- | :--- | :--- |
| `fmg:time-advanced` | `{ deltaYears, currentYear }` | `advanceTime()` | 差分ベースの購読者向け（現状コア側の直接購読者はなし、将来用途）。 |
| `fmg:simulation-updated` | `{ currentYear, era }` | `advanceTime()` / `initSimulationClock()` / `syncSimulationClockFromOptions()` | UI（カレンダーオーバーレイ、ToolsTab 表示）の再描画トリガー。currentYear/era が変わりうる**全ての**経路で発火する。 |
| `fmg:generate-post-core` | なし | `src/main.ts`（コア生成完了後） | 拡張機能がマップ生成データを元に自身のデータを生成するタイミング。Shipbuilding/Economy/Nobility が購読。 |
| `fmg:shipbuilding-ship-completed` | `{ burgId, stateId, owner, shipClassId }` | `src/extensions/shipbuilding/generators/shipyardQueue.ts` | Military 側の `navalTechBonus.ts` が購読し、国家所有の完成船数に応じた海軍技術ボーナスを蓄積する（拡張間の直接 import を避けるイベント経由連携の例）。 |

## 4. UI表示

- **常時表示カレンダーオーバーレイ**（マップ右上固定）
  - `src/renderers/draw-calendar.ts` の `drawCalendar()`
  - `viewContext.calendar`（`RootLayers`、`#legend` と同様に `<svg>` 直下に固定配置され pan/zoom の影響を受けない）
  - 再描画タイミング: マップ生成直後（`main.ts`）、`fmg:simulation-updated` 受信時（`main.ts` のリスナー）、ウィンドウリサイズ時（`fitMapToScreen()` 内、`src/controllers/options.ts`）
- **Tools タブ Simulation セクション**（`src/ui/components/tabs/ToolsTab.tsx`）
  - `fmg:simulation-updated` を `useEffect` で購読し、ローカル state を更新する React ブリッジパターン
- **Advance Time ボタンのプロンプト入力**
  - `src/controllers/tools.ts` の `advanceTimeButton` ハンドラが `openPrompt()`（`src/ui/dialogs/dialogService.ts`）を呼ぶ
  - 従来存在した `showPrompt()`（`#prompt` DOM 要素依存のレガシー関数）は React 移行時に `#prompt` 要素自体が削除されたため恒久的に no-op化していたバグがあり、本セッションで発見・全 9 箇所（Advance Time 含む）を `openPrompt()` に統一し、デッドコードを削除した。

## 5. Year/Era 初期値とロック機構

- Options > Generation タブの「Year and era」は `useOptionsState`（Zustand）の `year`/`era` フィールド
- 入力すると `updateOptionAndLock()`（`GenerationSettingsTab.tsx`）が自動的に `lock(id)` を呼び、`localStorage[id]` に値を保存する
- `LockIconButton` で明示的にロック/アンロックも可能（`lock()`/`unlock()`、`src/utils/domUtils.ts`）
- マップ再生成時、`generateEra()`（`src/controllers/options.ts`）が `stored("year")`/`stored("era")` を見て、ロックされていなければ乱数で再生成する
- ロックされている Year/Era は再生成後もそのまま維持され、`initSimulationClock()` がそれを読むことで
  **シミュレーションの開始年がロックされた値になる**（例: 1422 年でロックしてから再生成すると、生成直後から
  `simulationContext.currentYear === 1422`）

### 5.1 修正済みバグ: `generateEra()` の stale Zustand スナップショット

```ts
// 修正前（バグ）
const store = useOptionsState.getState();               // スナップショットA
if (!stored("year")) store.setOptions({ year: rand(100, 2000) }); // ストア本体は更新されるが…
worldContext.options.year = store.year;                 // …store は古いスナップショットのまま読む
```

ロック時は `setOptions` 分岐がスキップされるため問題が顕在化せず、**アンロックして再生成した場合のみ**
新しい乱数値が `worldContext.options.year`（ひいては `simulationContext`）に反映されないという症状で発覚した。
`Relations History`（`DiplomacyHistoryDialog.tsx`）は `useOptionsState` を直接 reactive に読んでいたため
この影響を受けず、常に正しい値を表示していた。修正は `setOptions` 呼び出し後に `useOptionsState.getState()`
を再取得すること。

## 6. 各拡張機能の tick フック一覧

| 拡張 | フック内容 | ファイル |
| :--- | :--- | :--- |
| Shipbuilding | `runLoggingTick`（伐採量計上） → `runShipyardTick`（造船キュー進行・技術ポイント蓄積） → `checkForeignInterference`（外国干渉フレーバーログ） → 表示中なら `drawShipyards()` 再描画 → `refreshShipyardsOverviewIfOpen()` | `src/extensions/shipbuilding/index.ts` |
| Economy | `tickForestRegrowth(deltaYears)`（伐採で減少した森林生産性の自然回復） → 変化があれば `scheduleProductionRefresh()` | `src/extensions/economy/index.tsx` |
| Nobility | `Characters.advanceAge(deltaYears)`（全キャラクターの年齢加算＋高齢化による外見/武勇の追加減衰） → `refreshCharactersOverviewIfOpen()` | `src/extensions/nobility/index.tsx` |
| Military | 直接の tick フックは**なし**。`fmg:shipbuilding-ship-completed` イベント経由で `navalTechBonus.ts` にボーナスが蓄積されるのみで、実際に艦隊数へ反映するには `Military.generate()` の**手動**再実行が必要（下記 8 章参照）。 |

## 7. 生存中データの UI 更新パターン（in-place mutation + refresh）

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

## 8. 既知の制約・today's scope 外

- **Military は Advance Time に自動追従しない**: 艦隊数・部隊構成は `Military.generate()` が手動再実行
  （Tools の Military regenerate ボタン等）されるまで更新されない。これは循環依存回避のための意図的な
  設計判断（`docs/plan/shipbuilding.md` 参照）であり、バグではない。
- **Nobility の死亡・後継者システムと役職の「席替え」**:
  現在 `Characters.advanceAge()` は年齢加算と外見/武勇の漸減のみを行っていますが、今後は**健康状態・老衰・病気による死亡**判定が追加されます。
  役職者が死亡または辞任した場合、後任を選ぶ処理が走ります。この時、単に新規キャラクターを生成するだけでなく、政権中枢の**ベテラン役職者が空いた椅子の「旨味」を評価して鞍替えする（Musical Chairs）**ロジックが発動します。ベテランの鞍替えにより、新規生成されたキャラクターが排除されたり、連鎖的な役職交代が発生するダイナミックな政争がシミュレートされる予定です。また、血縁者への継承システムも導入されます（詳細は `docs/plan/characters.md` 参照）。
- **Economy を生成後にトグルで有効化するとクラッシュする既知のバグ**が別途あり、本仕様とは無関係だが
  Advance Time 周りの検証中にたびたび遭遇するため注記しておく（Economy 側の将来的な書き直しで対応予定）。
