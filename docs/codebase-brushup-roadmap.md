# TypeScript コードベース ブラッシュアップ・ロードマップ

> **目的**: `public/` のJSファイルの `src/` (TypeScript) への移行完了を受け、現在のコードベースを最新のTypeScriptベストプラクティスに基づき、保守性とパフォーマンスに優れたモダンアーキテクチャへと段階的に昇華させる。
> **前提となる設計方針**: 「データとビューの完全な分離」「グローバル汚染の排除」「.mapファイルをFMG外部のシステムでも描画可能な独立性の確保」

---

## フェーズ1: グローバルオブジェクトの解体とコンテキスト分離（短期・最優先）

最大の技術的負債である `window.*` への直接依存を排除し、アプリケーションのエントリポイント (`app.ts`) で生成したコンテキストを各層へ依存性注入（DI）する構造へ移行します。

### 主なタスク
1. **3大コンテキストの型定義と実装**
   - **`WorldContext`**: 世界の本質的データ (`pack`, `grid`, `seed`, `options`, `graphWidth`, `graphHeight` 等)。SVGやUIへの依存を持たない純粋なデータストア。`graphWidth`/`graphHeight` は `options.mapWidth`/`options.mapHeight` の等価物であり世界生成パラメータであるため、ブラウザリサイズで変化しないこの層に属する。
   - **`ViewContext`**: SVGとD3セレクションの器 (`svg`, `layers`, `zoom`, `svgWidth`, `svgHeight` 等)。データを知らない純粋なビューコンテキスト。`svgWidth`/`svgHeight` は `Math.min(graphWidth, window.innerWidth)` であり、ブラウザウィンドウサイズに依存して変化する表示パラメータのためこの層に属する。D3レンダリングユーティリティ(`lineGen` 等) も同様にここに置く。
   - **`AppServices`**: 共通の純粋関数や状態管理 (`rng`, `history`, `storage` 等)。
2. **各層への明示的な引数渡し (DI)**
   - `Generator` には `WorldContext` と `rng` のみを渡す。
   - `Renderer` には `WorldContext` (Readonly) と `ViewContext` (Readonly) を渡す。
   - `Editor (Controller)` には全てのコンテキストを渡し、副作用をここでコントロールする。
3. **`any` 型の徹底排除**
   - 既存の `any` を `unknown` や具体的な型（Union型、Generics）に置き換え、TypeScriptの Strict Mode を完全に有効化できる状態を目指す。

---

## フェーズ2: レンダリングの純粋化とアーキテクチャの強制（短期〜中期）

4層アーキテクチャ（State, Generator, Renderer, Editor）の境界を明確にし、意図しない副作用を防ぐ仕組みを静的解析レベルで導入します。

### 主なタスク
1. **D3セレクション型の厳格化**
   - `d3.Selection<SVGGElement, unknown, HTMLElement, any>` など、現在曖昧になっているSVGレイヤーのD3セレクションに具体的な型を付与する。
2. **ESLintによるアーキテクチャルールの自動強制**
   - **Rendererの純粋化**: Rendererファイル内で `pack` や `grid` への代入操作を `no-restricted-syntax` で禁止。
   - **Generatorの非DOM化**: Generatorファイル内で `document` や `window` などのDOMアクセスを `no-restricted-globals` で禁止。
3. **生成パイプラインの型安全化**
   - `src/modules/index.ts` の生成パイプラインの各ステージ間の入出力（`PipelineStageInput<T>` / `PipelineStageOutput<T>`）を明示的に型付けする。

---

## フェーズ3: パフォーマンスの大幅な最適化（中期）

同期的な重い処理や、大量のDOMノードによるブラウザのレンダリング負荷を軽減し、UXを劇的に改善します。

### 主なタスク
1. **Web Worker へのオフロード**
   - Voronoi計算や地形生成（Generatorパイプライン）などの重い計算処理を Web Worker に移動し、メインスレッドのブロック（UIフリーズ）を解消する。
2. **Canvas / WebGL への部分移行**
   - ズーム・パン時に再計算コストが極めて高い数万パスのSVGレイヤー（静的な背景テクスチャや海洋レイヤーなど）を優先的に Canvas や WebGL へ移行する。
3. **TypedArray の積極採用**
   - ループ計算において、ガベージコレクション（GC）負荷やメモリアロケーションを削減するため、`Uint16Array` や `Float32Array` の利用範囲をさらに拡大する。
4. **エディタUIの遅延ロード**
   - 巨大なエディタ群（3D, Battle Screen等）を Vite のコード分割機能を用いて必要になるまで読み込まず、初期バンドルサイズを削減する。

---

## フェーズ4: テスト戦略の確立とデータ互換性の保証（中期）

安全にリファクタリングを継続するための自動テスト基盤を構築し、既存ユーザーのデータを保護します。

### 主なタスク
1. **ユニットテストの導入 (Vitest)**
   - 生成パイプラインの各ステージに対し、「同一シードであれば完全に同一の出力になること」を保証するテストを実装する。
2. **E2Eテストの導入 (Playwright)**
   - バーグ（都市）の追加や国家の生成など、複雑な Editor 操作を通したリグレッションテストを自動化する。
3. **型安全なバージョン付きデシリアライザの実装**
   - 旧形式の `.map` ファイルを安全に読み込み、最新の `WorldContext` へマイグレーションするロジックを型安全に実装し、その後方互換性を自動テストで担保する。

---

## フェーズ5: モダンUI・状態管理への移行準備（長期）

jQueryや命令的DOM操作を排除し、将来的によりモダンで宣言的なUIフレームワーク（Reactなど）へ移行するための地盤を固めます。

### 主なタスク
1. **jQuery の完全排除**
   - `$(...)` を `document.querySelector` や D3 セレクション、ネイティブのDOM APIへ完全に置き換え、バンドルサイズを削減する。
2. **軽量 Store パターン / Zustand の導入**
   - UIの表示状態（`viewState`）を管理するための軽量なStore、あるいは Zustand のような状態管理ライブラリを導入し、データフローを一方向にする。
3. **D3の役割の再定義**
   - D3を「計算・投影（d3-geo等）」および「SVGユーティリティ」に限定し、DOM構築・状態管理の責務から段階的に切り離す。
