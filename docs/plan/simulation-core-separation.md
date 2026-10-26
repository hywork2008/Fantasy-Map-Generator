# シミュレーション・コア分離 設計・計画

## 状態

- 2026-10-16 設計・計画。**S0 完了**(§12)、**トラック R 完了**(§13)、**S1 完了**(§14)、**S2 完了**(§15)、**S3 完了**(§16)、**S4 完了**(§17)。§16.3 の設定のワールド保存を実施(§18)。**S5 完了**(§19)。**S6 完了**(§20・§21): Node で全拡張 1 年が動き、決定的な数学関数(§21)の導入でブラウザ・Node・jsdom の 3 環境のハッシュが 0・30・365 日で一致。§20.4(同じプロセスでの再読み込み)は §22、保存・再読み込みをはさんだ継続の一致は §23 で修正。S7 は未着手。
- 目的は**分離そのもの**。統計収集・API サーバなど、分離後にできる応用は本書の範囲外(§11 で触れるだけ)。

## 1. 目的

FMG のシミュレーション(時間進行 = `simulation.stepDay` の連続と、そこに登録される本体・拡張のシステム群)を、ブラウザの DOM・描画・UI から切り離した**シミュレーション・コア**としてまとめる。コアは次の 3 か所から、同じソースのまま実行できるようにする。

| 実行場所 | 用途 |
| --- | --- |
| ブラウザのメインスレッド | 現行どおり。地図表示と UI を伴う通常利用 |
| Node.js | ヘッドレスでの長期実行、バッチ処理、テスト |
| ブラウザの Web Worker(将来) | UI を固めずに長期間を進める。Worker には DOM が無いので、Node で動けばほぼ動く |

### 非目的

- 地図**生成**(heightmap → 国家・都市の配置)の分離。生成は描画と強く絡んでいるので別計画にする。本書の範囲は「.fmg を読み込んだ後の時間進行」。
- シミュレーション結果を変えること。分離の全工程を通して、同じ入力からは**ビット単位で同じワールド**が出ることを保証する(§8)。
- ファイルの大移動。ディレクトリ構成は原則いまのままにし、「どのモジュールがコアか」を依存規則と lint で定める(§4)。

## 2. 現状の調査結果(2026-10-16 実測)

esbuild のメタファイルで、`src/generators/timeEngine.ts` と全拡張の `generators/*.ts`(+ Characters のコアモジュール)から静的 import で到達するモジュールを数えた。

- 到達する `src/` モジュールは **759**。そのうち UI・描画側のモジュールは **69**。
  - 内訳: `src/renderers` 46、`src/store` 11、`src/i18n` 5、`src/canvas` 1、`src/ui` 1、拡張の `store`/`ui` 4、`.tsx` 1。
- 到達してしまう npm パッケージ: `three`、`three/webgpu`、`three/tsl`、`react/jsx-runtime`。どれもシミュレーションには不要。

### 2.1 UI・描画が混入する主な経路

実際に描画関数を**呼んでいる**のではなく、ほとんどが「まとめて再エクスポートするファイル(バレル)」や、ついでの import 経由で巻き込まれている。

| # | 経路 | 何が混入するか |
| --- | --- | --- |
| A | `timeEngine.ts` → `utils/aiDebugExporter.ts` → `renderers/index.ts` | 全レンダラ、`canvas/map-canvas`、three |
| B | `timeEngine.ts` → `aiDebugExporter.ts` → `utils/nodeUtils.ts` → `store/layerState.tsx` | React(`.tsx`)、レイヤ表示状態 |
| C | `demography-simulator.ts` → `burgs-generator.ts` → `services/tooltipService.ts` → `utils/domUtils.ts` / `services/viewLayerService.ts` / `store/toastStore` / `store/dialogState` | ツールチップ、トースト、ダイアログ、`viewContext` |
| D | `burgs-generator.ts` → `renderers/emblem-renderer.ts`(紋章キャッシュ登録) | 既知の例外として `lint-architecture.ts` に記録済み |
| E | 拡張 generators(53 ファイル)→ `extensions/hostCore.ts` → `renderers/draw-borders` / `draw-states` / `draw-military`、`canvas/map-canvas` | レンダラ。調べた範囲では、これらを実際に呼んでいるのは `runtime/renderCoordinator.ts` だけ |
| F | 拡張 generators(144 ファイル)→ `extensions/hostUtils.ts` → `utils/editorHelpers.ts` → `ui/dialogs/dialogService`、`domUtils`、`nodeUtils.layerIsOn` | ダイアログ、DOM ヘルパ |
| G | `characters/specializationRuntime.ts` → `characters/ui/charactersUiState.ts` | 拡張の UI 状態 |
| H | `economy/generators/urbanWaterSystem.ts`、`characters/epithetCatalog.ts` → `src/i18n` | 翻訳リソース |

### 2.2 実行時のブラウザ依存(コア対象ファイル約 730 件を grep)

| 依存 | 件数 | 主な箇所 | 性質 |
| --- | --- | --- | --- |
| `document.dispatchEvent` | 31 ファイル / 68 箇所 | `timeEngine.ts`、economy の隊商・債務・クーデター・戦争、shipbuilding の航海・造船 | **イベントバス代わり**。描画ではない |
| `document.addEventListener` | 6 ファイル / 13 箇所 | `timeEngine.ts`(`fmg:frontier-resource-discovered`、`fmg:map-ready-tasks-completed`)など | コア内部のモジュール間連絡にも DOM を使っている |
| `document.getElementById` / `querySelector` / `createElement` | 11 ファイル / 35 箇所 | `domUtils`、`nodeUtils`、`tooltipService`、`economy/marketFlowDiagnostics.ts` | UI 処理の混入 |
| `requestAnimationFrame` | 4 ファイル | `economy/incrementalBatching.ts`、`timeEngine.ts`、`battleLock.ts`、`production-generator.ts` | 処理を分割して UI に制御を返すためのもの |
| `localStorage` | 12 ファイル / 45 箇所 | `caravanMovement.ts`(10)、`charactersContext.ts`(6)、`tradeLogisticsSettings.ts`、`regimentMovement.ts` | シミュレーション設定をコアが直接読んでいる |
| zustand ストア | `useOptionsState` 60 ファイル / 214 箇所。他に `timeSimulationState`、`debugSnapshotState`、`fastAdvanceState`、`economyCalibrationState`(23)、`stateFiscalReportState` | `optionsState` は生成・シミュレーションのパラメータを持つ正規のストアだが、起動時に `localStorage` を読み、`persist` も付いている |
| `Math.random` | 60 ファイル / 164 箇所 | — | 分離には影響しないが、再現性(§8)の妨げになる |

### 2.3 拡張の初期化

拡張の `init(api)` では、UI の登録とシミュレーションの登録が 1 ファイルに混在している。

| 拡張 | エントリ | 行数 | シミュレーション登録 | UI 登録 |
| --- | --- | --- | --- | --- |
| economy | `index.tsx` | 3980 | 3 か所(うち 1 つは `ECONOMY_TICK_SYSTEM_IDS` を回す登録ループ) | 約 160 |
| characters | `index.ts` | 423 | `specializationRuntime.ts` 側 | 29 |
| nobility | `index.tsx` | 496 | 2 | 3 |
| shipbuilding | `index.ts` | 542 | 1 | 10 |

`ExtensionAPI`(`src/types/extension-api.ts`)も、UI 用とシミュレーション用のメンバが 1 つのインターフェイスに混在している。

### 2.4 既に良い状態の部分(土台として使う)

- `runtime/simulationRunner.ts` は「ヘッドレスでも共通の runner」として設計済みで、`notify: false` で DOM 通知を飛ばせる。
- `worldRuntime.ts`(コミット・ロールバック・トピック)と `simulationSystem.ts`(`reads`/`writes`/`after`/`cadence`)はシステム登録の契約として整っている。
- `renderCoordinator.ts` が「コミットを購読して描画する」形になっており、シミュレーションから描画への直接呼び出しは原則なくなっている。
- `lint-architecture.ts` が既に「generators から renderers への import 禁止(既存の例外は許可リストで管理)」を強制している。本書はこれを**推移的な到達性**に拡張する。
- `loadArchiveWorld()`(`city-editor/services/analysis/housingReport.ts`)で、Node から .fmg を読み込む実績がある。

## 3. 目標アーキテクチャ

```
                 ┌──────────────────────── Simulation Core ────────────────────────┐
                 │  worldContext / simulationContext / appServices(状態)          │
                 │  worldRuntime・simulationRunner・timeEngine(進行)             │
                 │  本体の simulation systems・各拡張の simulation モジュール        │
                 │  SimulationHost(唯一の入口, §5)                                 │
                 │                                                                   │
                 │  依存してよいもの: 純粋な TS、d3 の計算系、alea、flatqueue、      │
                 │  delaunator、jszip、zustand/vanilla                              │
                 │  依存してはならないもの: DOM、描画、React、three、UI ストア       │
                 └─────────────▲───────────────────────────────────▲───────────────┘
                     Ports(注入される小さなインターフェイス, §6)
             ┌───────────────┴───────────────┐       ┌───────────┴────────────┐
             │ Browser Adapter (app.ts)       │       │ Node Adapter            │
             │ events → document へ中継       │       │ events → ログ/コールバック│
             │ scheduler = rAF                │       │ scheduler = setImmediate │
             │ settings = localStorage        │       │ settings = JSON/引数     │
             │ progress → timeSimulationState │       │ progress → stdout        │
             │ commit → renderCoordinator     │       │ (描画なし)               │
             └────────────────────────────────┘       └──────────────────────────┘
```

原則:

1. コアは「どこで動いているか」を知らない。`typeof window` や `isHeadless()` による分岐をコアに書かない。環境差はすべて Port で受け取る。
2. UI はコアを**読み**、コマンドで**書く**(既存の `dispatchExtensionCommand` と WorldRuntime コミットの流儀)。コアが UI を呼ぶことはない。
3. 拡張は「シミュレーション部」と「UI 部」の 2 つのエントリを持つ。UI 部はシミュレーション部に依存してよいが、その逆は禁止。

## 4. 境界の定義と強制

### 4.1 コアのエントリ

コアに属するかどうかは、ディレクトリではなく**エントリからの到達性**で定める。

- `src/simulation/core.ts`(新規)… 本体側のコアの入口。`timeEngine`、`worldRuntime`、本体のシステム登録、`SimulationHost` を再エクスポートする。
- `src/extensions/<id>/simulation.ts`(新規)… 拡張ごとのシミュレーションの入口(§7)。

これらから静的 import で到達するモジュールはすべてコアとみなし、§3 の禁止依存を持ってはならない。

### 4.2 `lint:sim-boundary`(新規、`lint:legacy` に組み込む)

