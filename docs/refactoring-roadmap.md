# リファクタリング・ロードマップ

更新日: 2026-05-25

本ドキュメントは、`public` フォルダから `packages` フォルダへ TypeScript 移植が行われた現在のコードベースを分析し、メンテナンス性の向上やパフォーマンス改善に向けた中長期的なロードマップ・改善提案をまとめたものです。

前提となるコーディング規約は `docs/refactoring-coding-guidelines.md` に従います。

## 1. 移植でのミスによるエラーの解消【完了】

`packages` および `src` フォルダ間で型の二重定義やファイルの重複が存在し発生していたコンパイルエラーは、現在解消され `npm run build` が正常に完了する状態になっています。

今後は再発防止のためCI等でビルドチェックを継続すると共に、残存している `ui-legacy-globals.d.ts` の暗黙の型定義を、引き続き通常の機能改修と並行して実体の `import` へと段階的に置き換えていきます。

## 2. 機能毎に相応しいディレクトリへの再配置（アーキテクチャ再構築）

現在の `packages` 内部は `@fmg/core`, `@fmg/legacy-ui`, `@fmg/shared` のように「技術的・歴史的経緯」で分割されています。これを「機能（ドメイン）単位」の凝集度が高い構造に再配置します。

### 改善提案
- **ドメイン駆動のモジュール分割**: `burgs` (都市), `states` (国家), `rivers` (河川) などの機能ごとにディレクトリを切り、その中に「状態管理 (State)」「生成ロジック (Generators)」「描画 (Renderer)」「UI 操作 (Editors)」をまとめます。
  - 変更前例: `core/src/modules/burgs-generator.ts`, `legacy-ui/src/modules/ui/burgs-editor.ts`
  - 変更後例: `packages/@fmg/burgs/generator.ts`, `packages/@fmg/burgs/renderer.ts`, `packages/@fmg/burgs/editor.ts`
- **依存関係の明確化**: ガイドラインにある「core は renderer に依存しない」を厳守するため、各機能フォルダ内で `Renderer` が `Generator` の出力結果を受け取る単方向の依存フローを構築します。

### 実施済み（2026-05-27）
- `rivers` ドメイン:
  - `packages/@fmg/rivers/src/renderer.ts` を新設し、河川描画処理を `@fmg/legacy-ui/src/modules/ui/layers.ts` から移設
  - `layers.ts` 側の `drawRivers` は `drawRiversRenderer` への委譲に変更（互換APIを維持）
- `states` ドメイン:
  - `packages/@fmg/states/src/renderer.ts` を新設し、国家描画処理を `@fmg/legacy-ui/src/modules/ui/layers.ts` から移設
  - `layers.ts` 側の `drawStates` は `drawStatesRenderer` への委譲に変更（互換APIを維持）
- `burgs` ドメイン:
  - `packages/@fmg/burgs/src/renderer.ts` を新設し、都市アイコン・ラベル描画呼び出しをドメイン側へ集約
  - `layers.ts` 側の `toggleBurgIcons` / `drawLabels` は `drawBurgIconsRenderer` / `drawBurgLabelsRenderer` への委譲に変更
- `provinces` / `cultures` / `religions`:
  - `packages/@fmg/states/src/provinces-renderer.ts` を新設し、州描画を委譲
  - `packages/@fmg/core/src/modules/cultures-renderer.ts` を新設し、文化圏描画を委譲
  - `packages/@fmg/core/src/modules/religions-renderer.ts` を新設し、宗教圏描画を委譲
- `layers.ts` の責務縮小:
  - `biomes` / `cultures` / `religions` の描画実装を `@fmg/core` から `packages/@fmg/legacy-ui/src/modules/ui/layer-renderers.ts` に集約（`core` から renderer を分離）
  - `packages/@fmg/legacy-ui/src/modules/ui/layer-renderers.ts` を新設し、`drawPrecipitation` / `drawPopulation` / `drawGrid` / `drawCoordinates` を分離
  - `drawTexture` / `drawLabels` も `layer-renderers.ts` へ分離
  - `drawRoutes` / `drawRoute` / `drawZones` も `layer-renderers.ts` へ分離し、`layers.ts` 側は委譲のみへ簡素化
  - `layers.ts` から複数の `draw*` 実装本体を除去し、トグル・UI制御と呼び出しハブの役割へ段階的に整理
