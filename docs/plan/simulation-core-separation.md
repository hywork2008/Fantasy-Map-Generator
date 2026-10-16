# シミュレーション・コア分離 設計・計画

## 状態

- 2026-10-16 設計・計画。**S0 完了**(§12)。S1 以降は未着手。
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
5. 再現性を壊す要因(`Math.random` の直接使用 164 箇所、壁時計への依存)はハッシュが揺れる原因になる。S0 で 2 回連続実行して確認した結果、**揺れた**(§12.2)。原因は、地図を読み込んでも `Math.random` が再シードされないこと。golden では暫定的に `Math.random` を固定シードの PRNG に差し替えて一致させている。恒久対策(シミュレーションの乱数を `simulationRng` のストリームへ移す)は S1〜S4 と並行する別トラック R として扱う(§12.4)。

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

- **トラック R(乱数の一本化)を追加する**: `Math.random` を直接使っている 164 箇所を `simulationRng` のストリームへ移す。この作業はシミュレーション結果を変えるので、分離リファクタ(S1〜S6)の PR には混ぜず、独立した PR で golden の基準を更新する。R が終わるまでは、golden の `pinAmbientRandom` を残す。
- **Node スモークテストの段階を早く進めるため**: `optionsState` の `localStorage` 参照(モジュール読み込み時)は、S4 を待たずに S1 で「遅延読み込み」に変えることを検討する。ブラウザの挙動は変わらない。
- 拡張のシステムは各拡張の `init(api)` から登録されるため、Node スモークテストの「進行」段階は、S5 で拡張のシミュレーション入口ができるまで、本体のシステムだけで回すことになる。