- `scripts/lint-sim-boundary.ts`: esbuild のメタファイル(`bundle: true, write: false, packages: "external"`)で、上記エントリからの到達集合を計算する。esbuild は vite が既に依存しているので追加導入は不要。
- 禁止対象:
  - パス: `src/renderers/`、`src/canvas/`、`src/ui/`、`src/controllers/`、`src/dom/`、`src/io/`(コアが使うものは除外して個別に許可)、`src/store/`(§6.5 の移行先を除く)、`src/i18n/`、`src/extensions/*/{ui,controllers,renderers,store}/`、すべての `.tsx`
  - パッケージ: `three*`、`react*`、`jszip` 以外のブラウザ専用パッケージ
- 違反が見つかったら、エントリから違反モジュールまでの**最短の import 経路**を表示する(§2.1 の表はこの方式で作った)。
- 既存の違反は `scripts/sim-boundary-allowlist.json` に**経路ごと**記録し、件数を CI に出す。許可リストは**減らす方向にしか変更しない**(新しい違反は即エラー)。
- 加えて、コアの到達集合に対して `document.` / `window.` / `localStorage` / `requestAnimationFrame` の grep を行い、同様に許可リストで管理する(実行時依存は import では分からないため)。

### 4.3 Node でのスモークテスト(DOM なし)

- vitest に `environment: "node"` のプロジェクトを追加する(`vitest.config.ts` の `projects`)。setupFiles は使わない。`document` も `window` も**定義しない**。
- テストの内容: fixture の .fmg を読み込み、全拡張のシミュレーション部を登録し、30 日進める。
- 最初は失敗する前提で `test.fails` として置き、S6 で通常のテストに切り替える。どこで落ちるかが、そのまま残りの作業一覧になる。

## 5. SimulationHost(コアの唯一の入口)

```ts
// src/simulation/host.ts
export interface SimulationHostOptions {
  readonly ports: SimulationPorts;                       // §6
  readonly extensions: readonly SimulationExtension[];   // §7。順序は依存関係から自動で決める
  readonly options?: Partial<SimulationOptions>;         // §6.5
}

export interface SimulationHost {
  loadArchive(data: Uint8Array): Promise<void>;          // .fmg → world/simulation(ブラウザと同じ修復処理)
  prepare(): Promise<void>;                              // map-ready タスク(economy 準備など)を完了まで実行
  advance(duration: CalendarDuration, opts?: AdvanceOptions): Promise<DailyRunResult>;
  saveArchive(): Promise<Uint8Array>;                    // prepareWorldArchive の結果
  readonly world: Readonly<WorldContext>;                // 読み取り用
  readonly simulation: Readonly<SimulationContext>;
  dispatch(request: ExtensionCommandRequest): WorldCommit<unknown> | null;
  dispose(): void;                                       // 登録したシステム・購読の解除
}
export function createSimulationHost(options: SimulationHostOptions): SimulationHost;
```

- ブラウザの `app.ts` もこの Host を使う。`window.fmg.actions.advanceTime` は `host.advance` の薄いラッパになる。**ブラウザと Node で実行経路を 1 本にする**ことが、両者で結果が一致する一番の保証になる。
- 進行中の UI 進捗・停止要求は `AdvanceOptions.onDay` / `shouldStop` で受け取る(現行の `DailyRunOptions` を引き継ぐ)。
- `dispose()` で、モジュールレベルのキャッシュも含めてコアの状態を初期化できるようにする。同じプロセスで別の地図を読み込み直すため。現状でリセット手段の無いモジュールキャッシュは、S5 で一覧にする。

## 6. Ports(環境依存の注入)

```ts
export interface SimulationPorts {
  readonly events: SimulationEventSink;     // 6.1
  readonly scheduler: SimulationScheduler;  // 6.2
  readonly settings: SimulationSettingsSource; // 6.3
  readonly clock?: { now(): number };        // 6.4(プロファイラ用。既定は performance.now)
  readonly log?: SimulationLogger;           // 既定は console
}
```

### 6.1 イベント(`document.dispatchEvent` の置き換え)

- コアに型付きのイベントバス `simEvents` を置く(`src/simulation/events.ts`)。中身は `EventTarget` で、Node・ブラウザ・Worker のどれにも組み込まれている。
  - `simEvents.emit("settlement-promoted", detail)` / `simEvents.on(...)`
  - イベント名と detail の型は 1 つの `SimulationEventMap` にまとめる。68 箇所のイベントを棚卸しして登録する。
- **コア内部の連絡**(`timeEngine` が `fmg:frontier-resource-discovered` を購読している等)は `simEvents.on` に置き換える。
- **UI 向けの通知**: Browser Adapter が `simEvents` のすべてのイベントを購読し、同じ名前の `CustomEvent` として `document` に再送する。既存の UI 側の `document.addEventListener("fmg:…")` は無改修で動き続ける。
- Node Adapter はイベントをコールバックかログに流す。
- 置き換えは機械的に行える(`document.dispatchEvent(new CustomEvent(name, { detail }))` → `simEvents.emit(name, detail)`)。ファイル単位で進め、各段階で §8 の golden テストを通す。

### 6.2 スケジューラ(`requestAnimationFrame` の置き換え)

- `scheduler.yield(): Promise<void>`: 長い処理の途中で制御を返す。
  - ブラウザ: rAF(現行どおり)
  - Node: `setImmediate`
  - Worker: `setTimeout(0)` または `scheduler.yield()`
- `incrementalBatching.ts` の時間予算判定はコア内に残し、待ち方だけを Port にする。
- `yield` の前後でワールドの状態が変わらないこと(UI が割り込んで書き込まないこと)は、既存の `battleLock` / `timeSimulationState.isRunning` の仕組みが担保している。結果がタイミングに依存しないことは §8 のテストで確認する。

### 6.3 設定(`localStorage` の置き換え)

- コアが `localStorage` から読んでいるシミュレーション設定(隊商の移動設定、交易・物流の設定、キャラクター関連、部隊移動)は、`settings.get(key): string | null` 経由にする。
- ブラウザでは `localStorage` をそのまま渡す。Node では JSON ファイルや引数から作った Map を渡す。
- 中長期的には、これらは「ワールドと一緒に保存されるべき設定」なのか「利用者の好み」なのかを 1 件ずつ判定する。前者は `simulationContext` に移して .fmg に保存する(同じ .fmg なら誰が開いても同じ結果になるように)。判定は S3 で一覧にしてから行う。

### 6.4 時計

- `performance.now` は Node にもあるので、置き換えは必須ではない。`Date.now` / `new Date()` がシミュレーション結果に影響している箇所(nobility 6 箇所など)だけを洗い出し、シミュレーション内の暦(`simulationContext`)に置き換える。壁時計に依存すると再現性が壊れるため。

### 6.5 ストア(zustand)

| ストア | 扱い |
| --- | --- |
| `optionsState`(シミュレーション・パラメータ) | 値の保持は `zustand/vanilla` の純粋なストア `simulationOptionsStore` としてコアに置く。`localStorage` の読み込みと `persist` は Browser Adapter 側でそのストアに後から付ける。UI の `useOptionsState` は同じストアを React フックで包んだものにし、API は変えない |
| `fastAdvanceState`、`economyCalibrationState`、`stateFiscalReportState` | 同様に、値はコアの vanilla ストアへ、永続化は Adapter へ。`stateFiscalReportState` は報告用のデータ。コアで計算した結果を UI が読む形になっているか確認し、UI 状態であればコアからの書き込みをやめてイベントに変える |
| `timeSimulationState`(進捗)、`debugSnapshotState` | コアからは参照しない。進捗は `AdvanceOptions.onDay`、デバッグ用スナップショットは `simEvents` の `day-committed` を Browser Adapter が受けて作る(経路 A・B がここで消える) |
| `layerState`(`layerIsOn`) | コアからは参照しない。レイヤ表示によって計算を変えている箇所があれば、それは表示状態で結果が変わるバグなので、計算をコア側で常に行うか、描画側へ移す |

## 7. 拡張の分割

各拡張を次の 2 エントリにする。

```
src/extensions/economy/
  simulation.ts   ← 新規: export const economySimulation: SimulationExtension
  index.tsx       ← UI: init(api) は api.registerSimulationExtension(economySimulation) を呼んでから UI を登録
```

```ts
export interface SimulationExtension {
  readonly id: string;                         // "economy"
  readonly requires?: readonly string[];       // ["characters"]
  register(api: SimulationExtensionAPI): () => void;  // 登録解除関数を返す
}
```

- `SimulationExtensionAPI` は、`ExtensionAPI` から次のメンバだけを取り出したものにする。
  - 状態: `worldContext`、`simulationContext`、`appServices`、`races`
  - システム・フック: `registerSimulationSystem`、`registerTimeTickHook`、`registerMapReadyTask`、`requestMapReadyTask`
  - コマンド・スライス: `registerExtensionCommand`、`dispatchExtensionCommand`、`registerStateSlice`、`registerSkillModifier`、`getEffectiveSkill`
  - その他: `createMapMarker`、`updateMapMarker`、`isExtensionEnabled`
  - 加えて `events`、`scheduler`、`settings`
- `ExtensionAPI extends SimulationExtensionAPI` とし、UI 用のメンバは `ExtensionAPI` 側にだけ置く。型で分けるので、シミュレーション部から UI の API は呼べない。
- economy: `index.tsx` の 3030 行目付近〜3600 行目付近にある tick システムの登録(`registerEconomyTickSystem` と `ECONOMY_TICK_SYSTEM_IDS` のループ、`marketTerritorySync` など)と、map-ready タスク・コマンド・スライスの登録を `simulation.ts` に移す。`tickSystemOrder.test.ts` が登録順を検証しているので、移動の正しさはそのテストで確認できる。
- **バレルの分割**(経路 E・F): `hostCore.ts` を `hostSim.ts`(状態・generators・純粋 utils)と `hostView.ts`(`BordersRenderer`、`StatesRenderer`、`MilitaryRenderer`、`createLayerCanvas`)に分ける。`hostUtils.ts` は、`confirmationDialog`、`downloadFile`、`removeCircle`、`applySorting`、`layerIsOn` を `hostUiUtils.ts` に移す。拡張 generators の import 先を `hostSim` に一括置換する(197 ファイル。機械的な作業)。調べた範囲では、拡張 generators はこれらの UI 関数を一度も呼んでいないので、置換だけで経路 E・F は消える見込み。
- 動的拡張(IndexedDB から読み込むもの)の扱いは、`DynamicExtensionAPI` にも同じ 2 段構成を後から用意する。v1 は組み込みの 4 拡張だけを対象にする。

## 8. 正しさの保証(golden テスト)

リファクタでシミュレーションの結果が 1 ビットでも変わったら検出する。

