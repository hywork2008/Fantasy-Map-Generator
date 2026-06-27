# WebGL レンダラー移行候補ライブラリ

> SVG レンダリング（D3 + `src/renderers/`）を全面的に WebGL へ移行する場合の候補評価。
> 作成日: 2026-06-27

---

## 1. 前提：このプロジェクトのレンダリング要件

`docs/upstream/domain/3d-view.md` および `src/renderers/` の構成から読み取った要件:

| 要件 | 現在の実装 |
| :-- | :-- |
| ポリゴン塗りつぶし | ボロノイセル（バイオーム・地域・高度）を `<polygon>` / `<path>` で描画 |
| パス描画 | 河川・海岸線・道路・境界線を D3 `lineGen` で生成 |
| テキストラベル | 国名・都市名を `<text>` 要素で配置（フォント・サイズ・色・回転） |
| スプライト / アイコン | burg icons・markers・紋章（COA SVG）を `<use>` / `<image>` で配置 |
| レイヤー合成 | 20以上の独立 `<g>` 要素（ON/OFF トグル、`ViewContext` で管理） |
| ズーム・パン | D3 zoom + `ViewContext.zoom/viewX/viewY` |
| アニメーション | 交易ルートアニメーション・人口バー（D3 transition） |
| インタラクション | セル・都市クリックによるピッキング |
| 3D ビュー | **Three.js が既存**（`src/controllers/view-3d.ts`）— 2D 側のみが移行対象 |

---

## 2. 候補ライブラリ

### A. deck.gl（最有力）

```
npm install deck.gl @luma.gl/core
```

**概要**: Uber/vis.gl が開発したデータビジュアライゼーション向け WebGL レイヤーシステム。地図・大規模データ特化。

#### 現レイヤーとの対応

| FMG の現レイヤー（`ViewContext`） | deck.gl 対応レイヤークラス |
| :-- | :-- |
| `biomes` / `regions`（ポリゴン） | `PolygonLayer` / `SolidPolygonLayer` |
| `rivers` / `routes` / `borders`（パス） | `PathLayer` |
| `burgIcons` / `markers`（アイコン） | `IconLayer` / `ScatterplotLayer` |
| `burgLabels` / `labels`（テキスト） | `TextLayer` |
| `coastline`（ライン） | `PathLayer` |
| `armies`（スプライト） | `BitmapLayer` |

#### 強み

- `PolygonLayer` / `PathLayer` / `TextLayer` など、このプロジェクトの描画要素と **1:1 に近いレイヤークラス** が揃っている
- 既存の `ViewContext` のレイヤー分類（`EnvironmentLayers`, `PoliticalLayers`, `InfrastructureLayers` 等）がそのまま deck.gl のレイヤー構成に対応できる
- **10万セル規模のデータでも GPU 側でカリング・バッチングを行うため高パフォーマンス**
- `data=` プロパティに `WorldContext` のデータオブジェクトをそのまま渡せるため、4層アーキテクチャの `Renderer` 層の責務（`Readonly<WorldContext> → 描画`）と設計哲学が一致する
- 独立した `Viewport` クラスがあり、現在の `ViewContext.zoom/viewX/viewY` の置き換えが自然

#### 懸念点

- テキスト描画品質が SVG より劣る場合がある（特に CJK フォント・カスタムウェブフォント）
- COA（紋章）のような複雑な SVG の再現がネイティブではできない  
  → 別途 Canvas 2D でオフスクリーンレンダリングしてテクスチャとして貼る手法が必要
- 学習コストが比較的高い（luma.gl / WebGPU バックエンドの概念）

---

### B. Pixi.js v8

```
npm install pixi.js
```

**概要**: 2D ゲームエンジン寄りの WebGL / WebGPU レンダラー。柔軟な Graphics API と Container によるシーングラフが特徴。

#### 強み

- `Graphics` API が Canvas 2D に近く、`moveTo / lineTo / fill` で河川・境界線をそのまま記述できる
- `BitmapFont` による高速テキスト、または `Text` オブジェクトで SVG 相当の品質が得られる
- `Container` によるレイヤー管理が現在の `<g id="biomes">` 等の DOM 構造と対応しやすく、**段階的な差し替え**（レイヤー単位の移行）がしやすい
- `hitArea` / `eventMode` でセルクリックのインタラクションを組みやすい
- **Three.js との共存実績あり** — 3D ビューとの画面切り替えがしやすい

#### 懸念点

