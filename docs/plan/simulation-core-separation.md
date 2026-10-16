# シミュレーション・コア分離 設計・計画

## 状態

- 2026-10-16 設計・計画。**S0 完了**(§12)、**トラック R 完了**(§13)、**S1 完了**(§14)、**S2 完了**(§15)、**S3 完了**(§16)、**S4 完了**(§17)。S5 以降は未着手。
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
| **S5 拡張の分割と Host** | `SimulationExtensionAPI` / `SimulationExtension`、4 拡張の `simulation.ts`、`createSimulationHost`、`app.ts` を Host 経由に切り替え、`dispose()` 用のモジュールキャッシュ一覧 | `types/extension-api.ts`、`extensions/*/simulation.ts`、`extensions/*/index.ts(x)`、`src/simulation/host.ts`、`app.ts` | ブラウザの Advance Time が Host 経由で動く。`lint:sim-boundary` のエントリに 4 つの `simulation.ts` を追加しても違反 0 |
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
- Node スモークテストは import の段階で失敗する。原因は `localStorage is not defined`(`store/optionsState.ts:646`、モジュール読み込み時の参照)。これは S4(ストアの分割)の対象で、§10 の「モジュール読み込み時の副作用」のリスクが実際に現れたもの。

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
- Node スモークテストは、まだ import の段階で失敗する。原因は `localStorage` から `generators/navalTechBonus.ts:28` に移った。モジュール読み込み時の `document.addEventListener` で、S2(イベントバス)の対象。

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