1. **S0 で基準を取る**: 小さい fixture の .fmg(`npm run fmg:small` の Islet 程度。リポジトリに置けるサイズ)を、全拡張を有効にして 30 日と 1 年進め、`prepareWorldArchive()` の結果を正規化(キーを整列)して SHA-256 を取る。これを `src/simulation/__golden__/` に保存する。
2. 以後の各 PR は、このハッシュが一致することを CI で確認する(`npm run test:sim-golden`)。
3. 意図して結果を変える PR(バグ修正など)は、このリファクタと**同じ PR にしない**。基準の更新は理由を書いた独立したコミットで行う。
4. S6 以降は同じテストを (a) jsdom 環境、(b) Node 環境(DOM なし)、(c) Playwright のブラウザで実行し、3 つのハッシュの一致を確認する。
5. 再現性を壊す要因(`Math.random` の直接使用 164 箇所、壁時計への依存)はハッシュが揺れる原因になる。S0 で 2 回連続実行して確認した結果、**揺れた**(§12.2)。原因は、地図を読み込んでも `Math.random` が再シードされないこと。トラック R(§13)で、時間進行中の `Math.random` をシミュレーション乱数へ束縛して解消した。golden は固定 PRNG なしで再現する。

## 9. 実装計画

各段階は単独でマージでき、マージした時点で次の 3 点を満たすこと。

- ブラウザの挙動が変わっていない
- `npm test`・`npm run test:e2e`・`npm run lint` が通る
- golden テストのハッシュが一致する

| 段階 | 内容 | 主なファイル | 完了条件 |
| --- | --- | --- | --- |
| **S0 計測と安全網** | `lint:sim-boundary`(到達性・最短経路・許可リスト)、golden テスト、Node 環境のスモークテスト(`test.fails`)、再現性の確認 | `scripts/lint-sim-boundary.ts`、`src/simulation/core.ts`(再エクスポートのみ)、`scripts/simGolden.mts`、`src/simulation/nodeSmoke.test.ts` | 完了(§12)。許可リストはモジュール 73 / パッケージ 5 / ブラウザ・グローバル 121 箇所。golden は 2 回連続で一致(`Math.random` 固定時) |
| **S1 import の断ち切り** | 経路 A(`aiDebugExporter` を `timeEngine` から外し、`day-committed` イベントで Browser 側が取得)、B(`nodeUtils.layerIsOn` の import を外す)、C(`burgs-generator` からツールチップ・トーストを外す)、D(紋章キャッシュ登録を描画側の購読に移す)、E・F(バレルの分割と一括置換)、G、H(i18n はキーだけを返し、翻訳は UI で行う) | `timeEngine.ts`、`aiDebugExporter.ts`、`burgs-generator.ts`、`hostCore.ts`、`hostUtils.ts`、拡張 generators(一括置換) | 到達集合から `renderers`・`canvas`・`ui`・`.tsx`・three・react が 0。許可リストは store と実行時依存だけになる |
| **S2 イベントバス** | `simEvents` と `SimulationEventMap`、68 箇所の置き換え、Browser Adapter による `document` への再送 | `src/simulation/events.ts`、31 ファイル | コアの到達集合で `document.` が 0(`getElementById` 系は S1 で解消済みのはず) |
| **S3 Ports** | `scheduler`(rAF 4 ファイル)、`settings`(`localStorage` 12 ファイル)、時計依存の整理。設定の「ワールドに保存すべきか」の一覧作成 | `incrementalBatching.ts`、`caravanMovement.ts`、`charactersContext.ts`、`tradeLogisticsSettings.ts`、`regimentMovement.ts` ほか | コアの到達集合で `localStorage`・`requestAnimationFrame` が 0 |
| **S4 ストアの分割** | `simulationOptionsStore` などの vanilla ストアへの分離、永続化を Adapter へ移す。`timeSimulationState`・`debugSnapshotState`・`layerState` のコアからの参照を除去 | `store/optionsState.ts`、`store/fastAdvanceState.ts`、`economy/store/economyCalibrationState.ts`、`timeEngine.ts` | 到達集合から `src/store`・拡張の `store` が 0。**許可リストが空になる** |
| **S5 拡張の分割と Host** | `SimulationExtensionAPI` / `SimulationExtension`、4 拡張の `simulation.ts`、`createSimulationHost`、`app.ts` を Host 経由に切り替え、`dispose()` 用のモジュールキャッシュ一覧 | `types/extension-api.ts`、`extensions/*/simulation.ts`、`extensions/*/index.ts(x)`、`src/simulation/host.ts`、`app.ts` | 完了(§19)。ブラウザの Advance Time が Host 経由で動く。4 つの `simulation.ts` をエントリにして新しい違反 0。Node で全拡張を登録して 30 日進む |
| **S6 Node で実行** | Node Adapter、`npm run sim -- <map.fmg> --days N --out world.fmg`(最小の CLI)、スモークテストを通常のテストに変更、3 環境で golden が一致 | `src/simulation/adapters/node.ts`、`scripts/sim.ts` | DOM の無い Node で、全拡張を有効にして 1 年進められる。3 環境のハッシュが一致する |
| S7 Web Worker(任意) | ブラウザで Host を Worker 上に置く。メインスレッドとは、コミットの差分かトピック単位のスナップショットで同期する。描画の購読方式の再設計が必要になるため、別途設計する | — | 設計書を起こす |

### 規模の見積もり

- S0: 小(スクリプト 1 本 + テスト 2 本)
- S1: 中。ただし大半は import 先の一括置換で、ロジックの変更は経路 A〜D の 4 か所
- S2: 中(68 箇所の機械的な置き換えと型定義)
- S3: 小〜中
- S4: 中〜大(`optionsState` は 60 ファイル・214 箇所から参照されている。API を変えずに中身を差し替えるので、参照側は原則無改修)
- S5: 大(economy `index.tsx` の分割と `app.ts` の起動経路の変更)
- S6: 小〜中(S5 までが終わっていれば、残りは Adapter と CLI)

S1 と S2 は独立しているので、並行して進められる。S4 は S3 の settings Port を使うので S3 の後にする。

## 10. リスクと対策

| リスク | 対策 |
| --- | --- |
| `document` 経由のイベントの順序が変わる(同期 dispatch の順序) | `EventTarget` も同期 dispatch なので順序は保たれる。Browser の再送はコア側のリスナより後に行う。golden テストで確認する |
| モジュール読み込み時の副作用(import しただけで `document.addEventListener` 等が動く) | S0 の Node スモークテストで、import の時点で落ちる箇所として検出できる。副作用は `register()` の中に移す |
| `optionsState` の初期化順序(`localStorage` の読み込みがストア生成時に行われている) | Browser Adapter が `createSimulationHost` より前に永続化を接続する順序を `app.ts` で固定し、テストで確認する |
| economy の `index.tsx` 分割で登録順が変わる | `ECONOMY_TICK_SYSTEM_IDS` と `tickSystemOrder.test.ts` が順序を検証している。golden テストでも確認する |
| `layerIsOn` などの表示状態に依存した計算が見つかる | その時点でバグとして修正する。リファクタとは別の PR にし、golden の基準更新を明示する |
| 生成側(`burgs-generator` など)がコアと生成の両方から使われている | 生成専用の関数は残す。コアから参照される関数だけを純粋化するか、純粋な部分を別モジュールに切り出す。生成全体の分離は非目的 |
| 長期間の作業中に新しい依存が混入する | S0 から `lint:sim-boundary` を CI で強制し、許可リストは減らす方向にしか変更できないようにする |

## 11. 分離後にできるようになること(範囲外・参考)

- Node での長期シミュレーションと統計収集(DOM のエミュレーションなしで、Chromium も不要)
- ブラウザの Web Worker 上での Advance Time(UI が固まらない)
- ブラウザと Node で同じ golden テストを回すことによる、シミュレーションの回帰検出
- コアだけを対象にしたメモリ計測(描画由来の保持と、ワールドデータの蓄積を切り分けられる)
- Node で複数の世界(チャンネル)を持ち、ブラウザから接続して共有する → [simulation-channel-server.md](simulation-channel-server.md)

## 12. S0 の結果(2026-10-16)

### 12.1 追加したもの

| ファイル | 内容 |
| --- | --- |
| `src/simulation/core.ts` | コアの入口。現時点では既存の時間進行 API の再エクスポートのみ |
| `scripts/lint-sim-boundary.ts`、`scripts/sim-boundary-allowlist.json` | `npm run lint:sim-boundary`(`lint:legacy` に組み込み済み)。許可リストは減らす方向にしか変更できない。`--update` は増加を拒否し、増加を記録するには `--accept-new` が必要。`--why <path>` で import 経路を表示する |
| `src/simulation/goldenHash.ts`(+ テスト) | WorldDocument の正規化ハッシュ。`world`・`simulation`・`opaqueExtensionChunks` を対象にし、`presentation` とタイムスタンプは除外する。`world.pack.*` と `simulation.extensions.*` は 1 段深く、セクションごとのハッシュを持つ。Web Crypto を使うので、ブラウザ・Node のどちらでも動く |
| `tests/fixtures/sim-golden.fmg`(2.4 MB) | seed 424242、Province スコープ 1500 セル、国家 2・都市 95・市場 95。4 拡張すべてを有効化した状態で保存 |
| `scripts/simGolden.mts`、`src/simulation/__golden__/browser.json` | `npm run test:sim-golden`。Chromium で fixture を読み込み、0 日・30 日・365 日の時点のハッシュを基準と比較する。所要時間は 1 回あたり約 15 秒。`--runs 2` で実行ごとの一致も検査する。`--update` は再現しない基準の書き込みを拒否する。`--dump <dir>` で各時点の .fmg を保存する |
| `scripts/simGoldenDiff.mts` | 2 つの .fmg の差分を末端の値まで列挙する(不一致の調査用) |
| `src/simulation/nodeSmoke.test.ts` | DOM なしの Node(`@vitest-environment node`、ブラウザ・グローバルを削除)で import → 読み込み → 30 日進行を試し、**現在最初に失敗する段階**を固定する。段階が進んだらこのテストが落ちるので、期待値を進める |

### 12.2 再現性: 地図を読み込んでも `Math.random` が再シードされない

- 同じ fixture を 2 回読み込んで 1 日進めただけで、`simulation.military[*].commanderId` と `characters[*].favor` が食い違った(729 値)。30 日後には 12,183 値が食い違った。
- 原因: `Math.random = Alea(seed)` が行われるのは地図**生成**の時だけ(`main.ts`)。読み込み(`world.replace`)では再シードされない。そのため読み込み後のシミュレーションは、ページ起動時の生成が残した乱数状態(ランダムなシード)を引き継ぐ。士官の任命など、`Math.random` を直接使うシステムの結果が実行ごとに変わる。
- これはテストだけの問題ではない。利用者が同じ .fmg を開いても毎回違う未来になり、ブラウザと Node の結果も一致しない。
- S0 の暫定対応: golden の読み込み直後に、`Math.random` を固定シードの mulberry32 に差し替える(`pinAmbientRandom`)。これで 2 回の実行が完全に一致した(0・1・30・365 日)。

### 12.3 境界の現状(許可リストの内容)

