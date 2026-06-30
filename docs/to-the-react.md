# レガシーDOM操作が残存しているコントローラーファイル一覧

`namesbase-editor.ts` と同様に、`src/controllers/` 配下で `document.getElementById` や `.addEventListener` といった命令的なDOM操作が行われており、純粋なReactコンポーネント（または純粋なロジック層）に移行しきれていないファイルの改修を進める。

## リファクタリングのアプローチ（AGENTS.md準拠）

これらのファイルを改修する際は、以下のステップを踏むことが推奨されます。

1. **State管理の分離**: 
   React側で管理すべきUIの状態（開閉状態、入力値、選択中のインデックス等）を `useState` や Zustand のストア（例: `src/store/...`）に移行する。
2. **DOM操作の排除**: 
   `document.getElementById` などの命令的クエリを削除し、Reactのコンポーネント（例: `src/ui/dialogs/...`）が宣言的に描画するように書き換える。
3. **ロジックの純粋化**: 
   `src/controllers/...` 内の関数は、引数としてデータを受け取り、DOMに依存せずデータを加工・更新する純粋な関数（あるいは `worldContext` を直接変更するピュアなミューテーター）として再定義する。

## 二周目洗い出し結果（2026-06-29 スキャン）

以下は `src/` フォルダ全体を再スキャンして特定した残存レガシーパターン一覧。
パターン分類は次の通り:
- **A**: jQuery / jQuery UI 残存
- **B**: 命令的DOM操作（`document.getElementById` / `.innerHTML` / `document.createElement` 等）
- **C**: `window.*` グローバル汚染（`window.fmg` および標準WebAPI `window.URL` 等を除く）
- **D**: 命令的スタイル操作（`.style.*` / `.classList.*`）
- **E**: Renderer 層外での `d3.select`

難易度凡例: **低**=単純な置き換え、**中**=ロジック分離が必要、**高**=アーキテクチャ変更が必要

---

### 高難度ファイル（優先度: 高）

| ファイル | パターン | 難易度 | 概要 |
| :--- | :---: | :---: | :--- |
| `src/io/auto-update.ts` | B D E | 高 | SVG更新ロジックが命令的DOM操作に大量依存。`d3.select`・`.innerHTML`・`.style.display` が全体にわたり散在。Renderer 層への統合が必要 |
| `src/extensions/economy/controllers/goods-distribution-editor.ts` | B D | 高 | 210〜527行で大量の `document.createElement` + `.addEventListener` + `innerHTML`。React コンポーネント化が必須 |
| `src/extensions/economy/controllers/goods-editor.ts` | B D | 高 | DOM取得・classList操作が多数。Economy拡張のReact化と合わせて対応 |
| `src/extensions/economy/controllers/markets-overview.ts` | B D | 高 | DOM取得・classList・innerHTML が133〜319行に多数 |
| `src/ui/dialogs/useDraggable.ts` | B D | 高 | ドラッグ実装が `.style.*` 直接操作に全面依存（30箇所以上）。CSS transform + React Hooks への移行が必要 |
| `src/utils/uiHelpers.ts` | B C D E | 高 | tooltip・cellInfo の DOM操作に加え、`window.burgsOverview` / `window.zonesEditor` 等のダイアログをグローバル参照。Zustand ダイアログ状態管理への統合が必要 |
| `src/controllers/layers.ts` | E | 高 | `d3.select("#lakes").style(...)` 等、レイヤー表示トグルを `d3.select` で命令的に実行（約15箇所）。Zustand レイヤー状態 + CSS クラス切り替えに移行 |

---

### 中難度ファイル（優先度: 中）