- 大量のポリゴンを毎フレーム再描画する場合、deck.gl より手動最適化が必要（`GeometryCache`、`RenderTexture` などの活用が必要）
- データビジュアライゼーション向けではなくゲームエンジン寄りの設計のため、`WorldContext → レンダリング` のデータバインドは自前で実装する必要がある
- v8 は 2024 年リリースで API が変わっており、既存のネット上のサンプルは v7 以前のものが多い

---

### C. Three.js（既存依存の活用）

```
// 既に package.json に存在（src/controllers/view-3d.ts で使用中）
```

**概要**: 3D グラフィクスライブラリ。`OrthographicCamera` を用いることで 2D マップとしても利用可能。

#### 強み

- **新規依存ゼロ** — プロジェクトに既に存在し、3D ビューで動作実績がある
- `OrthographicCamera` + `PlaneGeometry` で 2D マップとして使用できる
- `CanvasTexture` で SVG 由来のテクスチャを貼る既存パターン（`src/renderers/draw-satellite-texture.ts`）が再利用できる
- GPU ベイク（侵食地形）の実装知見がそのまま活かせる

#### 懸念点

- 2D テキスト・ラベルが弱い — [troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text) など追加ライブラリが必要
- 2D ポリゴンは `ShapeGeometry` で可能だが、deck.gl / Pixi より記述量が大幅に多い
- 本来 3D 向けライブラリであり、2D マップレンダリングには設計のミスマッチがある
- レイヤーのトグル・順序管理を Three.js の `Scene` / `Object3D` で実現するのは間接的になる

---

### D. MapLibre GL JS（参考：地図特化）

**採用しない理由**:
- タイル座標系・地理投影前提の設計であり、このプロジェクトのボロノイ座標系とは相性が悪い
- カスタム手続き生成マップとの統合コストが高く、汎用 WebGL ライブラリより移行コストが増す

---

## 3. 推奨順位まとめ

| 順位 | ライブラリ | 総合評価 | 主な根拠 |
| :--: | :-- | :-- | :-- |
| **1位** | **deck.gl** | ◎ | データ → レイヤーの設計が4層アーキテクチャと最適合。大規模セルデータのパフォーマンスが最高 |
| **2位** | **Pixi.js** | ○ | 描画 API の柔軟性が高く、COA 等の複雑な図形も扱いやすい。段階移行（レイヤー単位の差し替え）がしやすい |
| **3位** | **Three.js** | △ | 新規依存ゼロで済む利点はあるが、2D 特化ライブラリと比べて記述コストが高い |

---

## 4. 移行戦略の指針

`docs/upstream/architecture/architecture.md` の方針（`Allow alternative renderers in the future (e.g. WebGL)`）に基づけば、**全廃よりも段階的な並列レンダラー化**が現実的。

### 推奨アプローチ

1. **SVG と WebGL Canvas のオーバーレイ構成から開始**  
   `<canvas>` の上に `<svg>` を `position: absolute` で重ねることで、テキストラベルと COA は SVG のままにしつつ、地形・バイオームなどの大面積ポリゴン層から WebGL に移行できる。

2. **`src/renderers/` のレイヤー単位で差し替え**  
   既存の Renderer 層の各ファイル（`draw-biomes.ts`, `draw-rivers.ts` 等）を WebGL 実装に順次差し替える。インターフェース（`render(worldContext, viewContext, appServices)`）は変えない。

3. **最難関の移行を後回し**  
   - COA（紋章）: SVG → Canvas 2D オフスクリーン → WebGL テクスチャ
   - カスタムフォントラベル: troika-three-text または deck.gl `TextLayer` で対応
   - これらは最後のフェーズに回す

4. **4層アーキテクチャのルールを維持**  
   WebGL 移行後も `Renderer` 層は `Readonly<WorldContext>` を受け取り、描画のみを行う純粋な関数として実装する。`WorldContext` や `pack`/`grid` への書き込みは引き続き禁止。

---

## 5. 関連ドキュメント

- [architecture.md](upstream/architecture/architecture.md) — 4層アーキテクチャ定義、WebGL 代替レンダラーへの言及
- [3d-view.md](upstream/domain/3d-view.md) — 既存 Three.js 実装の仕様
- [layer-toggle-3d-sync.md](layer-toggle-3d-sync.md) — SVG レイヤーと 3D シーンの同期設計
- [legacy-dom-migration-plan.md](legacy-dom-migration-plan.md) — jQuery/DOM 移行計画