- `ocean` ドメイン / WebGL 移行の安定化:
  - `packages/@fmg/ocean` を導入し、海洋レイヤー描画の WebGL 実装 (`OceanRenderer`) を分離
  - `packages/@fmg/core/src/modules/ocean-layers.ts` を WebGL-first に再編し、`#oceanLayersWebglHost` の再生成・再利用を安定化
  - WebGL 用のポリゴン三角形化を強化（ear clipping + Delaunay fallback）し、`New Map` ごとの SVG フォールバック頻発を抑制
  - `renderOceanLayersSvgForExport` を追加し、実行時表示は WebGL、`Export` / `Save` 出力は SVG パス再生成へ分離
  - `packages/@fmg/legacy-ui/src/modules/io/export.ts` / `save.ts` で出力時に `#oceanLayersWebglHost` を除去し、`#oceanLayers > path` を再構築するフローへ更新

### Problems 修正（2026-05-27）
- `Cannot find name 'getIsolines'. Did you mean 'isolines'?` を解消
  - `packages/@fmg/core/src/modules/biomes-renderer.ts`
  - `packages/@fmg/core/src/modules/cultures-renderer.ts`
  - `packages/@fmg/core/src/modules/religions-renderer.ts`
  で `getIsolines` を `@fmg/shared/pathUtils` から明示 `import` するよう修正

### `auto-update.ts` のリファクタリング進捗（2026-05-27）
- `マイグレーション処理の分離`（パイプライン化）は未着手のまま維持
- `グローバル依存 (window) の撲滅` の先行対応として以下を実施
  - `packages/@fmg/legacy-ui/src/modules/dynamic/auto-update.ts` に `d3` を明示 `import`
  - `window.findCell` 依存を廃止し、`findClosestCell` import + `findPackCell` ヘルパー経由の参照へ置換
  - `declare let zones: any;` を撤去し、`getZonesLayer()` ヘルパー経由で `#zones` を参照する形に変更
  - `packages/@fmg/legacy-ui/src/modules/runtime/auto-update-fmg-api.ts` を新設し、`auto-update.ts` から `requireFmgApi(...)` 直参照を分離
  - `packages/@fmg/legacy-ui/src/modules/runtime/legacy-runtime.ts` に `getLegacyPack` / `getLegacyGrid` を追加し、`auto-update.ts` の `resolveVersionConflicts` は Context getter 経由で `pack/grid` を取得する形に変更
  - `resolveVersionConflicts(mapVersion, context?)` の形へ拡張し、`AutoUpdateContext` 注入で `pack/grid` を外部から渡せるように変更（既存呼び出しはデフォルト Context で後方互換を維持）
  - `findPackCell` も注入された `pack` を使う実装へ変更し、`window.pack` 前提を段階的に排除
  - `packages/@fmg/legacy-ui/src/modules/io/load.ts` から `resolveVersionConflicts(mapVersion, {pack, grid})` を明示呼び出しするよう変更し、呼び出し元も Context 注入ベースへ移行
  - `packages/@fmg/legacy-ui/src/modules/runtime/auto-update-fmg-api.ts` は `requireFmgApi` 依存を撤去し、`@fmg/core/modules/initialize-fmg` の singleton 取得 (`getCoreFmgInstances`) を使う静的 import ベースへ移行（`window.fmg` は後方互換 fallback として維持）
  - `packages/@fmg/legacy-ui/src/modules/dynamic/auto-update-migrations/` を新設し、`1.0.0` マイグレーションを `v1-0-0.ts` へ抽出。`auto-update.ts` からは `runAutoUpdateMigrationPipeline(...)` 経由で実行する形に変更
  - `1.1.0` マイグレーションも `v1-1-0.ts` へ抽出し、`auto-update.ts` 本体から該当ブロックを除去。パイプラインで `1.0.0` → `1.1.0` を順次実行する形に整理
  - `1.11.0` 以降の全マイグレーションを `v1-11-0-plus.ts` へ移設し、`auto-update.ts` 本体は `runAutoUpdatePostV110Migrations(...)` 呼び出しのみへ縮小

この変更により、既存UI呼び出し点を壊さずに、描画責務をドメインパッケージへ段階的に寄せる分割を進めました。

### `ドメイン駆動のモジュール分割` 完了判定タスク（再設定）
- [x] `burgs` / `states` / `rivers` の renderer を各ドメイン配下へ配置し、既存UI側は委譲のみとする
- [x] `layers.ts` の描画本体を `layer-renderers.ts` へ移し、`layers.ts` をトグル・ハブ責務へ縮小する
- [x] `core` 配下に新設した暫定 renderer (`biomes/cultures/religions`) を撤去し、`core` と renderer 責務を分離する

### Phase 2 の残課題（ドメイン分割完了後）
- `auto-update.ts` の `requireFmgApi(...)` 依存を段階的に import 化し、`window.fmg` 依存を縮小する
- `auto-update.ts` を中心に、`window.pack` / `window.grid` 前提の参照を Context / Store 経由へ段階的に移行する

## 3. メンテナンス性を高める為のリファクタリング

