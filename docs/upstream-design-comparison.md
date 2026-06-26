# Upstream 設計比較レポート

> 調査日: 2026-06-26  
> 比較対象: `remotes/upstream/master` (Azgaar/Fantasy-Map-Generator) vs 本プロジェクト (`debug/june`)  
> 調査対象: `docs/architecture/`, `docs/domain/`, `docs/architecture/lazy_loading.md`, `docs/architecture/migration_guide.md` および `src/` ディレクトリ構造

---

## 概要

Upstream の設計ドキュメントおよびソース構造を本プロジェクトのベストプラクティス（AGENTS.md）と照合した結果、以下の点で Upstream が進んだ設計を持っていることを確認した。

---

## 1. Lazy Loading レジストリパターン（**本プロジェクトへの導入は不要**）

### Upstream の設計

`src/lazy-loaders.ts`（`src/` ルートに単体で配置）がすべての遅延ロードモジュールを一箇所に集約する。呼び出し元（主に legacy `public/` JS）は `await window.lazy.culturesEditor()` の 1 行で遅延 import できる。

### Upstream がこのパターンを必要とした理由

`public/*.js` は ES module 非対応の legacy コードであり、Vite でバンドルされた `src/*.ts` モジュールを直接 `import` できない。`window.lazy` はその **bridge** として設計された。

### 本プロジェクトへの適用

本プロジェクトは `public/libs/` を含むすべての JS を `src/` に TS として移植済みであり、Vite の module graph 内で静的 `import` によるロード順制御が可能。そのため `window.lazy` bridge は不要。

- コード分割が必要なモジュールは各呼び出し元に直接 `import()` を書けば Vite が自動でチャンク分割する
- 集約レジストリを維持すると「どのモジュールが lazy か」を 2 箇所で管理することになる

**結論: 導入不要。** ファイル読み込みパフォーマンスを問わない場合はなおさら意味がない。

### 参照

`docs/architecture/lazy_loading.md` に Upstream 側の設計思想・検証手順が記述されている（本プロジェクトへの適用時は上記の前提を考慮すること）。

---

## 2. `src/generators/` という命名 ★★

### Upstream の設計

4層アーキテクチャの「Generator 層」と `src/` のフォルダ名が 1:1 対応している。

```
src/generators/   ← Generator 層（手続き的世界生成）
src/renderers/    ← Renderer 層（SVG 描画）
src/controllers/  ← Editor/UI 層（ユーザー操作・概要表示）
```

### 本プロジェクトの現状

Generator 層が `src/modules/` と命名されており、4層モデルとの対応が視覚的に不明瞭。また一部のジェネレータ（`ocean-layers.ts`, `fonts.ts`）が `modules/` 内に混在している。

### upstream generators に存在して modules にないファイル

| Upstream | 本プロジェクト対応 |
|---|---|
| `generators/ice-generator.ts` | `modules/ice.ts` |
| `generators/goods-generator.ts` | なし（economy 機能） |
| `generators/markets-generator.ts` | なし（economy 機能） |
| `generators/production-generator.ts` | なし（economy 機能） |

---

## 3. `src/data/` + `src/services/` の分離 ★★

### Upstream の設計

| フォルダ | 役割 | 例 |
|---|---|---|
| `src/data/` | 静的コンテンツ・参照データ（ロジックなし） | `supporters.ts` |
| `src/services/` | ブラウザ/アプリライフサイクル管理 | `fonts.ts`, `installation.ts`, `ui-tour.ts` |

`architecture.md` の判断基準:
> "A constant list or template, no behavior → `data/`"  
> "Manages browser/app lifecycle or a platform asset → `services/`"

### 本プロジェクトの対応（実施済み 2026-06-26）

| ファイル | 移動前 | 移動後 |
|---|---|---|
| フォント管理 | `src/modules/fonts.ts` | `src/services/fonts.ts` ✅ |
| UI ツアー | `src/controllers/ui-tour.ts` | `src/services/ui-tour.ts` ✅ |
| 静的設定 | `src/config/` | `src/data/` ✅ |
| 海洋レイヤー（SVG描画）| `src/modules/ocean-layers.ts` | `src/renderers/ocean-layers.ts` ✅ |
| 侵食ベイク（3D描画）| `src/modules/erosion-bake.ts` | `src/renderers/erosion-bake.ts` ✅ |

全ファイルの import/export を更新済み。`npx tsc --noEmit` エラーゼロ・循環参照なしを確認。

---

## 4. `src/controllers/` への editors 統合 ★

### Upstream の定義

`src/controllers/` は UI/インタラクション層全体を収容する。

