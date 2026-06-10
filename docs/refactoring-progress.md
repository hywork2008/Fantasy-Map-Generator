# JS → TS リファクタリング 進捗と今後の計画

> 最終更新: 2026-06-11（フェーズ13完了）

---

## 全体方針

`public/`（レガシー JS）を `src/`（TypeScript）へ段階的に移行する。  
各フェーズは「`tsc --noEmit` ゼロエラー」「`npm run lint` ゼロエラー」「`npm run build` 成功」の状態でコミットし、動作を壊さない。

**4層アーキテクチャを常に守ること:**

```
Generator  (src/modules/)     → 世界データを生成・変異
Renderer   (src/renderers/)   → SVG への純粋描画（pack への書き込み禁止）
Editor     (src/controllers/) → ユーザー操作 → State 変異 + 再描画呼び出し
State      (src/types/)       → 型定義、グローバル変数の単一の型定義源
```

詳細は [refactoring-principles.md](./refactoring-principles.md) を参照。

---

## 現状スナップショット（フェーズ13完了後）

| カテゴリ | 移行済み TS | 残り JS |
|---|---|---|
| 型定義 (`src/types/`) | 3ファイル | — |
| Generator (`src/modules/`) | 22ファイル | — |
| Renderer (`src/renderers/`) | 29ファイル | — |
| Controller/Editor (`src/controllers/`) | 47ファイル | — |
| I/O (`src/io/`) | 6ファイル（auto-update含む） | — |
| UIモジュール (`public/modules/ui/`) | 移行済みは上記に含む | **5ファイル**（`<script>`タグ残存） |
| Dynamic（動的ロード） | states/cultures/religions/hierarchy/charts/export-json/auto-update/minimap/heightmap-selection | supporters, installation（2ファイル） |
| メインエントリ | — | `public/main.js`（1315行） |
| **移行済み合計** | **約 57,528行** | **約 5,472行** |

### 残存 JS ファイル一覧（`src/index.html` の `<script>` タグ残存）

| ファイル | 行数 | 分類 |
|---|---|---|
| `battle-screen.js` | 922 | 大規模エディタ |
| `3d.js` | 878 | 大規模エディタ |
| `burgs-overview.js` | 589 | 大規模エディタ |
| `diplomacy-editor.js` | 527 | 大規模エディタ |
| `military-overview.js` | 504 | 大規模エディタ |

### 動的ロード（`<script>` タグ外）で残存する JS

| ファイル | 行数 | 呼び出し元 |
|---|---|---|
| `modules/dynamic/supporters.js` | 621 | `options.ts` |
| `modules/dynamic/installation.js` | 73 | 不明（要調査） |

---

## 完了フェーズ

### フェーズ1: State の確定
- `src/types/PackedGraph.ts` の `any[]` → 具体的な型（Religion[], Marker[], IceElement[]）
- `src/types/WorldState.ts` 新規作成（WorldOptions, WorldNote, MapStyle, BiomesData, WorldState）
- `src/types/global.ts` でグローバル変数の型定義を一元管理

### フェーズ2: Renderer の純粋化
- `layers.js` の `draw*` 関数 14個 → `src/renderers/draw-*.ts`（14ファイル）
- `getGappedFillPaths` を `src/utils/pathUtils.ts` に共通ヘルパーとして移動

### フェーズ3: Generator のパイプライン化
- 全 Generator の関数シグネチャを `(state: WorldState)` に統一
- `generateWorld(state: WorldState)` パイプライン関数を `src/modules/index.ts` にエクスポート

### フェーズ4: Editor 履歴管理
- `src/utils/UndoStack.ts`: 汎用双方向スタック
- `src/editors/BrushHistory.ts`: SVG innerHTML スナップショット（cultures/states ブラシ用）
- `src/editors/HeightmapEditorHistory.ts`: `grid.cells.h` スナップショット

### フェーズ5: レイヤー管理の TypeScript 移行
- `public/modules/ui/layers.js`（689行）→ `src/controllers/layers.ts`
- レイヤープリセット管理、`drawLayers()` オーケストレーター、20個の `toggle*` 関数
- `src/index.html` から `layers.js` の `<script>` タグ削除

### フェーズ6: スタイル管理の TypeScript 移行
- `public/modules/ui/style.js`（1134行）+ `style-presets.js`（476行）→ `src/controllers/style.ts`
- `src/index.html` から2つの `<script>` タグ削除

### フェーズ7: I/O モジュールの TypeScript 移行
- `public/modules/io/` 4ファイル → `src/io/`（save, cloud, load, export）
- `src/index.html` から4つの `<script>` タグ削除