`packages/@fmg/legacy-ui/src/modules/dynamic/auto-update.ts` などの一部のファイルは、非常に長く（1000行超）、DOMの直接操作とデータのバージョンマイグレーションが密結合しており、「意味不明なコード（マジックナンバーや暗黙の前提）」の温床となっています。

### 改善提案
- **マイグレーション処理の分離**: `auto-update.ts` 内の `resolveVersionConflicts` などの巨大関数を、バージョン毎のマイグレータファイル（例: `migrations/v1.0.ts`, `migrations/v1.1.ts`）に分割し、パイプライン処理化します。
- **グローバル依存 (window) の撲滅**: `window.pack`, `window.grid` や `declare let zones: any;` といった暗黙的なグローバル参照を廃止し、`FmgGlobalContext` （またはそれに準ずる Context/State 管理クラス）の引数渡し、あるいは専用の Store からの `import` に変更します。
- **UI コンポーネントの分離**: `d3.select` による命令的な DOM 操作を関数に切り出し、「データの変更」と「Viewの更新」の責務を分離します。

## 4. パフォーマンスチューニング

巨大なマップ（数万〜数十万のセル）を扱うため、SVG/DOM の再レンダリングやループ処理がボトルネックになり得ます。

### 改善提案
- **TypedArray の積極採用**: セルや頂点のループ計算（`pathUtils.ts` やジェネレータ）において、標準の `Array` ではなく `Uint16Array` や `Float32Array` 等の TypedArray を積極的に採用し、メモリアロケーションと GC の負荷を軽減します。
  - リサーチ `docs/typedarray.md`
- **レンダリングの最適化 (SVG から Canvas/WebGL への一部移行検討)**: ズームやパンのたびに数万の SVG パスを再計算するのは重いため、背景のテクスチャや静的な地形 (heightmap), 海洋レイヤーなどは Canvas (あるいは WebGL) での描画への移行を検討します。
- **Web Worker の活用**: `routes-generator` (経路探索) や `heightmap-generator` などの重い計算処理は、メインスレッドをブロックしないよう Web Worker へのオフロードを視野に入れます。

## 5. 技術選定・外部ライブラリ整理

現在 `packages/@fmg/legacy-ui` が jQuery や D3 に大きく依存しており、状態管理も `window.fmg` などのグローバル変数に分散しています。今後「パフォーマンス改善（Canvas移行）」や「テスト容易性」を考慮すると、以下のいずれか、または組み合わせの採用を推奨します。

### 5.1. UIライブラリ/状態管理の再構築（推奨）
- **React + Zustand/Redux Toolkit の採用**: 
  - D3 は描画ライブラリとして残しつつ、DOM操作や状態管理は React/Zustand で行うことで、ViewとModelを分離します。
  - `packages/@fmg/legacy-ui` を廃止し、`packages/@fmg/burgs-ui`, `packages/@fmg/world-ui` のようにドメインごとのコンポーネントライブラリを新規作成します。
- **Context API の活用**: 
  - Redux 等を導入せずとも、Reactの Context API を用いて状態をツリー状に管理し、グローバル依存を排除できます。

### 5.2. 外部ライブラリの取捨選択
- **D3.js の再評価**: 
  - DOM操作に D3 を使うのではなく、`d3-scale`, `d3-interpolate` など「ユーティリティ関数のみ」を限定的に利用し、描画本体は Canvas や React の描画機能に任せることでパフォーマンスを改善できます。
- **jQuery の排除**: 
  - UIライブラリを React 等に変更した場合、jQuery は不要になります。完全に削除してバンドルサイズを削減します。

### 実行計画
- **Option A (段階的リファクタリング)**: jQuery を削除し、D3 はユーティリティとして使いつつ、状態管理は Context API で行い、巨大関数を分割する。
- **Option B (フルリプレース)**: React + Zustand を新規導入し、`legacy-ui` を解体して新規UIコンポーネントライブラリを構築する。並行して D3 の使用箇所を最小化する。

## マイルストーン・実行計画

- **Phase 1: 止血・コンパイルエラー解消【完了】**
  - 重複ファイルの整理と TypeScript エラーのゼロ化（達成済）
  - `npm run build` の正常通過（達成済）
- **Phase 2: モジュールの再配置・依存関係の整理【現在のフェーズ】**
  - ドメインごとのディレクトリ作成 (`@fmg/burgs`, `@fmg/rivers` 等) とファイル移動
  - export/import の整理と、`window` 直下依存から `window.fmg` (または Context) への置換
- **Phase 3: レガシーな巨大関数の解体**
  - `auto-update.ts` などの分割・リファクタリング
  - マジックナンバーの定数化と型の厳密化
- **Phase 4: パフォーマンス改善**
  - データ構造の TypedArray 化
  - D3 描画の最適化・Canvas 移行検証