- 入口 364(`core.ts` と、拡張の暫定入口として generators と characters のルートにあるモジュール)から 764 モジュールに到達する。
- 禁止モジュールは 73。内訳は `src/renderers` 46、`src/store` 11、`src/i18n` 5(locale JSON を含む)、拡張の `store`/`ui` 4、view 系のサービス・utils 4、`canvas`・`context/viewContext`・`ui` 各 1。§2 の 69 との差は、characters のルートにあるモジュールを入口に加えたことと、locale JSON を数えたことによる。
- 禁止パッケージは 5: `three`、`three/tsl`、`three/webgpu`、`react/jsx-runtime`、`react-i18next`。
- ブラウザ・グローバルは 40 ファイル・121 箇所。内訳は `document.` 87、`localStorage` 25、`window.` 6、`requestAnimationFrame` 2、`navigator.` 1。
- Node スモークテストは import の段階で失敗する。原因は `localStorage is not defined`(`store/optionsState.ts#L646`、モジュール読み込み時の参照)。これは S4(ストアの分割)の対象で、§10 の「モジュール読み込み時の副作用」のリスクが実際に現れたもの。

### 12.4 S0 から見えた計画の修正

- **トラック R(乱数の一本化)を追加する**: `Math.random` を直接使っている 164 箇所を `simulationRng` のストリームへ移す。この作業はシミュレーション結果を変えるので、分離リファクタ(S1〜S6)の PR には混ぜず、独立した PR で golden の基準を更新する。→ §13 で S1 より先に実施した(順序変更に強い golden を先に得るため)。
- **Node スモークテストの段階を早く進めるため**: `optionsState` の `localStorage` 参照(モジュール読み込み時)は、S4 を待たずに S1 で「遅延読み込み」に変えることを検討する。ブラウザの挙動は変わらない。
- 拡張のシステムは各拡張の `init(api)` から登録されるため、Node スモークテストの「進行」段階は、S5 で拡張のシミュレーション入口ができるまで、本体のシステムだけで回すことになる。

## 13. トラック R: シミュレーション乱数の一本化(2026-10-16 完了)

### 13.1 計測

golden の実行中(fixture の読み込み後)に、`Math.random` の呼び出し元を記録した。

- 1 年の進行で **86,305 回・153 箇所**。`rand`/`P`/`ra`/`gauss` 経由の呼び出しを含むので、grep で数えた 164 箇所とは一致しない。
- 大半は characters・nobility の呼び出し: `rollPerYear`(健康)が 37,010 回、`advanceCharacterAging` が 29,208 回、人物生成(`createPerson`、`backstoryProfile`)、士官の任命など。
- `Advance Time` の呼び出しの**外**で 3,786 回。economy の月次生産決算(`queueMicrotask` で、進行が戻った後に実行される)の中で呼ばれる `rollLiveAnimalCatch` と `SmelterOperations.rollTheft` だった。

### 13.2 方式: 呼び出し箇所を書き換えず、時間進行中の `Math.random` を束縛する

- 既存の仕組みとして、`runWithSystemRng` がシステムごとに `appServices.rng` を差し替えていた。そのストリームは `simulation.rng.seed`・システム ID・tick・日付から導出されるので、他のシステムが乱数を何回引いても影響を受けない。
- `timeEngine` の `advanceTimeMutation` 全体で、`Math.random` を `() => appServices.rng.rand()` に束縛する(`src/simulation/simulationRandom.ts` の `withSimulationAmbientRandom`)。これにより次のようになる。
  - システムの中: そのシステム専用のストリームから引く
  - システムの外(人口処理など): 保存されているルートのストリームから引く
  - 進行が終わったら元の `Math.random` に戻すので、UI や地図生成には影響しない
- 進行の外で実行される economy の月次決算は、`runWithSimulationRandom("economy.productionSettlement", …)` で専用のストリームから引くようにした(`hostCore` から公開)。
- 153 箇所を個別に書き換えなかった理由: 束縛だけで、決定性とシステム間の独立性という目的は満たせる。書き換えは差分が大きく、それ自体が結果を変える。コア分離の S5 以降で、各システムが `context.rng` を明示的に受け取る形へ移す時に、少しずつ置き換えればよい。

### 13.3 時間軸シード(結果を分散させる仕組み)

- 乱数は `simulation.rng.seed` からすべて導出されるので、乱数の状態を保存したまま読み込むと、同じ未来を再現する。
- 地図の読み込み時(`io/load.ts` の .fmg 読み込みと、旧形式 .map 読み込みの両方)に `applySimulationTimeline` を呼ぶ。
  - **new**(既定): 新しい時間軸シード `<地図シード>~<乱数>` を作る。シードの生成には `crypto.getRandomValues` を使い、`Math.random` には触れない。読み込むたびに違う歴史になる。使ったシードは保存されるので、後から再現できる。
  - **continue**: 保存された乱数の状態をそのまま使う。
  - 明示的なシードの指定: API 用(Node ランナー、golden、展開の共有)。
- 設定は `uiPreferencesState.simulationTimelineOnLoad` に保存する。Advance Time ダイアログに「読み込み時の時間軸」の選択を追加した。ツールチップで現在のシードを表示する(英語・日本語)。
- 実際に確認した結果: continue では 2 回の実行が完全に一致した。new では、0 日時点で `simulation.rng` だけが異なり、30 日後には 14 セクションが異なった。
- 未実装: 時間進行の途中で時間軸を変えるボタン、シードを手入力する UI。

### 13.4 golden とガード

- `pinAmbientRandom` を削除した。golden は `simulationTimelineOnLoad: "continue"` で fixture を読み込み、固定 PRNG なしで 2 回の実行が一致する。基準は R の結果で更新済み(シミュレーション結果が変わるので、意図した更新)。
- **ガード**: golden は読み込み後のページで `Math.random` を監視する。シミュレーション乱数に束縛されていない呼び出しが 1 回でもあれば、呼び出し箇所を列挙して失敗する(`--trace-random <file>` で一覧を保存できる)。現在は 0 回。
- 注意: このガードが見るのは golden の fixture が通る経路だけ。戦争・飢饉など、fixture の 1 年で起きない経路は検出できない。fixture を増やすか、Node ランナー(S6)で長期間を回す時に、同じガードを掛ける。

## 14. S1 の結果(2026-10-16)

### 14.1 境界の変化

| 指標 | S0 後 | S1 後 |
| --- | --- | --- |
| コアから到達するモジュール | 764 | 685 |
| 禁止モジュール | 73 | 8 |
| 禁止パッケージ | 5(three ×3、react/jsx-runtime、react-i18next) | 0 |
| `src/renderers`・`canvas`・`ui`・`.tsx`・`i18n` | 46・1・1・1・5 | すべて 0 |

残っている 8 件は、S1 の対象外として残したもの。

- `src/store/*` 5 件(`optionsState`、`fastAdvanceState`、`timeSimulationState`、`uiPreferencesState`、economy の `economyCalibrationState`・`stateFiscalReportState`)と characters の `playerCharacterState`: S4(ストアの分割)で扱う。
- `src/context/viewContext.ts`: SVG 選択の入れ物。読み込み時に DOM には触れない(`typeof document` で守られている)。生成系のクラス(`States`・`Military`・`Names` ほか約 20 個)が `this.viewContext` を引数として受け渡しているだけで、生成の分離(非目的)と一緒に扱う。burgs・routes の 2 クラスは、使っていない既定値の import だけを外した。

### 14.2 断ち切った経路

| 経路 | 対処 |
| --- | --- |
| A `timeEngine` → `aiDebugExporter` → 全レンダラ・three | デバッグ用スナップショットの取得を `installDebugSnapshotCapture()`(`fmg:time-advanced` の購読)に移し、`app.ts` から登録する |
| C・D `burgs-generator` → `tooltipService`・`emblem-renderer`・`removeBurgIcon/Label` | `src/simulation/viewPort.ts`(`simulationView.tip`・`burgAdded`・`burgRemoved`)を経由するようにした。ブラウザの処理は `app.ts` の `installBrowserSimulationViewPort()` で登録する。登録が無い時(Node・テスト)はログを出すだけ。`names-generator` の `tip` も同じ |
| `services/*` → `renderers/coastline-fractal.ts` | 純粋な幾何計算だったので `src/utils/coastlineFractal.ts` へ移動した(12 ファイルの import を更新) |
| E `hostCore` → `draw-borders`・`draw-states`・`draw-military`・`map-canvas` | レンダラ 3 つは拡張から使われていなかったので削除した。`createLayerCanvas` は `hostUi` へ移した |
| F `hostUtils` → `domUtils`・`editorHelpers`・`nodeUtils.layerIsOn` | `applySorting`・`removeCircle`・`confirmationDialog`・`downloadFile`・`getFileName`・`layerIsOn` を `hostUi` へ移した(拡張側の 8 ファイルを更新) |
| `utils/index` → `debugUtils` → `viewLayerService` | バレルからデバッグ描画関数を外した(使っていたのは `draw-state-labels` だけ) |
| `nodeUtils` → `layerState.tsx`(React) | `layerIsOn` を `src/utils/layerUtils.ts` に分けた(50 ファイルの import を更新) |
| `names-generator`・`states-generator` → `domUtils` → `dialogState` | オプションロック(`locked`・`unlock`)を `src/utils/optionLocks.ts` に分けた。`domUtils` からも再エクスポートする |
| G `specializationRuntime` → `characters/ui/charactersUiState` | コマンドに `onChanged` コールバックを渡す形にし、UI の更新は `characters/index.ts` が行う |
| H `urbanWaterSystem`・`epithetCatalog` → `i18n` | 表示用の関数を移した。`formatUrbanWaterSummary` → `economy/ui/urbanWaterSummary.ts`、`formatEpithetLabel` → `characters/utils/characterLabels.ts`、`formatFlavorHook` → `characters/utils/flavorHookLabels.ts` |

追加: `optionsState` が読み込み時に `localStorage` を参照する箇所を、`typeof localStorage` で守ったアクセサ経由にした(ブラウザの挙動は同じ)。

### 14.3 検証

- golden(0・30・365 日)は S1 の前後で一致した。シミュレーション結果は変わっていない。
- `tsc`・`lint:legacy` は通った。vitest は 6,974 件が成功し、失敗 5 件はすべて既知のもの(city-editor 4 件、食料気候の較正 1 件)。
- e2e(burgs・layers・load-map・states・map-context-menu・click-edit)は、変更前の HEAD でも同じ程度(約 26 件)失敗していた。前後で失敗の一覧に差が出た分は、単独で再実行すると変更前と同じ結果になった(並列実行時の揺れ)。`click-edit` は単独で 2 回とも全件成功した。
- Node スモークテストは、まだ import の段階で失敗する。原因は `localStorage` から `generators/navalTechBonus.ts#L28` に移った。モジュール読み込み時の `document.addEventListener` で、S2(イベントバス)の対象。

## 15. S2 の結果(2026-10-16)

### 15.1 イベントバス `simEvents`(`src/simulation/events.ts`)