| ファイル | パターン | 難易度 | 概要 |
| :--- | :---: | :---: | :--- |
| `src/main.ts` | B C D E | 中 | 初期化処理に多数の DOM 操作が混在（コンテナサイズ変換・mapOverlay スタイル・`d3.select("#map")` 等）。初期化フロー全体の整理が必要 |
| `src/io/load.ts` | B D | 中 | Dropbox 連携UI・COA クリア (`innerHTML = ""`)・マーカー要素 `querySelectorAll` 等。React Dialog に統合推奨 |
| `src/io/export.ts` | B C D E | 中 | `document.createElement("a")` / `("canvas")` による一時要素生成、`window.URL.createObjectURL` など。ユーティリティ関数として隔離 |
| `src/controllers/editors.ts` | E | 中 | `d3.selectAll("g#defs-hatching > pattern")` 等のRenderers外D3操作・カラーピッカー要素取得 |
| `src/controllers/states-editor.ts` | C E | 中 | `window.openPicker(...)` グローバル依存・COA 要素への `d3.select`（514/634/644/1112行） |
| `src/controllers/provinces-editor.ts` | E | 中 | COA 要素への `d3.select`（275/436/886行） |
| `src/controllers/cultures-editor.ts` | C E | 中 | `window.TouchEvent` 判定・`d3.select` COA 操作 |
| `src/extensions/economy/controllers/market-overview.ts` | B | 中 | DOM操作・innerHTML 設定（29〜113行） |
| `src/extensions/economy/controllers/market-deals-overview.ts` | B | 中 | DOM取得・addEventListener（24〜85行） |
| `src/extensions/economy/tooltipHandler.ts` | B E | 中 | `d3.select(burgEl).raise()` + 複数 `document.getElementById`。Zustand tooltip 状態管理に移行推奨 |
| `src/ui/dialogs/HierarchyTreeDialog.tsx` | C E | 中 | `window.d3` 参照・React コンポーネント内の `d3.select` DOM 操作 |
| `src/ui/dialogs/ElevationProfileDialog.tsx` | B C | 中 | SVGキャンバスへの `document.createElement`・`window.innerWidth` 参照 |
| `src/ui/dialogs/ProvincesChartDialog.tsx` | B D | 中 | D3チャート + `innerHTML` 混在（93/127/155〜166/172行） |
| `src/ui/dialogs/StatesChartDialog.tsx` | B D | 中 | D3チャート + `textContent` 混在（57/98〜102/123行） |
| `src/ui/dialogs/BurgsBubbleChartDialog.tsx` | B D | 中 | D3チャート + `.style` / `textContent` 混在（125/151/155/162/171行） |
| `src/ui/dialogs/WorldConfiguratorDialog.tsx` | B | 中 | DOM 取得ユーティリティ + 複数の `.innerText =` 操作（34/41/48行等） |
| `src/controllers/regiment-editor.ts` | C | 中 | `window.innerWidth/Height` をD3配置計算に直接使用（516〜517行） |
| `src/utils/commonUtils.ts` | B C D | 中 | `prompt` ダイアログの DOM 操作（283〜341行）・`window.open()`・`window.ERROR` デバッグフラグ |

---

### 低難度ファイル（優先度: 低 / まとめて対応可）

