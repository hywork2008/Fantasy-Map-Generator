# Region Editor / RE

地方・地域地図（Region Map）を自動生成し、山岳・森林・河川・集落単位で編集する独立エディター。
大陸地図（FMG）と都市地図（CE）の中間に位置する。

**状態: Phase 1〜3（基礎基盤・FMG連携・直角橋・Schley/Perilous描画）実装済み。**

設計の正本: [Region Editor 設計](../../docs/plan/region-editor.md)

## 起動と操作

`npm run dev` で起動し、通常設定では
`http://localhost:5173/Fantasy-Map-Generator/region-editor/` を開く。
（`NETLIFY` 設定などで base が `/` の場合は `/region-editor/`）

また、FMG の州編集画面（Province Editor Dialog）の **「Open in Region Editor」** ボタンをクリックすると、その地域の地形・河川・集落が高精細にアップサンプリングされて自動的に展開される。

- **テーマ切り替え**:
  - D&D Sword Coast (Mike Schley 様式: 立体的な山岳峰、豊かな森林、水彩・羊皮紙調)
  - Perilous Shores (Watabou 様式: ミニマルなペン画・木版画調)
  - Antique Parchment (古文書風セピア調)
  - Monochrome (白黒ペン画)
- **集落の選択と都市エディタ（CE）連携**:
  - 地図上の都市・町・村をクリックすると、詳細情報が表示され、「City Editor (CE) で開く」ボタンからシームレスに都市内部の街路・街区マップを開くことができる。
- **直角橋（Perpendicular Bridge）原則の遵守**:
  - 街道が河川を渡る箇所には、河川接線と厳格に90度直角を成す最短距離の橋梁が自動生成される（プロジェクト規約 `AGENTS.md` 遵守）。
- **JSON 保存・読込、SVG 出力、パン・ズーム操作** に対応。

## 構成

```text
region-editor/
  index.html                 独立ページエントリー
  main.ts                    UI 起動スクリプト
  core/
    types.ts                 データ型定義（RegionDocument、シンボル、河川、直角橋等）
    document.ts              文書生成・検証・クローン
    geometry.ts              幾何計算（交差、法線、距離）
    gen/
      prng.ts                シード付き決定的乱数
      pipeline.ts            地方地図の生成パイプライン
      poissonScatter.ts      Poisson Disc Sampling（シンボル散布）
      perpendicularBridges.ts ★河川直角橋梁の幾何生成（規約遵守）★
  render/
    svg.ts                   SVG レンダラー
    styles/
      symbols.ts             山岳・丘陵・樹木・湿原のSVGシンボル定義集
      themes.ts              カラーパレット・テーマ設定
  io/
    incomingRegion.ts        sessionStorage からの FMG データ受取
    regionEditorFile.ts      JSON 保存・読込、SVG 出力
  ui/
    RegionEditorPage.ts      メイン UI コンポーネント（パン・ズーム・サイドバー）
    region-editor.css        独立エディタスタイルシート
```

## テスト

```bash
npx vitest run src/region-editor
npx biome check src/region-editor
```