- `EventTarget` を継承した 1 つのオブジェクトで、DOM と同じ形の API(`dispatchEvent(new CustomEvent(name, { detail }))`、`addEventListener`)を持つ。そのため呼び出し側は `document.` を `simEvents.` に置き換えるだけで済み、イベント名・`detail`(要求/応答型イベントで同期的に書き込まれる可変オブジェクトを含む)・同期配送の意味はすべて変わらない。§6.1 で想定していた型付きの `emit(name, detail)` は採用しなかった。機械的に置き換えられることと、意味が完全に同じであることを優先した。
- ブラウザでは `connectSimulationEventsToDocument()`(`app.ts` の `initApp` の最初、および jsdom の `test-setup.ts`)で双方向に橋渡しする。
  - コアが投げたイベントは、コア内のリスナーの後に `document` へ再送する。既存の UI・拡張入口のリスナーは無改修で動く。
  - コアが購読しているイベント名については、ホスト(生成パイプライン、UI、拡張入口)が `document` に投げたものをコアへ中継する(`fmg:generate-post-core`、`fmg:map-ready-tasks-completed` など)。
  - 中継したイベントは逆方向へは送らないので、ループも二重配送も起きない。
- 置き換えたのは 23 ファイル(本体の generators 6、economy の generators 12、shipbuilding 3、characters 2、`optionLocks`)。

### 15.2 その他の DOM 依存

| 箇所 | 対処 |
| --- | --- |
| `marketFlowDiagnostics.downloadFlowReportCsv`(`<a>` を作ってダウンロード) | `economy/ui/marketFlowReportDownload.ts` へ移した |
| `graphUtils.drawHeights`(canvas でプレビュー画像を作る) | `utils/heightmapImage.ts` へ移し、`utils` のまとめ用ファイルから外した |
| `languageUtils.list`(`document.documentElement.lang`) | `typeof document` で守り、無い時は `"en"` を使う |
| `timeEngine` の `window.fmg?.extensionAPI` と `window.setTimeout` | `typeof window` で守る(S5 で置き換える)/ グローバルの `setTimeout` を使う |

- `lint:sim-boundary` の `document` 検出を DOM のメンバーだけに絞った。これまでは、アーカイブの `WorldDocument` を表すローカル変数 `document` まで数えていた(`worldArchive` 22 件など)。
- コアの `document` は 2 ファイル・4 箇所まで減った。
  - `languageUtils` 1 件は上記のとおり守ってある。
  - `nodeUtils` の 3 件は DOM ヘルパー(`getElementById` など)で、`utils` のまとめ用ファイル経由で到達するだけ。コアからの呼び出しは無いことを確認した。
  - ブラウザ・グローバル全体では、122 箇所(39 ファイル)から 37 箇所(14 ファイル)になった。

### 15.3 検証

- golden は 2 回実行して、2 回とも基準と一致した。イベントの配送順序の変更で結果は変わっていない。
- **Node スモークテストが全段階を通るようになった**。DOM・`window`・`localStorage` が無い Node で、コアを import し、fixture を読み込み、30 日進めて tick が 30 進むことまで確認する(拡張は未登録。S5 で対応)。期待値を `passed` にした。
- `tsc`・`lint:legacy` は通った。vitest は 6,973 件が成功。失敗 6 件は、既知の 5 件と `populationControls.test.ts` 1 件。後者は単独で 2 回実行して 2 回とも成功した(負荷による揺れ)。
- e2e(fast-advance-settings・load-map・click-edit・directions-dialog・economy-dialog-layers・startup-check)の失敗 5 件は、変更前の HEAD でも同じ 5 件だった。

## 16. S3 の結果(2026-10-16)

### 16.1 Ports(`src/simulation/ports.ts`)

- `simulationSettings`(`getItem`・`setItem`・`removeItem`。`localStorage` と同じ契約)
  - 既定の動作: 呼び出しの時点で `localStorage` があればそれを使い、無ければメモリ上の Map を使う。ブラウザでは何も設定しなくても従来と同じに動く。
  - `installSimulationSettings(source)` で差し替えられる。Node ランナーで、JSON から作った `createMemorySettings({...})` を渡す用途を想定。
- `yieldToHost()`(長い分割処理の途中で制御を返す)
  - 既定の動作: `requestAnimationFrame` があればそれ(ブラウザでは従来どおり再描画される)、無ければ `setImmediate`、それも無ければ `setTimeout(0)`。
  - `installSimulationScheduler()` で差し替えられる。
- 置き換えたファイル
  - `localStorage`: 8 ファイル(`caravanMovement`、`tradeLogisticsSettings`、`trade-animation`、`regimentMovement`、`charactersContext`、`optionLocks`、`utils/debug`、`riverPortLab/labOptions`)
  - `requestAnimationFrame`: 2 ファイル(`incrementalBatching`、`production-generator`)
- `lint:sim-boundary` では、`ports.ts`・`events.ts` をブラウザ・グローバルへの正規の入口として数えないようにした。
- 注意: モジュール読み込み時に設定を読む箇所(`utils/debug` の `DEBUG`、`labOptions`)は、その時点の既定ソースから読む。Node ランナーで設定を差し替える場合は、コアを import する前に `installSimulationSettings` を呼ぶ必要がある。

### 16.2 コアに残るブラウザ・グローバル(8 箇所・4 ファイル)

| ファイル | 内容 | 扱い |
| --- | --- | --- |
| `generators/timeEngine.ts` | `window.fmg?.extensionAPI` で nobility が有効か調べる(`typeof window` で保護済み) | S5 で、拡張の有効状態を Host から受け取る形にする |
| `utils/commonUtils.ts` | `openURL`・`wiki` の `window.open`、`parseError` の `navigator`(保護を追加) | `utils` のまとめ用ファイル経由で到達するだけで、コアからは呼ばれない |
| `utils/nodeUtils.ts` | DOM ヘルパー 3 件 | 同上 |
| `utils/languageUtils.ts` | `list()` の言語取得(保護済み) | そのまま |

### 16.3 設定の棚卸し:ワールドと一緒に保存すべきか

ここにある設定は、シミュレーション結果を変えるのに、ワールド(.fmg)ではなくブラウザごとに保存されている。そのため、同じ .fmg と同じ時間軸シードでも、別のブラウザ(や Node)では結果が変わりうる。今回は保存先を変えていない(変えると挙動が変わるので、別の判断が必要)。

| キー | 内容 | 結果への影響 | 推奨 |
| --- | --- | --- | --- |
| `caravan-movement` | 隊商の陸・海・川の速度、海流・風・勾配の効き方 | あり(交易の所要日数) | ワールドに保存 |
| `fmg-grade-effect-strength` | 勾配の効き方(隊商と軍の行軍で共有) | あり | ワールドに保存 |
| `fmg-merchant-route-preference` | 商人の経路の好み(速さ / 安全) | あり | ワールドに保存 |
| `fmg-trade-logistics-settings` | 積載率の目標、最大待機日数、出航日 | あり | ワールドに保存 |
| `allowedRaceKeys` | 人物に許可する種族 | あり(人物生成) | ワールドに保存(生成オプションと同じ扱い) |
| `trade-animation` | 交易アニメーションの表示 | なし | 利用者の好み(現状のまま) |
| `debug` | デバッグ用フラグ | なし(プロファイラなど) | 現状のまま |
| `riverPortLab` | 実験用の生成オプション | 生成のみ | 現状のまま |
| オプションロック(`optionLocks`、`optionsState`) | 生成オプションの固定 | 生成のみ | S4 で `optionsState` と一緒に扱う |

ワールドに保存する方式に変える場合: 読み込み時はワールドの値を優先し、ワールドに値が無い時(古い .fmg)だけブラウザの値を使う。golden の fixture には今のところ値が入っていないので、移行しても結果は変わらない見込み。

### 16.4 検証

- golden は一致した。
- `src/simulation/ports.test.ts` を追加した(既定・差し替え・Storage が無い時のメモリ・スケジューラ)。
- vitest は 6,979 件が成功し、失敗 5 件はすべて既知のもの。
- `tsc`・`lint:legacy` は通った。Node スモークテストも引き続き成功。
- e2e(fast-advance-settings・load-map・startup-check)は 10 件すべて成功した。

## 17. S4 の結果(2026-10-16)

### 17.1 方式:値はコアの vanilla ストア、React のフックは UI 側

- 対象の 7 ストアについて、本体を `zustand/vanilla` の `createStore` で作ったストアとしてコア側へ移した(`git mv` で履歴を保持)。

| 元のファイル(UI 用のフックとして残す) | コアのストア |
| --- | --- |
| `src/store/optionsState.ts`(`useOptionsState`) | `src/state/optionsStore.ts`(`optionsStore`) |
| `src/store/fastAdvanceState.ts` | `src/state/fastAdvanceStore.ts` |
| `src/store/timeSimulationState.ts` | `src/state/timeSimulationStore.ts` |
| `src/store/uiPreferencesState.ts` | `src/state/uiPreferencesStore.ts` |
| `extensions/economy/store/economyCalibrationState.ts` | `extensions/economy/state/economyCalibrationStore.ts` |
| `extensions/economy/store/stateFiscalReportState.ts` | `extensions/economy/state/stateFiscalReportStore.ts` |
| `extensions/characters/store/playerCharacterState.ts` | `extensions/characters/state/playerCharacterStore.ts` |

- 元のファイルには、`export *`(型・既定値・補助関数)と `export const useXState = bindStore(xStore)` だけを残した。`src/store/bindStore.ts` は zustand の `create()` と同じ合成(フックとして呼べ、`getState`・`setState`・`subscribe` も持つ)をする。UI 側の import と使い方は一切変わらない。
- コアのファイル(48 ファイル)とそのテスト(14 ファイル)は `xStore.getState()` を直接使うようにした。拡張向けのまとめ用ファイルは、`hostCore` が `optionsStore`・`fastAdvanceStore` を、`hostUi` が `useOptionsState` を公開する。
- 永続化(`persist`)は `createJSONStorage(() => simulationSettings)` を使うようにした。ブラウザでは従来と同じ `localStorage` の同じキー・同じ形式に保存される。Node ではメモリ上に保持される。
- オプションロックの読み書き(`optionsStore` 内)も `simulationSettings` を経由するようにした。

### 17.2 結果

- 禁止モジュールは 8 から 1 になった。残るのは `src/context/viewContext.ts` のみ(§14.1 のとおり、生成の分離と一緒に扱う)。
- ブラウザ・グローバルは 8 箇所(4 ファイル)のまま。内訳は §16.2 のとおり。

### 17.3 検証

- golden は一致した。Node スモークテストも成功。
- `tsc`・`lint:legacy` は通った。vitest は 6,979 件が成功し、失敗 5 件はすべて既知のもの。
- e2e(fast-advance-settings・options-panel-interactions・load-map・startup-check・tour-prompt・generation-progress)は、並列実行で 8 件失敗した。変更前の HEAD では同じ組み合わせで 10 件失敗しており、変更後の失敗はすべて変更前にも出ていた(load-map は失敗するテストが入れ替わったが、単独で実行すると全件成功)。永続化に関わる fast-advance-settings・load-map は、単独実行で 9 件すべて成功した。

## 18. 結果に影響する設定をワールド(.fmg)に保存する(2026-10-16)

§16.3 で「ワールドに保存」とした 5 項目を、ブラウザではなく .fmg に保存するようにした。

