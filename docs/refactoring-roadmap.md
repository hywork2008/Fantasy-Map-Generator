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