### フェーズ8: 汎用ユーティリティ UI の移行
- `hotkeys.js`（194行）→ `src/controllers/hotkeys.ts`
- `general.js`（581行）→ `src/utils/uiHelpers.ts`
- `measurers.js`（561行）→ `src/controllers/measurers.ts`（Rulers クラス）
- `src/index.html` から3つの `<script>` タグ削除

### フェーズ9: 中規模エディタの移行
- `biomes-editor.js`, `zones-editor.js`, `markers-editor.js`, `lakes-editor.js`, `rivers-editor.js`, `routes-editor.js`, `notes-editor.js` → `src/controllers/`
- `coastline-editor.js`, `namesbase-editor.js`, `elevation-profile.js` も移行
- 各 `<script>` タグを `src/index.html` から削除

### フェーズ10: 大規模エディタの移行
- `heightmap-editor.js`（1697行）→ `src/controllers/heightmap-editor.ts`
- `provinces-editor.js`（1373行）→ `src/controllers/provinces-editor.ts`
- `options.js`（1198行）→ `src/controllers/options.ts`
- `editors.js`（1017行）→ `src/controllers/editors.ts`
- `tools.js`（999行）→ `src/controllers/tools.ts`
- 各 `<script>` タグを `src/index.html` から削除

### フェーズ11: Dynamic モジュールの移行
- `auto-update.js`（1121行）→ `src/io/auto-update.ts`
- `states-editor.js`（1539行）→ `src/controllers/states-editor.ts`
- `cultures-editor.js`（978行）→ `src/controllers/cultures-editor.ts`
- `religions-editor.js`（859行）→ `src/controllers/religions-editor.ts`
- `hierarchy-tree.js`（526行）→ `src/controllers/hierarchy-tree.ts`
- `charts-overview.js`（703行）→ `src/controllers/charts-overview.ts`
- `export-json.js`（221行）→ `src/controllers/export-json.ts`
- 既存 `src/io/load.ts` の dynamic import を static import に置換
- ビルドエラー修正: `COA`/`COArenderer`/`drawScaleBar`/`fitScaleBar`/`parseTransform` の `declare global` 競合を解消

### フェーズ12: 概要パネル・小規模ユーティリティの移行
- `routes-overview.js`（218行）→ `src/controllers/routes-overview.ts`
- `rivers-overview.js`（218行）→ `src/controllers/rivers-overview.ts`
- `markers-overview.js`（256行）→ `src/controllers/markers-overview.ts`
- `regiments-overview.js`（228行）→ `src/controllers/regiments-overview.ts`
- `temperature-graph.js`（216行）→ `src/controllers/temperature-graph.ts`
- `world-configurator.js`（200行）→ `src/controllers/world-configurator.ts`
- `submap-tool.js`（98行）→ `src/controllers/submap-tool.ts`
- `route-group-editor.js`（84行）→ `src/controllers/route-group-editor.ts`
- `ice-editor.js`（120行）→ `src/controllers/ice-editor.ts`
- `transform-tool.js`（204行）→ `src/controllers/transform-tool.ts`
- `rivers-creator.js`（144行）→ `src/controllers/rivers-creator.ts`
- `ai-generator.js`（231行）→ `src/controllers/ai-generator.ts`
- `minimap.js`（133行）→ `src/controllers/minimap.ts`（tools.ts から static import に変更）
- `src/index.html` の `coastline-editor.js` 二重ロードタグを削除

### フェーズ13: 中規模エディタの移行
- `units-editor.js`（273行）→ `src/controllers/units-editor.ts`
- `relief-editor.js`（288行）→ `src/controllers/relief-editor.ts`
- `burg-group-editor.js`（344行）→ `src/controllers/burg-group-editor.ts`
- `labels-editor.js`（438行）→ `src/controllers/labels-editor.ts`
- `burg-editor.js`（480行）→ `src/controllers/burg-editor.ts`
- `regiment-editor.js`（494行）→ `src/controllers/regiment-editor.ts`
- `emblems-editor.js`（542行）→ `src/controllers/emblems-editor.ts`
- `heightmap-selection.js`（319行）→ `src/controllers/heightmap-selection.ts`（options.ts から static import に変更）
- `src/index.html` から上記7ファイルの `<script>` タグ削除
- `src/types/global.ts` に `generateSeed`, `shouldRegenerateGrid`, `generateGrid`, `drawHeights`, `findAllInQuadtree` 等の global 宣言を追加