### 18.1 方式

- **`simulation.worldSettings`**(`Record<string, string>`、`src/simulation/worldSettings.ts`)に、次の 4 キーを `localStorage` と同じ文字列形式で持つ。
  - `caravan-movement`(隊商の移動)
  - `fmg-grade-effect-strength`(勾配の効き方。隊商と軍の行軍で共有)
  - `fmg-merchant-route-preference`(商人の経路の好み)
  - `fmg-trade-logistics-settings`(交易物流)
- **人物の許可種族**は、もともと `simulation.extensions.characters.allowedRaceKeys` として .fmg に保存されていた。ただしスライスに値が無い時(fixture を含む既存の地図)はブラウザの値を使っていたので、地図の読み込み時(`fmg:world-loaded`)・生成時(`fmg:generate-post-core`)・最初の参照時に、その時点の値をスライスへ書き込むようにした。
- **値を読む時の優先順位**:
  1. ワールドに `worldSettings` があれば、その値だけを使う。キーが無ければコードの既定値になり、ブラウザは参照しない。そのため同じ .fmg は、どのブラウザでも Node でも同じ設定で動く。
  2. `worldSettings` が無いのは、この項目ができる前に保存された .fmg だけ。読み込み時(`io/load.ts`、.fmg と旧形式の .map の両方)に、ブラウザの現在値を一度だけ取り込む。
- **新しい地図を生成する時**(`initSimulationClock`): ブラウザの現在値から `worldSettings` を作る。
- **設定を変更した時**: ワールドに書き込み、同じ値をブラウザにも保存する。ブラウザの値は「次に新しく作る地図の既定値」という意味になる。
- `CaravanMovement` と `TradeLogisticsSettings` は設定を解析した結果をキャッシュしている。保存されている生の文字列が変わった時(別の地図の読み込みなど)に、解析し直すようにした。
- アーカイブの検証: `worldSettings` は省略可能(古い .fmg)。ある場合は「文字列だけを値に持つレコード」であることを検証する。

### 18.2 検証

- golden: 変わったのは day-0・30・365 のいずれでも `simulation.worldSettings`(`{}` が追加)と `simulation.extensions.characters`(`allowedRaceKeys` が追加)の 2 セクションだけだった。その他のセクションはすべて一致しており、シミュレーション結果は変わっていない。この内容を確認してから基準を更新した(2 回の実行も一致)。
- `src/simulation/worldSettings.test.ts`(4 件)を追加した: 古い .fmg の時だけブラウザの値を使うこと、取り込んだ後はブラウザを変えても影響しないこと、変更がワールドとブラウザの両方に書かれること、別のワールドを読み込むとキャッシュが更新されること。
- `tsc`・`lint:legacy` は通った。vitest は 6,982 件が成功。失敗 6 件のうち 5 件は既知のもの。残る `cityGenerationPerformanceCli.test.ts` は単独で実行すると成功した。
- e2e: load-map・fast-advance-settings は全件成功した。fast-advance-phase3 は既知の 404 のコンソールエラーで失敗する(変更前から同じ)。

## 19. S5 の結果(2026-10-16)

### 19.1 型と Host

- `SimulationExtensionAPI`(`src/types/extension-api.ts`): §7 の一覧どおりのメンバに、`subscribeExtensionState`(有効・無効の切り替えに合わせたデータの初期化・消去に必要)と `events`(`simEvents`)・`settings`・`yieldToHost` を加えた。`ExtensionAPI extends SimulationExtensionAPI` とし、UI のメンバと `viewContext`、`registerSimulationExtension(ext): () => void` は `ExtensionAPI` 側だけに置いた。
- `SimulationExtension { id, requires?, register(api): () => void }`。`requires` は説明用で、登録順は強制しない(下記)。
- `src/simulation/extensionEnablement.ts`: 拡張の有効状態の Port。ブラウザは Extensions タブのストア、Node はメモリ上の集合(`createStaticEnablement`)。`timeEngine` の `window.fmg?.extensionAPI?.isExtensionEnabled("nobility")` を `isSimulationExtensionEnabled("nobility")` に置き換え、コアの `window` 参照が 0 になった。
- `src/simulation/host.ts`: `createSimulationHost({ enablement?, mapReadyTasks?, onMapAnnotationsChanged?, extensions? })`。
  - `api`(シミュレーション部が受け取る API。ブラウザの `ExtensionAPI` はこれを展開して UI のメンバを足す)、`registerExtension`、`loadArchive`(復号・時間軸・§18 の設定取り込み・`world.replace`・`fmg:world-loaded`)、`prepare`(Host が持つ map-ready タスクを依存順に実行)、`advance`(同期)、`startAdvance`(Tools タブの分割実行)、`saveArchive`、`dispatch`、`dispose`。
  - map-ready タスクは、ブラウザでは従来の `mapReadyTaskCoordinator`(進捗表示つき)を Port として渡す。省略時は Host が自前で持ち、`prepare()` で実行する。
  - マーカー作成・更新の後の WebGL 再描画は `onMapAnnotationsChanged` で受け取る。
- `app.ts` は Host を作ってから `window.fmg` を組み立てる。`window.fmg.actions.advanceTime` は `host.advance`、Tools タブの Advance Day/Month/Year(`controllers/tools.ts`)は `host.startAdvance` を通る。`getSimulationHost()` で取得できる。
- `src/extensions/simulation.ts` の `BUILTIN_SIMULATION_EXTENSIONS` に、ブラウザと同じ登録順(economy → characters → nobility → shipbuilding)を固定した。イベントのリスナーは登録順に呼ばれるので、どの Host でもこの順で登録する。`requires` に従って並べ替えると characters が economy より先になり、ブラウザと順序が変わるため、並べ替えはしない。

### 19.2 拡張の分割

各拡張に `simulation.ts` を作り、`index.ts(x)` は `api.registerExtension(...)` の直後に `api.registerSimulationExtension(xSimulation)` を呼んでから UI を登録する。シミュレーション部はイベントを `api.events`(`simEvents`)で購読・送信するので、`document` を使わない。

| 拡張 | `simulation.ts` に移したもの | UI 側に残したもの / 新しい連絡方法 |
| --- | --- | --- |
| characters | コマンド 6 件と専門技能のコマンド、専門技能のシステム、スキル補正、無効化時の `clear` | ダイアログ・アクション。専門技能の変更は `fmg:characters-specializations-changed` で UI が再描画 |
| nobility | `regenerate` コマンド、map-ready タスク、tick 7 段、航海諜報・紛争イベント | 人物一覧の再描画は `fmg:nobility-court-changed`。プレイヤーの焦点人物の選択(`playerCharacterFocus.ts`)と移動の日数経過(`playerTravel.ts`)は `controllers/` から出してコア側に置いた(`controllers/` からは再エクスポート)。通知は `simulationView.tip` |
| shipbuilding | 造船所の状態、tick、Economy/Nobility との要求・応答イベントの購読 8 件、`reset`、map-ready タスク | レイヤ・一覧ダイアログ。`fmg:shipbuilding-changed`(`redrawShipyards` 付き)で再描画 |
| economy | コマンド 32 件、tick 13 段 + 市場領域、map-ready タスク、月次決算のスケジューラ、読み込み時の移行、イベントの購読 20 件 | レイヤ・ダイアログ・ツールチップ・Balance History。商品の再描画は `fmg:economy-goods-changed`、準備完了(Balance History の初回行・WebGL 再描画・商品選択のリセット)は `fmg:economy-initialized` |

- 拡張の文脈モジュール(`economyApi`・`nobilityContext`・`shipbuildingContext`・`charactersContext`)の `getApi()` は `SimulationExtensionAPI` を返すようにした。型を変えたことで、UI のメンバを `getApi()` 経由で使っていた 17 ファイル・約 60 箇所が見つかった(レンダラ・コントローラ・ダイアログ)。これらは UI 入口が束縛する `getViewApi()` を使うようにした。ジェネレータで唯一該当した `greatLibrary` の WebGL 再描画は、UI がある時だけ呼ぶ(`getOptionalViewApi()`)。
- economy の `registerMapReinitHook` は、SVG のクリック処理の再設定(UI)と、読み込んだデータの移行(税率の補完・造幣台帳の生成など)が混ざっていた。後者は `fmg:map-layers-reinitialized` の購読としてシミュレーション部へ移した。

### 19.3 境界

- `lint:sim-boundary` のエントリは「各拡張の `simulation.ts` + generators(暫定エントリ)」にした。`simulation.ts` が無い拡張はエラーにする。
- 結果: コアは 704 モジュール。禁止モジュールは `viewContext` の 1 件のまま(新しい違反 0)。ブラウザ・グローバルは 8 箇所から 7 箇所(3 ファイル)になった(`timeEngine` の `window` を解消)。残りは §16.2 のとおり、まとめ用ファイル経由で到達するだけの `utils`。

### 19.4 検証

- golden(0・30・365 日)は 2 回実行して 2 回とも基準と一致した。イベントの購読先を `document` から `simEvents` に移したこと、登録順の変更(`registerExtension` を先に呼ぶ)で結果は変わっていない。
- Node スモークテストに 2 件目を追加した: DOM の無い Node で `createSimulationHost({ extensions: BUILTIN_SIMULATION_EXTENSIONS })` → `loadArchive`(fixture)→ `advance({ days: 30 })` → 月次決算のマイクロタスクまで実行。**全拡張を有効にして通る**。
- `tsc`・`npm run lint`(`lint:legacy` を含む)は通った。
- vitest: 失敗は既知の 5 件(city-editor 4・食料気候の較正 1)と、単独では成功する `cityGenerationPerformanceCli` だけ。拡張の文脈を直接初期化していたテスト(economy のレンダラ 6 ファイル、`fleetDiscrepancy`)は `bindEconomyView` / `shipbuildingSimulation.register` を使うように直した。
- e2e(economy-dialog-layers・load-map・fast-advance-settings・fast-advance-phase3・startup-check・generation-progress・burg-editor-dialog-position): 失敗した 9 件は、変更前の HEAD(worktree)でも同じ 9 件が同じ理由で失敗した(Goods ダイアログのチェックボックスのタイムアウト、既知の 404、`Failed to acquire …` のコンソールエラーなど)。

### 19.5 `dispose()` とモジュールキャッシュ

`dispose()` は登録したシミュレーション部を逆順に解除する(コマンド・システム・購読・map-ready タスク・イベントリスナー、各拡張の文脈と `clear*` 関数)。ただし、コアにはこれ以外にもモジュールレベルの状態がある。コアの到達集合 704 モジュールを走査した結果は次のとおり(モジュールレベルの `let` と `new Map/Set`・空配列の `const`)。

