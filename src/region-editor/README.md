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
  - Illustrated (斜め上から見た山並み・立ち木を敷き詰める絵地図。山岳・丘陵バイオームに標高連動の山を自動配置)
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
    incomingRegion.ts        IndexedDB (siteStore.ts) からの FMG データ受取
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

## FMG由来の土地利用予算と耕作地

畑・牧草地・建物などの面積は、FMG が算出したセルごとの土地利用予算（`site.landUse` / `cell.landUse`、`generators/settlementClearance.ts`）をそのまま受け取ります。RE は食料・収量・降水量を再計算しません。必要面積は人口×年間主食200kg を、可食率0.65・純収量450kg/ha・作付率0.67 で割った値（予備1.1倍）で、予算の算出はFMG側の責務です。

予算を持たない旧形式の記述子だけは `core/gen/farmland.ts` の `legacyBudgets` で同じ計算に載せます（耕作可能地は面積の70%、降水量200mm未満・水域・標高20未満・湿地等は0、降水量不明は700mmとみなす）。河川の水量は補いません。

各都市の `farmlandAreaHectares` に、配置できた耕作面積（ha）を保存します（食料を供給するセルの配置面積を需要側の都市に人口比で按分）。水域・河川・街道・建物に切られて置けない分は `landUse.unplacedAreaHa` に残り、面積は地域JSONの保存・読込で保持します。ユーザー編集済み（`userEdited`）の区画は再生成しても保持します。過去の地域JSONの畑区画は読込時に `landUse` へ移行し、データがない都市は0で初期化します。FMGの最新データで計算するには、FMGから地域を開き直してください。

## 農地・牧草地の配置（自然な田園風景）

畑・牧草地などの区画は、`core/gen/organicParcels.ts` の不規則な凸多角形（ジッタ付き格子のボロノイ分割を一方向に引き伸ばしたもの）として配置します。三角形・正方形のタイル分割は使いません。格子は世界座標に固定され、隣接セルや別範囲の地方図でも同じ区画が切り出されます。

- **面積**: FMG の予算（セルごとの耕作・牧草地面積、`site.landUse`）が配置量を決めます。水域・河川・街道・建物に切られた分は未配置として `unplacedAreaHa` に残ります。
- **位置**: FMG のフットプリントは弱い事前分布として使い、集落（建物区画のアンカー、および食料を供給する需要セルの集落）・街道・河川への近さと、世界座標で連続するノイズで決めます。集落のないセルでは単一の円盤にならず、複数の小さな集落地として散らばります。
- **大きさ**: 予算に応じて1種別あたり約20区画、1区画20〜200ha。1セルあたりの候補区画は450以下に制限します。
- **FMG 側**: `generators/landUseActivities.ts` の配置優先度は、セル中心からの距離のみで決まる円盤状から、世界座標で連続するノイズ主体に変えています。
- **描画**: 区画ごとに色調と畝の向きが決定的に変わり、畝の線はズームに依らない細さの生垣線で縁取られます（`render/svg.ts`）。