---

## 今後のフェーズ

### フェーズ14（旧フェーズ13）: 大規模エディタの移行

| ファイル | 行数 | 難易度 |
|---|---|---|
| `burg-editor.js` | 480 | 中（burg 属性の編集・COA 連携） |
| `burg-group-editor.js` | 344 | 中 |
| `labels-editor.js` | 438 | 中 |
| `regiment-editor.js` | 494 | 中 |
| `emblems-editor.js` | 542 | 中（COArenderer 連携） |
| `relief-editor.js` | 288 | 中 |
| `units-editor.js` | 273 | 低 |
| `heightmap-selection.js` | 319 | `options.ts` から動的ロード中 |

**計:** 約 3,178行

---

### フェーズ14: 大規模・複雑なエディタの移行

| ファイル | 行数 | 難易度 |
|---|---|---|
| `battle-screen.js` | 922 | 高（軍事システム全体） |
| `3d.js` | 878 | 高（Three.js 連携・独立レンダリング） |
| `burgs-overview.js` | 589 | 中〜高 |
| `diplomacy-editor.js` | 527 | 高（国家間関係マトリクス） |
| `military-overview.js` | 504 | 中 |
| `supporters.js` | 621 | `options.ts` から動的ロード中（スポンサーリスト UI） |
| `installation.js` | 73 | 要調査 |

**計:** 約 4,114行

**注意点:**
- `3d.js` は Three.js に依存。`@types/three` の導入が必要
- `battle-screen.js` は `military` データ全体に依存し、Phase 3 のパイプラインとの接続確認が必要

---

### フェーズ15: メインエントリの移行（最終目標）
**対象:** `public/main.js`（1315行）

フェーズ14完了後に着手。  
`generateWorld(state)` はフェーズ3で整備済みのため、呼び出し側の整理が主作業。

```
src/main.ts  ← 全モジュールのインポートとアプリ初期化
```

これが完了した時点で `public/` は静的アセット（CSS、画像、外部ライブラリ）のみとなる。

---

## アーキテクチャ改善タスク（フェーズと並行）

### `any` の段階的撲滅
現在 `global.ts` の `$: (selector: any) => any` など多くの `any` が残る。  
jQuery 型定義 (`@types/jquery`) の導入で解決できる項目が多い。

### ESLint アーキテクチャルールの導入
`docs/refactoring-principles.md` に明記されているルールを自動強制する:

```js
// Renderer ファイルで pack への書き込みを禁止
"no-restricted-syntax": [
  { selector: "AssignmentExpression[left.object.name='pack']", message: "Renderer must not write to pack" }
]
// Generator ファイルで DOM アクセスを禁止
"no-restricted-globals": ["document", "window"]
```

### Web Worker の検討
重い地形生成（Voronoi、生成パイプライン全体）を Worker に移動し、UI スレッドをブロックしない設計。  
フェーズ15の `main.ts` 整備と合わせて検討する。

---

## フェーズ優先度マトリクス

| フェーズ | 効果 | 難易度 | 状態 |
|---|---|---|---|
| 1: State の確定 | 高（型安全の基盤） | 低 | ✅ 完了 |
| 2: Renderer の純粋化 | 高（描画分離） | 中 | ✅ 完了 |
| 3: Generator パイプライン化 | 高（コアロジック） | 中 | ✅ 完了 |
| 4: Editor 履歴管理 | 中 | 低 | ✅ 完了 |
| 5: layers.js | 高（レイヤー制御） | 中 | ✅ 完了 |
| 6: style.js | 高（スタイル管理） | 中 | ✅ 完了 |
| 7: I/O モジュール | 高（データ安全性） | 中 | ✅ 完了 |
| 8: hotkeys / general / measurers | 中（依存整理） | 低 | ✅ 完了 |
| 9: 中規模エディタ | 中 | 中 | ✅ 完了 |
| 10: 大規模エディタ | 高（コア機能） | 高 | ✅ 完了 |
| 11: Dynamic モジュール | 高（動的ロード排除） | 高 | ✅ 完了 |
| 12: 概要パネル・小規模ユーティリティ | 中 | 低〜中 | ✅ 完了 |
| 13: 中規模エディタ残 | 中 | 中 | ✅ 完了 |
| 14: 大規模・複雑エディタ | 高 | 高 | 未着手 |
| 15: main.js（最終目標） | 高（完全移行） | 高 | 未着手（前提: 12〜14完了） |
| ESLint ルール | 高（品質保証） | 低 | 随時 |