- 103 ファイル・238 個。拡張 economy 124、`src/generators` 41、characters 21、`src/services` 18、`src/runtime` 12、その他。
- `clear*`/`reset*` を公開しているのは 35 ファイル。economy の 124 個の大半は `clearEconomyContext()`(`_fallbackResets`)と `clear` コマンドで消える。
- **解除手段の無い、結果に影響しうる状態**(S6 で Node から地図を読み直す前に扱う):
  - ~~`generators/timeEngine.ts` の蓄積値~~ → §19.6 で対応済み。
  - economy の月次決算の位相(`daysSinceLastProduction`・`currentQuarterIndex`・`daysSinceLastProspecting`・`hiringDaysAccumulated`)。S5 で `register()` の中の変数になったので、登録し直せば 0 に戻る。ただしブラウザでは、セッション中に別の地図を読み込んでも引き継がれる。.fmg に保存されていないので、**同じ .fmg でも、そのセッションで以前に何日進めたかによって次の月次決算の日がずれる**。ブラウザと Node の結果を一致させるには、これらをワールドに保存するか、読み込み時に 0 に戻す必要がある(結果が変わるので、分離とは別の PR にする)。
  - 気候・河川・陸路の計算キャッシュ(`cellClimateNormals`・`seasonalCropClimate`・`riverPhysicalGeometry`・`regionalRiverGeometry`・`worldLandConnectionRuntime` など)。入力から決まる派生値なので結果には影響しないはずだが、地図が変わった時に無効化されるかは個別に確かめる。

### 19.6 timeEngine の積算値をワールドに保存(2026-10-16)

- `manpower.tick` は 7 日ごとに実行される(早送り中は粗い間隔)。まだ実行していない日数 `manpowerDaysAccumulated` はモジュール変数だったため、.fmg に保存されず、セッション中に別の地図を読み込んでも前の値が残った。これを `simulation.manpowerDaysAccumulated`(省略可。省略時は 0)に移した。
  - 新しい地図の生成時(`initSimulationClock`)は 0 にする。アーカイブの検証では、ある場合は 0 以上の有限数であることを確認する。
  - 日のロールバックはシミュレーションのスナップショットに含まれるので、失敗した日の積算も一緒に戻るようになった。
- `fastAdvancePopulationDaysAccumulated` は保存しない。早送りの日バッチの中だけで使い、バッチの終わり(成功時は残りを適用、失敗時は破棄)に必ず 0 に戻るため、保存の時点では常に 0 になる。
- golden: day-0 は一致。day-30・day-365 では `simulation.manpowerDaysAccumulated`(新しいフィールド)だけが異なり、その他のセクションはすべて一致したことを確認してから基準を更新した(2 回の実行も一致)。
- Node スモークテストで、30 日 + 2 日進めた後(週の途中)に保存・再読み込みして、値が戻ることを確認する。
- economy の月次決算の位相(`daysSinceLastProduction` など)は未対応。


## 20. S6 の結果(2026-10-16)

### 20.1 追加したもの

- **Node Adapter**(`src/simulation/adapters/node.ts`): `createNodeSimulationHost({ extensions?, settings? })` は、設定をメモリ上に置き(`settings` は localStorage と同じキーの JSON)、長い処理の譲りを `setImmediate` にして、組み込みのシミュレーション部をブラウザと同じ順で登録する。`loadWorld`(読み込み + ブラウザの読み込みと同じ map-ready タスク)、`advanceWorld`(進めた後に economy の月次決算のマイクロタスクまで待つ)、`runGoldenCheckpoints` を持つ。
- **CLI**(`scripts/sim.mts`、`npm run sim -- <map.fmg> [--days N] [--months N] [--years N] [--out world.fmg] [--extensions …] [--timeline continue|new] [--settings settings.json] [--hash]`)。計画では `scripts/sim.ts` としていたが、トップレベルの `await` を使うため `.mts` にした(`simGolden.mts` と同じ)。fixture を 1 年(366 日)進めて約 8.5 秒。
- **golden の環境別実行**: `npm run test:sim-golden -- --env browser|node|all`。Node は 1 回ごとに子プロセスで実行する(`scripts/lib/simGoldenNodeRun.mts`。ブラウザの 1 回ごとの新しいページに相当。理由は §20.4)。基準は `__golden__/browser.json` と `__golden__/node.json` の 2 つ。`--env all` はブラウザと Node の違うセクションを表示する。Node でも Track R のガード(シミュレーション乱数を通らない `Math.random`)を掛け、0 件だった。
- **vitest**: `goldenParity.node.test.ts`(DOM なし)と `goldenParity.jsdom.test.ts`(jsdom の `document`・`localStorage`・`requestAnimationFrame` を入れ、イベントを `document` に橋渡しした状態)。どちらも 0・30・365 日で `node.json` と**ビット単位で一致**する。jsdom は vitest の `environment: "jsdom"` ではなく手で組み込んだ。その環境は `ArrayBuffer`・型付き配列を jsdom 側のものに差し替える一方で `structuredClone` は Node のままなので、アーカイブの型付き列の検査(`instanceof Uint16Array`)が落ちるため(ブラウザは 1 つの realm)。
- `nodeSmoke.test.ts` は S2・S5 の時点で通常のテストになっている。

### 20.2 Node とブラウザで結果が分かれていた原因(修正済み)

1. **読み込み後の処理が UI 層にあった**: `io/load.ts` は `world.replace` の後に、河川の水文の補完・水場アクセスの更新・重複した河川セルの修復・道路の再生成・オプション(距離単位など)の反映・陸路リンクの再構築・人物の種族の移行を行っていた。これを `src/simulation/loadedWorld.ts` の `normalizeLoadedWorld` に移し、ブラウザの読み込みと `host.loadArchive` の両方から呼ぶ(表示の調整 `resizeGraphRects`・`fitMapToScreen`・`fitScopedMapToView` は、元と同じ位置で呼ぶコールバックとして渡す)。`Routes.generate` の `viewContext` 引数は使われていなかったので省略可能にした。
2. **港の修復タスクがコアの外にあった**: `dualPortPlacementTask` はモジュールの読み込み時にブラウザの coordinator に直接登録され、ツールチップと i18n を使っていた。タスクを `dualPortPlacementTask` として公開し、各 Host が作成時に登録し、`loadArchive` の後に要求するようにした。通知は `fmg:waterfront-check-failed`(`{ count }`)を送り、ブラウザの `main.ts` が翻訳して表示する。`host.prepare()` は既定で「要求されたタスク」だけを実行する(ブラウザの読み込みと同じ)。`{ all: true }` で全タスク(生成後と同じ)。終わったら `fmg:map-ready-tasks-completed` を送る(frontier の予算のスナップショットが購読している)。
3. **UI が読み込み時にワールドを書き換えていた**: economy の UI 部の `fmg:world-loaded`(Balance History の初回行)が `getAllStockData()` → `reconcileRetailInventory()` を呼び、在庫の配置をワールドに書いていた。シミュレーション部の `fmg:world-loaded` の最後でも `reconcileRetailInventory()` を呼ぶようにした(ブラウザでは 2 回目が冪等なので結果は変わらない。ブラウザの golden は一致)。
4. **`typeof document` による分岐**: economy の 6 ファイルと `funeralRites` の計 8 か所が、`document` が無いとシミュレーションのイベント(葬儀の資材需要、戦時体制・債務不履行・クーデター・正統性戦争・同盟の緊張)を送らずに return していた(S2 で `document.dispatchEvent` を `simEvents` に置き換えた時の残り)。Node では Economy に葬儀の需要が届かず、30 日で 5,000 以上の値が jsdom とずれた。分岐を削除した。`lint:sim-boundary` に `typeof window|document|navigator|localStorage|sessionStorage|requestAnimationFrame` の検出を追加し、残る 2 件(まとめ用ファイル経由で到達するだけの `commonUtils`・`languageUtils`)を許可リストに記録した。`dualPortPlacementTask` の `requestAnimationFrame` は `yieldToHost()` 2 回にした。
5. その他: `import.meta.env.DEV` は vite 以外では `undefined` なので `import.meta.env?.DEV` にした(4 か所。開発時の警告と不変条件の検査だけ)。`yieldToEventLoop` は Node では `setImmediate` を使う(`MessagePort` は参照を保持し、CLI のプロセスが終わらなかった)。`host.saveArchive` はブラウザの保存と同じく地図名をワールドに書く。`connectSimulationEventsToDocument` は、橋渡し先の `document` の realm の `CustomEvent` を使う(ブラウザでは同じもの)。

ブラウザの golden(`browser.json`)は、以上の変更の後も 0・30・365 日で一致した。

### 20.3 ブラウザと Node のハッシュは一致しない(数学関数の差)

- Chromium 151(V8 15.1)と Node 22(V8 12.4)では、`Math.exp`・`Math.sin`・`Math.log`・`Math.pow` などが最後の 1 ビットで異なる値を返す。同じ 20,000 個の入力で `exp` は 1,981 個、`sin` は 637 個、`log` は 1,181 個、`pow` は 1,505 個が違った。Node 25(V8 14.1)でも `pow` 以外は違った。V8 の版ごとに実装が変わっているので、Node の版を合わせても一致は保証されない。
- この fixture では、読み込み時の港の修復で burg 58 の `y` が `278.9518546109381` と `278.95185461093797` に分かれる。ここから、その町を通る隊商の経路の距離、到着日、出荷の割り当てへと差が広がる。
- 実測(`--env all`): day-0 は `world.pack.burgs` の 13 値だけ。day-30・day-365 は `world.pack.burgs` と `simulation.extensions.economy` の 2 セクションだけが違い(2,336 値・47,676 値)、乱数のストリーム・国家・人口・人物・軍事など他のセクションはすべて一致した。
- この時点では §9 の完了条件「3 環境のハッシュが一致する」を満たしていなかった。→ §21 で超越関数を置き換えて満たした。

### 20.4 同じプロセスで地図を読み直すと結果が変わる

- Node の golden を同じプロセスで 2 回実行すると、2 回目の day-30 が `simulation.extensions.economy` と `simulation.rng` で異なった(雇用・討伐・護衛の日数)。§19.5 で挙げたモジュールの位相(`constructionHire.daysSinceGlobalHireRound`・`escortHire`/`threatCullHire` の `daysSinceAnonRound`・`escortJobPostings`/`threatCullJobPostings` の `daysSinceBoardRefresh`・`marketFlowDiagnostics._nextCycleIndex`)が `dispose()` で戻らないため。これらの `clear*` は保存対象のデータ(掲示板など)も消すので、読み込み時に呼べない。
- ブラウザでも、同じタブで別の地図を読み込むと同じことが起きる。→ §22 で位相をワールドに保存して修正した。

## 21. 決定的な数学関数(2026-10-16)

### 21.1 方式