- **Editors**: ユーザー駆動のワールドデータ変更（`cultures-editor.ts`, `states-editor.ts` など）
- **Tools**: インタラクティブなマップツールとワークフロー
- **Overviews**: 状態を読み取り専用で表示するダイアログ・パネル（`market-overview.ts` など）

### 本プロジェクトの現状

`src/editors/` を独立ディレクトリとして分離している。AGENTS.md の層定義では Editor 層は `src/controllers/` とされているため、ディレクトリ構造との乖離が生じている。

Upstream の論拠：
> "editors should not directly own rendering. Instead: User action → Editor mutates world state → Renderer reacts."

この原則は本プロジェクトでも共通しており、`controllers/` への統合は整合性の観点で有効。

---

## 5. Economy システム（新機能・generators/controllers/renderers 全域）

Upstream のみに存在するファイル群。`feature/import-economy` ブランチのマージ元。

### generators

| ファイル | 役割 |
|---|---|
| `goods-generator.ts` + `.test.ts` | 財・商品カタログ生成（バイオーム産出・製造レシピ・需要カテゴリ） |
| `markets-generator.ts` + `.test.ts` | 市場生成・BFS による市場領域拡張 |
| `production-generator.ts` | 生産・税収シミュレーション（`burg.production`, `state.treasury`） |

### controllers

`good-editor.ts`, `goods-distribution-editor.ts`, `goods-editor.ts`,  
`market-deals-overview.ts`, `market-overview.ts`, `markets-overview.ts`,  
`production-chains.ts`, `production-overview.ts`,  
`trade-animation-editor.ts`, `trade-details.ts`, `compare-prices.ts`

### renderers

`draw-goods.ts`, `draw-markets.ts`, `trade-animation.ts` + `trade-animation.test.ts`

---

## 6. Generation Pipeline ドキュメント ★

### Upstream の設計

`docs/domain/generation_pipeline.md` に `generate()` の全 16 フェーズを表形式で定義。

| フェーズ | 内容 |
|---|---|
| 1–2 | シード・グリッド・高度マップ |
| 3–5 | 水文学ベース・気候・再パック |
| 6–7 | 河川・バイオーム・氷 |
| 8 | 財カタログ（Economy 前提） |
| 9–13 | 文化・集落・政治・省・命名 |
| 14 | Economy（市場・生産・税収） |
| 15–16 | 軍事・マーカー・最終化 |

さらに 3 つの **replication site**（高さマップ編集後の全再生成・データ保持再生成・submap リサンプル）それぞれについて、どのフェーズを再実行すべきかが明示されている。新 generator を追加する際のチェックリストも整備されている。

### 本プロジェクトの現状

相当するドキュメントがなく、新ジェネレータ追加時にどの replication site を更新すべきかが暗黙知になっている。

---

## 本プロジェクトが Upstream より進んでいる点（参考）

| 分野 | 本プロジェクトの実装 |
|---|---|
| 型付き公開 API | `window.fmg` 名前空間（`FMGNamespace`）が frozen object として整備済み |
| DI アーキテクチャ | `WorldContext` / `ViewContext` / `AppServices` の正式な Context 注入パターン |
| Extension システム | `src/extensions/` による動的拡張ローディングと `ExtensionAPI` |
| React/Zustand UI | `src/ui/` + `src/store/` による宣言的 UI パネル |
| TS 移行進捗 | `src/io/`（save/load/cloud/ldb）が全 TS 化済み |
| Erosion Bake | 地形侵食ジェネレータ（`renderers/erosion-bake.ts`） |
| Renderer 網羅性 | biomes, cells, coordinates, cultures, grid, population, precipitation, provinces, religions, rivers, routes, states, texture, zones の個別 renderer |

---

## 優先度まとめ

| 優先度 | 取り入れ候補 | 理由 |
|---|---|---|
| ~~★★★~~ | ~~`lazy-loaders.ts` パターン導入~~ | **不要**: `public/` legacy JS が存在しないため bridge が要らない |
| ★★☆ | `src/modules/` → `src/generators/` リネーム | 4層モデルとフォルダ名の 1:1 対応 |
| ~~★★☆~~ | ~~`src/services/` ディレクトリ新設・分離~~ | **実施済み**: fonts/ui-tour を services へ、config→data・ocean-layers/erosion-bake を renderers へ移動 |
| ★☆☆ | `src/editors/` を `src/controllers/` へ統合 | AGENTS.md の層定義との整合 |
| ★☆☆ | Generation Pipeline ドキュメント整備 | 新 generator 追加時のチェックリスト |