| ファイル | パターン | 難易度 | 概要 |
| :--- | :---: | :---: | :--- |
| `src/versioning.ts` | B | 低 | ローディング画面バージョン表示（`getElementById("versionText").innerText`） |
| `src/ui/index.tsx` | B | 低 | `document.getElementById("react-ui-root")` — React ルート取得（React 18 標準パターン、変更不要の可能性あり） |
| `src/ui/components/ExitCustomization.tsx` | D | 低 | React コンポーネント内で `.style.opacity` 等を直接操作（16〜25行）。CSS クラスまたは Tailwind に移行 |
| `src/ui/dialogs/Dialog.tsx` | B D | 低 | ダイアログ位置調整スタイル操作（36〜41行） |
| `src/ui/dialogs/BattleScreenDialog.tsx` | B | 低 | `document.getElementById("distanceUnitInput")` |
| `src/ui/dialogs/LoadMapDialog.tsx` | B | 低 | ファイル入力操作（13/28行） |
| `src/ui/dialogs/RiversOverviewDialog.tsx` | B | 低 | `document.createElement("a")` ダウンロード（95/163行） |
| `src/ui/dialogs/ExportToPngTilesDialog.tsx` | B | 低 | 出力要素の取得と操作（42/53/70/81行） |
| `src/ui/dialogs/MarkersOverviewDialog.tsx` | B | 低 | マーカータイプ入力取得（95行） |
| `src/ui/dialogs/RoutesOverviewDialog.tsx` | B | 低 | 距離ユニット要素取得（61行） |
| `src/ui/dialogs/CommonEditorDialog.tsx` | B | 低 | レイヤーID クリック処理（9/30行） |
| `src/ui/dialogs/TemplateEditorDialog.tsx` | C | 低 | `window.open(外部URL)` — ユーティリティ関数化推奨（436/445行） |
| `src/ui/dialogs/EmblemEditorDialog.tsx` | B | 低 | ファイル入力クリック（277/296行） |
| `src/ui/dialogs/TemperatureGraphDialog.tsx` | B | 低 | `container.innerHTML = ""` （59行） |
| `src/ui/dialogs/NotesEditorDialog.tsx` | B | 低 | `legendRef.current.innerHTML = legend`（26行） |
| `src/ui/dialogs/ChartsOverviewDialog.tsx` | B | 低 | `el.innerHTML = ""`（54行） |
| `src/ui/dialogs/ImageConverterDialog.tsx` | B | 低 | ファイル入力クリック（56行） |
| `src/ui/dialogs/ElevationProfileDialog.tsx` | C | 低 | `window.innerWidth - 400` — viewContext 参照に統一（36行） |
| `src/controllers/heightmapEditor.ts` | E | 低 | `d3.select("#exitCustomization").dispatch(...)` （242行） |
| `src/controllers/tools.ts` | E | 低 | `d3.select("#labels").style("display", "block")` （244行） |
| `src/controllers/hierarchy-tree.ts` | E | 低 | `d3.select(svgNode).call(zoom)` — 階層ツリーズーム設定（46行） |
| `src/controllers/transform-tool.ts` | C | 低 | `window.innerWidth * 0.5` — プレビューサイズ計算（38行） |
| `src/controllers/temperature-graph.ts` | C | 低 | `window.innerWidth / 2` — グラフサイズ計算（97行） |
| `src/controllers/religions-editor.ts` | C | 低 | `window.TouchEvent && event instanceof TouchEvent` （645行） |
| `src/controllers/emblems-editor.ts` | C | 低 | `window.btoa` / `window.URL.createObjectURL`（327/387行） |
| `src/controllers/export-json.ts` | C | 低 | `window.URL.createObjectURL/revokeObjectURL`（27/33行） |
| `src/controllers/options.ts` | C | 低 | `window.innerWidth/Height` 比較が複数箇所。viewContext 参照に統一推奨 |
| `src/ui/components/tabs/OptionsTab.tsx` | C | 低 | `window.innerWidth/Height` でマップサイズ初期化（26行） |
| `src/extensions/economy/index.tsx` | B | 低 | `document.addEventListener("fmg:generate-post-core", ...)` — 現在のイベント駆動設計上は許容パターン |
| `src/extensions/dynamicLoader.ts` | B | 低 | `document.createElement("style")` — 動的スタイルシート読み込み（38行） |
| `src/canvas/map-canvas.ts` | B D | 低 | `document.createElement("canvas")` + `canvas.style.cssText` — キャンバス生成ユーティリティ（27/30行） |
| `src/generators/heightmap-generator.ts` | B | 低 | `document.createElement("canvas")` — ハイトマップ生成用（647行） |
| `src/utils/graphUtils.ts` | B | 低 | `document.createElement("canvas")` — グラフ描画用（549行） |
| `src/utils/editorHelpers.ts` | B | 低 | `document.createElement("a")` ダウンロード + `.addEventListener`（30/75行） |
| `src/utils/pathUtils.ts` | C | 低 | `window.ERROR && console.error(...)` デバッグフラグ（300/305/310行） |
| `src/io/ldb.ts` | C | 低 | `window.indexedDB` — IndexedDB API アクセス（標準WebAPI、変更不要の可能性あり） |
| `src/io/cloud.ts` | C | 低 | `window.innerWidth/Height` + `window.open()` — Cloud auth ウィンドウ（92〜94行） |
| `src/io/save.ts` | B C | 低 | `document.cloneNode` + `document.createElement("a")` + `window.URL` — ファイルダウンロード（71/178/183行） |
| `src/extensions/economy/controllers/trade-details.ts` | B | 低 | DOM 取得（84/109/120行） |

---

## 対応優先度サマリー

```
フェーズ 1（高難度・影響範囲大）
  ├── src/controllers/layers.ts         ← レイヤートグルの Zustand + CSS クラス化
  ├── src/utils/uiHelpers.ts            ← window.dialog グローバル → Zustand ダイアログ状態
  ├── src/io/auto-update.ts             ← SVG 更新を Renderer 層へ委譲
  └── src/ui/dialogs/useDraggable.ts    ← CSS transform + React Hooks へ全面移行

フェーズ 2（中難度・機能単位）
  ├── src/io/load.ts / export.ts        ← ファイルI/O UI の React Dialog 化
  ├── src/main.ts                       ← 初期化フローの DOM 操作を段階的に整理
  ├── src/controllers/editors.ts        ← d3 セレクター → Renderer 委譲
  └── Economy 拡張 controllers/         ← goods/markets UI の React コンポーネント化

フェーズ 3（低難度・まとめて対応）
  ├── window.innerWidth/Height 参照     ← viewContext.svgWidth/Height に統一
  ├── document.createElement("a")      ← downloadFile() ユーティリティに集約
  ├── window.URL.*                      ← URL ユーティリティ関数として隔離
  └── d3.select 軽微残存                ← 各コントローラーの該当行のみ修正
```