- `src/simulation/deterministicMath.ts`: `@stdlib/math-base-special-*`(FreeBSD msun / fdlibm の移植。`+ - * /` と `Math.sqrt` だけで計算するので、どのエンジンでも同じ double になる)の 17 関数(`sin`・`cos`・`tan`・`asin`・`acos`・`atan`・`atan2`・`exp`・`expm1`・`log`・`log1p`・`log2`・`log10`・`pow`・`asinh`・`cbrt`・`hypot`)。バージョンは固定(`--save-exact`)。依存として @stdlib の小さなパッケージが約 180 個入る。
- `createSimulationHost` が最初に `installDeterministicMath()` で `Math.*` を置き換える(呼び出し箇所は書き換えない。トラック R の `Math.random` と同じ考え方)。ブラウザでは Host の作成以降、描画や生成も同じ関数を使う。
- `pow` は ECMAScript の特殊値の規則(`pow(NaN, 0) === 1`、`pow(1, Infinity)` は NaN、負の底など)を先に処理し、stdlib には有限で正の底と有限の指数だけを渡す(stdlib の pow は C の規則なので、そのままでは `Math.pow` と特殊値が違う)。`hypot` は 2 引数の kernel を可変長に広げた。
- `**` 演算子は置き換えられないので、コアの 40 ファイル・73 か所を `pow()` の呼び出しに変えた(TypeScript の AST による機械的な置換)。`lint:sim-boundary` はコアで `**` を禁止する(`powOperator`)。
- モジュールの読み込み時に `Math.sin` などを変数に取っておくコードは、コアには無い(d3-shape は円弧用に取っておくが、コアは円弧を使わない)。

### 21.2 もう 1 つの UI 依存(修正済み)

- 数学関数をそろえた後も、30 日目から `simulation.extensions.economy` の出荷(`marketShipments`)と在庫の配置だけがブラウザと Node で違った。原因は §20.2 の 3 と同じ: Advance Time の後に economy の UI 部が Balance History の行を作る時(`fmg:time-advance-completed`)、`reconcileRetailInventory()` を呼んでいた。シミュレーション部も同じイベントで先に呼ぶようにした。

### 21.3 検証

- 17 関数 × 5 万個の入力で、Node 22・Node 25・Chromium 151 の結果がすべて一致した。特殊値は `Math` と同じ値、通常の入力では `Math` との差が 2 ulp 以内(`deterministicMath.test.ts`)。
- golden: `--env all --runs 2` で、ブラウザ・Node とも 2 回の実行が一致し、**ブラウザと Node の 0・30・365 日のハッシュが一致した**。`browser.json` と `node.json` を更新した(数学関数の変更で結果が変わるため。2 つの中身は同じ)。`--env all` は、ブラウザと Node が違えば失敗する。jsdom・Node の vitest(`goldenParity.*.test.ts`)も一致。
- 速度: ブラウザの 30 日が 1.70 → 1.85 秒、残り 335 日が 2.43 → 2.47 秒。Chromium の 300 万回の呼び出しで、`sin` が 14 → 45 ms、`pow` が 29 → 119 ms、`exp` が 21 → 39 ms、`atan2`・`hypot`・`log` はほぼ同じ。
- `tsc`・`npm run lint` は通った。vitest の失敗は既知の 2 件(city-editor の Paris、食料気候の較正)だけ。e2e(load-map・startup-check・fast-advance-settings)は 10 件すべて成功した。

## 22. economy の周期の位相をワールドに保存(2026-10-16)

### 22.1 方式

- `src/extensions/economy/context/cadencePhases.ts`: economy のスライスに `cadencePhases`(キー → 0 以上の有限数)を持たせ、`getCadencePhase` / `setCadencePhase` で読み書きする。`annualGateYears`(年次の関門)と同じ置き方。キーが無ければ 0 として読む。これまでの保存データは、新しいセッションで読み込んだ時と同じく 0 から始まる。
- 対象(10 個):
  - モジュール変数だったもの: `constructionHireRoundDays`(`constructionHire`)、`cullAnonRoundDays`(`threatCullHire`)、`cullBoardRefreshDays`(`threatCullJobPostings`)、`escortAnonRoundDays`(`escortHire`)、`escortBoardRefreshDays`(`escortJobPostings`)、`flowCycleIndex`(`marketFlowDiagnostics`)。
  - `register()` の中の変数だったもの: `productionDays`(30 日の生産・決算の月の経過日数)、`prospectingDays`(年 1 回の探査)、`fastAdvanceHiringDays`(早送り中の雇用の粗い関門)。
  - 予約として `quarterIndex` も定義した。元の `currentQuarterIndex` は書き込むだけで、どこからも読まれていなかったので、移していない。
- 各 `clear*` は、変数を 0 にする代わりに位相を 0 にする。読むだけではスライスに `cadencePhases` を作らない(進めていない世界は、保存しても内容が変わらない)。
- 決算の予約(`productionDirty`・`productionSettlementsDue`・`foodSettlementsAlreadyApplied` など)は、進めた直後のマイクロタスクで必ず 0 に戻るので、保存しない。
- アーカイブの検証: `cadencePhases` がある場合は、レコードで、値がすべて 0 以上の有限数であることを確認する。
- 新しく生成した地図は新しいスライスから始まるので、位相は 0 になる。これまでは、同じセッションで前の地図の位相が残っていた。

### 22.2 検証

- 同じプロセスで fixture を 2 回読み込んで 37 日進めると、2 回の結果が一致する(`reloadReproducibility.node.test.ts`)。17 日進めて保存・再読み込みすると、位相が元の値に戻る(`productionDays` は 17)。
- golden: 0 日目は一致。30 日目と 365 日目は、`simulation.extensions.economy.cadencePhases`(新しいフィールド)の 1 値だけが変わり、他はすべて一致した。そのうえで `browser.json`・`node.json` を更新した(`--runs 2` でも一致。ブラウザと Node も一致)。
- 範囲外の観察: 17 日進めて保存・再読み込みしてから 30 日進めた結果は、続けて 47 日進めた結果と一致しなかった(`world.pack.burgs`・`world.pack.routes`・economy)。原因は、読み込むたびに道路の再生成と港の修復を行う読み込みの設計で、位相とは別の問題。→ §23 で修正した。
- `tsc`・`npm run lint` は通った。vitest の失敗は既知の 2 件だけ。e2e の load-map・startup-check は成功。fast-advance-settings の History mode のテストは 8 回中 2 回、Advance Time ダイアログのチェックボックスを待つところでタイムアウトした(その後の 5 回は連続で成功。変更前の HEAD では 3 回とも成功)。

## 23. 読み込み時の修復を版数で一度だけにする(2026-10-17)

### 23.1 方式

- `src/simulation/loadRepairs.ts`: 繰り返すと結果が変わる読み込み時の修復ごとに版数を持つ。ワールドは、適用済みの版数を `world.options.loadRepairs`(id → 版数)に記録する。読み込み時には、保存された版数がコードの版数より古い修復だけを実行し、実行したら記録を更新する。
  - `routes`(版 1): `normalizeLoadedWorld` の道路の再生成。`Routes.generate` を通ると、生成時でも記録する(生成した道路は最新の手順で作られているため)。
  - `dualPortPlacement`(版 1): 港の修復タスク。最後まで実行した時(途中で中断しなかった時)だけ記録する。版数が最新なら、ブラウザの読み込みも `host.loadArchive` もタスクを要求しない。
  - `economy.developmentPotential`(版 1): economy の `fmg:world-loaded` で毎回実行していた `DevelopmentPotential.generate()`(農業・労働の列の作り直し)。`generate()` を通ると記録する。商品カタログの移行があった時は、版数に関係なく実行する。拡張は `isRepairAtVersion` / `markRepairAtVersion` に自分の id と版数を渡す。
- **修復の手順を変えたら、その版数を上げる**。上げれば、既存の保存データにも次の読み込みで一度だけ適用される。
- 繰り返しても結果が変わらない処理(水文・水場アクセスの更新、重複した河川セルの修復、オプションの反映、種族の移行、economy の `Goods.sync` など)は、これまでどおり毎回実行する。economy の `fmg:world-loaded` の各手順を 1 つずつ有効にして読み込み前後のハッシュを比べ、結果を変えるのは `DevelopmentPotential.generate()` と在庫の配置(下記)の 2 つだけであることを確かめた。
- 記録の無い保存データ(これまでのすべて)は、最初の読み込みでこれまでと同じく修復される。

### 23.2 在庫の配置: UI がワールドを変えないようにした

- §20.2 の 3 と §21.2 では、UI(Balance History)が `getAllStockData()` → `reconcileRetailInventory()` で在庫の配置を書き換えるのに合わせて、シミュレーション部でも読み込み時と Advance Time の後に同じ処理を呼んでいた。しかし、読み込むたびに配置を作り直すと、保存・再読み込みをはさんだ継続が一致しない。
- 根本の原因である UI 側の書き込みをやめた: `getAllStockData()` は読むだけにし、今の配置をそのまま集計する。シミュレーション部の 2 つの呼び出しは削除した。在庫の配置は、シミュレーション自身の月次の計画と日々の処理だけが変える。
- これでブラウザの結果が変わる(UI が配置を作り直さなくなるため)ので、golden を更新した。

### 23.3 検証

- **保存・再読み込みをはさんだ継続**: fixture を 17 日進めて保存し、読み込んで 30 日進めた結果が、続けて 47 日進めた結果と一致した。Node(`reloadReproducibility.node.test.ts` に追加)でもブラウザ(Playwright で 3 つの別ページ)でも一致し、ブラウザと Node の結果も互いに一致した。
- golden: `world.options`(新しい `loadRepairs`)と `simulation.extensions.economy`(在庫の配置)が変わった。`--env all --runs 2` で 2 回の実行とブラウザ・Node が一致し、`browser.json`・`node.json` を更新した。
- `tsc`・`npm run lint` は通った。vitest の失敗は既知の 3 件(city-editor 2・食料気候の較正 1)。e2e の load-map・startup-check は 3 回とも成功した。
- fast-advance-settings の History mode のテストは断続的に失敗していた(Advance Time ダイアログが開かず、チェックボックスを待ってタイムアウトする)。原因はアプリ側の競合で、§23.4 で修正した。

### 23.4 生成直後にツールのボタンが一瞬押せる(修正済み)

- `startMapReadyTasks` は、描画を待つ 2 フレーム(`nextPaint`)の**後**に map-ready の進捗状態を「実行中」にしていた。そのため、生成が終わってから最初のタスクが始まるまでの間、Sticked の Advance Time などのボタン(`disabled={生成中 || map-ready 実行中}`)が一瞬押せるようになり、すぐにまた押せなくなっていた。
- Playwright は「押せる」ことを確かめてからクリックするが、その直後にボタンが押せなくなると、クリックは捨てられる。テストはこの瞬間に当たるとダイアログが開かず失敗していた。利用者が同じ瞬間に押しても同じことが起きる。
- `useMapReadyTaskState.start()` を描画待ちの前に移し、生成の終わりから map-ready の完了まで、ボタンが押せない状態を途切れさせないようにした。
- 確認: 修正を外すと 4 回中 1 回失敗し(その前の計測では 4 回中 3 回)、修正後は 12 回連続で成功した。`mapReadyTaskCoordinator.test.ts` も成功。generation-progress の失敗 2 件(World Configurator の preset、拡張の有効状態の再読み込み)は、変更前の HEAD でも同じように失敗する。もう 1 件(再読み込み後の拡張一覧)は、他の e2e と並行して実行した時に 1 回だけ失敗し、単独では 4 回とも成功した。
