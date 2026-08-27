# City Generator — ページ配置とソース構成の設計

`draft.md`（生成プロセスの 5 ステップ）と `gemini-city-generator/docs/plan/01-goals.md`（目的・設計原則）
を入力に、**FMG 世界地図内の都市配置を反映した SVG 都市ジェネレータ**を FMG リポジトリ内へ
追加するための設計。世界地図生成（`npm run dev` → `/Fantasy-Map-Generator/`）とは別口の
独立ページとして持つ。

---

## 0. 前提と方針

| 項目 | 決定 |
| ------ | ------ |
| ライセンス | 生成コードは **MIT**。`TownGeneratorTS/src/**`（GPL）からの**コード移植は禁止**。参照してよいのは `TownGeneratorTS/docs/**`（本プロジェクト著者の記述）と公知アルゴリズムのみ |
| Voronoi | **使う**。`gemini-city-generator` は街区・敷地生成での Voronoi を禁じているが、`draft.md` が Voronoi を使うのは**マクロなセル分類（海/陸/河/市街）**であって街区・敷地ではない。FMG 本体（`src/generators/voronoi.ts`）と同じ用途 |
| 河川の扱い | `TownGeneratorTS/docs/temp/0827.md` の「案 1 / ハイブリッド」を採用（§4 参照）。過去の river 導入失敗の再発を構造的に防ぐ |
| 描画 | **SVG**（`draft.md` の添付 SS と同じ）。deck.gl は使わない。バンドルを小さく保つため d3 も引き込まない |
| ページ形態 | **Vite マルチページ（MPA）エントリ**。拡張機能（`src/extensions/`）ではない ── あれは稼働中の世界地図に機能注入するランタイムプラグイン機構であり用途が違う |

---

## 1. ページの配置（Vite MPA）

### 1.1 ファイル

```text
src/city/
  index.html        新規 MPA エントリ HTML（インライン <style> + <script src="./main.ts">）
  main.ts            エントリ：ページを組み立てて mount するだけ
```

- dev: `http://localhost:5174/Fantasy-Map-Generator/city/`
- 本番（GitHub Pages）: `https://azgaar.github.io/Fantasy-Map-Generator/city/`
- `vite.config.ts` は `root: './src'` なので、`src/city/index.html` がそのまま `/city/` になる。
  `src/city.html`（フォルダなし）だと `/city.html`。クリーンな `/city/` にしたいのでフォルダ + `index.html`。

### 1.2 `vite.config.ts` の変更（1 箇所）

```ts
import path from 'path';                     // 既に import 済み
// ...
build: {
  outDir: '../dist',
  assetsDir: './',
  emptyOutDir: false,                        // 既存。両エントリが dist/ に共存できる
  rollupOptions: {
    input: {
      main: path.resolve(__dirname, 'src/index.html'),
      city: path.resolve(__dirname, 'src/city/index.html'),
    },
  },
},
```

`input` を明示すると既定の `src/index.html` が外れるので、両方列挙が必須。

### 1.3 その他

- `tsconfig.json` は `include: ["src"]` なので新ファイルは自動対象。`npm run lint`（biome）も対象。
- `netlify.toml` の `/* → /index.html 200` は `/city/` を潰す。**Netlify も配布するなら** `/city/*` の
  除外リダイレクトを追加。GitHub Pages は影響なし。
- PWA Service Worker の登録は世界地図側 `main.ts` の中だけ。city ページは登録しない。
- `deploy.yml`（GitHub Pages）は `npm run build` → `dist/` 丸ごとなので変更不要。

---

## 2. ソースコード配置

`src/city-generator/` に**自己完結**で置く。`src/app.ts` / `src/main.ts` のツリーへは
**一切 import しない**（world app 側も `city-generator/` を import しない）。

```text
src/city/
  index.html
  main.ts                    → import { mountCityGenerator } from '../city-generator/ui/CityGeneratorPage'

src/city-generator/
  index.ts                   generateCity(params: CityParams): GenerationResult   ← 純関数
  core/
    prng.ts                  seeded RNG（alea は既存 dep。または mulberry32 を vendored）
    voronoi.ts               Delaunator half-edge ラッパ（src/generators/voronoi.ts の
                             デカップル版コピー。FMG 由来 = MIT なので流用可）
    grid.ts                  母点散布 + Lloyd 緩和 → Cell[]
    classifySea.ts           S1：海/陸タグ
    classifyRiver.ts         S2：河川タグ
    classifyUrban.ts         S3：市街タグ
    pipeline.ts              S0–S3 を順に実行し Snapshot[] を生成
    types.ts                 Cell / CityParams / GenerationResult / Snapshot
  site/
    burgSiteDescriptor.ts    BurgSiteDescriptor インターフェース（FMG service からコピー、
                             version チェックで前方互換管理）
    siteInput.ts             BurgSiteDescriptor → LocalParams アダプタ（純変換）
    synthSite.ts             スタンドアロン用：preset / query から合成 descriptor を捏造
    fixtures/                harbor.json / riverCrossing.json / hillTop.json / crossroads.json
  render/
    svg.ts                   GenerationResult → SVGElement（純関数・d3 非依存）
    palette.ts               羊皮紙調カラーパレット
  ui/
    CityGeneratorPage.ts     バニラ DOM シェル：サイズボタン / ステップスライダー /
                             レイヤートグル / pan-zoom / ツールチップ
  LICENSE-NOTE.md            「MIT。Watabou の Medieval Fantasy City Generator に着想を得たが
                             コード再利用なし」
```

- **`src/utils/` とは統合しない。** city-generator の `prng` / 幾何ヘルパは独自に持つ。隔離が目的。
- UI シェルは当面バニラ DOM（`draft.md` SS の TownApp 相当）。FMG のダイアログ部品と共有したく
  なったら `ui/` だけ React 化すればよい（FMG は React 19 + Zustand を既に持つ）。

---

## 3. FMG 世界地図との連携（データ受け渡し）

FMG は既に **per-burg 立地サーベイ** `BurgSiteDescriptor` を出力する（`src/services/burgSiteDescriptor.ts`、
`window.fmg.actions.getBurgSiteDescriptor(burgId)`、Burg エディタの Copy ボタン。契約: `docs/plan/city-generator/v2/13-fmg-site-input.md`）。
これがそのまま city ページの入力になる。

### 3.1 3 つの起動モード

| モード | 起動 | 入力 |
| -------- | ------ | ------ |
| **世界地図から** | Burg エディタの「都市生成ページを開く」ボタン | `sessionStorage['fmg.citySite']` に stash した descriptor JSON |
| **共有リンク** | `city/#<base64url(descriptor)>` | ハッシュから復元（heightfield 289 個等でサイズが問題なら圧縮） |
| **スタンドアロン** | `city/` を直接 or `city/?preset=largeCity&archetype=harbor&seed=abc` | `synthSite.ts` が合成 descriptor を捏造。world map をロードしない高速開発ループ |

- 別ドキュメント間・同一オリジンなので `sessionStorage` が最も素直（`window.open` でもタブ遷移でも残る）。
- city ページは FMG world コードを import しない。`BurgSiteDescriptor` の**型だけ**をコピーして持つ
  （`version` フィールドで不整合を検出）。

### 3.2 descriptor → `draft.md` 各ステップの対応

| draft.md ステップ | 使うフィールド |
| ------------------- | --------------- |
| 領域サイズ（縦×横） | `frame.extentMeters`, `frame.cityRadiusMeters`, `burg.population` |
| 海岸線・海セル | `waterbody`（`kind` / `shoreAzimuthDeg` / `shoreline[]`）、`terrain.heightfield.waterMask` |
| 河川・河セル | `rivers[]`（`segments[]` 中心線 + 各点 `widthsMeters` / `axisAzimuthDeg` / `cityBank` / `crossesSite` / `throughBurgCell`） |
| 市街セル | `frame.cityRadiusMeters`, `roads[].entryAzimuthDeg`（門方位）, `burg.walls` / `citadel` / `plaza` |
| 決定論シード | `burg.seed`（watabou プレビューと共有） |

座標系は descriptor のローカル系（原点 = burg 位置、+X 東 / +Y 北、単位 m）をそのまま採用。

---

## 4. 生成パイプライン（`draft.md` の 5 ステップの具体化）

### 4.1 設計原則（`TownGeneratorTS/docs/temp/0827.md` の診断より）

> 過去の river 導入失敗の根本原因は「河川がセル構造と独立した別座標系の滑らかな曲線として存在し、
> それを事後的にセル・城壁と整合させようとした」こと。新しい辺・新しい seed のたびに同種の不整合が
> 再発した。

**採用する解（案 1 / ハイブリッド）:**

1. **セル格子が唯一の真実源。** 頂点・辺・セルからなる 1 つのグラフだけで都市を表す。
   海は**セルのタグ**、河川は**セル辺に沿ったパス**として表現する。曲線に事後追従させる
   コードは書かない。
2. **河川は街路と同じグラフ上の「幅広の道」。**（`TownGeneratorTS` upstream / クローズド版の
   観測 ── 変形ブラシで動かせる頂点座標を辿ると、河川は街路と同じ頂点・辺で構成され、
   幅の広い道として描かれている。別座標系の水面ポリゴンではない。）
   descriptor 由来の滑らかな中心線は 2 用途のみ:
   - (a) **どのセル辺の連なりを river パスにするか**の選定ガイド
   - (b) 最前面に重ねる**装飾用の水面ストローク**（パスに沿って太く描くだけ。セル構造から
     独立したポリゴンは作らない）
3. ギザギザ感は、river パス頂点／境界セルへの**近傍多数決スムージング**（`smoothVertex` 相当）で
   緩和する。
4. 川が市街を分断するケースは「セル隣接グラフを river パスの辺で切ると land セルが 2 連結成分に
   割れる」→ 後段で **2 本の独立した城壁ループ**として自然に扱える（無理に 1 本のギャップ付き
   城壁にしない）。
5. 城壁・街区・建物のセットバックは「river パス = 幅広の通り」として**街道と同一ロジック**で
   処理する。河川専用のクリッピング機構は持たない。

### 4.2 ステージ

いずれも決定論。各ステージ終了時に不変コピーを `steps[]` へ push する。

#### S0 — 領域とグリッド

1. 窓 = `frame.extentMeters` の正方形。
2. セル数 `N ≈ (extentMeters / targetCellSize)²`、`targetCellSize ≈ cityRadiusMeters / 8〜12`。
3. 母点を散布（spiral / Poisson blue-noise ── §7 未決）。Lloyd 緩和 2–3 回で均質化。
4. `voronoi.ts` で構築 → `Cell { id, site, polygon, centroid, neighbors[], onBorder }`。
5. 「Grid evolution」スライダーはこの前段（初期 Voronoi → 各 Lloyd → 確定格子）の可視化。

#### S1 — 海/陸分類（`waterbody == null` ならスキップ、海セルなし）

1. 海岸線を用意：`waterbody.shoreline` があればそれ（ローカル m）。無ければ `shoreAzimuthDeg` に
   垂直で、水側に距離 `cityRadiusMeters × (0.8〜1.3)` の緩く蛇行する線を合成。
2. 各セル重心が海岸線の**水側半平面**なら `sea`、他 `land`。
3. 近傍多数決を 1–2 パス（sliver 除去）。

#### S2 — 河川パス（セル辺に沿った幅広の道）

1. `crossesSite || throughBurgCell` の各 `rivers[i]` について `segments[]` 中心線（既にローカル m・
   FMG 側で蛇行済み）を取得。
2. 中心線に最も近い**セル辺の連なり**をグラフ探索で選び（各中心線点に最近傍の辺を割り当て、
   隣接する辺どうしを頂点で連結）、`riverPath: Vertex[]` を得る。これは street グラフと
   同じ頂点・辺の上にある。
3. river パスの各セグメントに `widthMeters`（`segments[].widthsMeters` の対応値）を持たせる。
   描画・セットバックはこの幅で「幅広の通り」として扱う（S5 / §5）。
4. FMG セル解像度未満の蛇行ディテールを river パス頂点に足してよいが、**弦位置（offsetRatio）・
   流向（axisAzimuthDeg）・岸（cityBank）は descriptor のまま変えない**。
5. 派生タグ（任意・後段の便宜）:
   - `water`: 重心が river パスから `widthMeters/2` 以内のセル → 建物を建てない（`smoothVertex` 相当で
     境界を均す）。
   - 岸（bank）: セル隣接グラフから river パスの辺を除去 → land セルの連結成分。`cityBank` 側が
     主市街。

#### S3 — 市街セル

1. `land`（非 `water` / 非 `sea`）かつ `cityBank` 側の連結成分の中心セルから外向きに flood-fill。
2. 受理条件：重心が `cityRadiusMeters` 内。かつ `roads[].entryAzimuthDeg` 方向のセルに
   ボーナス（市街が門まで届くように）。river パスを渡る橋のたもとセルにもボーナス。
3. 人口由来の目標セル数で停止。`urban` タグ、残りは `outskirts` / `rural`。

**S4 以降（`draft.md` の範囲外・別途設計）**
城壁 = `urban` セル集合の外周（`findCircumference` 相当のセル境界一周。river が市街を割るなら
成分ごとに 1 ループ）。門 = `roads` の `entryAzimuthDeg` が外周と交わる位置。街区・建物はさらに
後段。生成後の**頂点変形ブラシ**（クローズド版にある、緑=ブラシ半径・赤=対象頂点の編集 UI）も
この統一グラフ表現なら後付けしやすい ── ただし本設計の対象外。

### 4.3 スナップショットとスライダー

```ts
interface Snapshot {
  label: string;                                   // "S1 海/陸" 等
  cells: { polygon: [number, number][]; tag: CellTag }[];
  paths: { kind: 'river' | 'street' | 'road'; points: [number, number][]; widths: number[] }[];
  overlays: { kind: 'riverWater' | 'shoreline' | 'gateBearing'; points: [number, number][] }[];
}
```

UI の進行スライダーと First / Prev / Next / Last が、対応する `<g>` の `display` を切り替える
（`draft.md` SS と同じ挙動）。「Grid evolution」は S0 前段専用の別スライダー。

---

## 5. 描画（SVG）

`render/svg.ts` は 1 つの `<svg>` に、Snapshot ごとの `<g>` を積む。

- 各 `<g>`：tag 別に着色した `<path>` セルポリゴン + パス + オーバーレイ。
- **パスは「線」でなく「幅広の帯」で描く**（`widths` に従う）。river は最も太く、
  濃色アウトライン + 明色の内側の 2 ストローク（`city-generation-and-rendering.md` §3.2 の
  街道と同じ二重線方式を、幅を上げて水面に流用）。street / road も同方式で幅だけ変える。
- pan / zoom はルート `<g>` の `transform` を更新。
- 純関数 `(GenerationResult) → SVGElement`。外部依存なし。

---

## 6. FMG 本体への変更点（最小・追加のみ）

| ファイル | 変更 |
| ---------- | ------ |
| `vite.config.ts` | `build.rollupOptions.input` に `main` / `city` を追加（§1.2） |
| Burg エディタ（`src/ui/dialogs/BurgEditorDialog.tsx` 付近） | 「都市生成ページを開く」ボタン。`getBurgSiteDescriptor(id)` を `sessionStorage['fmg.citySite']` に置き、`window.open(new URL('city/', import.meta.env.BASE_URL))` |
| `netlify.toml` | `/city/*` の除外リダイレクト（Netlify 配布時のみ） |
| `main.ts` / `app.ts` | **変更なし**（world app は `city-generator/` を import しない） |

---

## 7. 実装マイルストーン

| M | 内容 | 検証 |
| --- | ------ | ------ |
| **M0 ✅** | MPA スキャフォールド（`src/city/index.html` + `main.ts`、`src/city-generator/ui/CityGeneratorPage.ts` プレースホルダ、`vite.config.ts` に `rollupOptions.input`、`LICENSE-NOTE.md`） | `tsc` 0、`npm run dev` で `/city/` が 200 + プレースホルダ描画（console エラー無し）、`npm run build` が `dist/index.html` と `dist/city/index.html` を出力。city エントリチャンク = 531 B、world バンドルからの import 0（完全分離）。biome / lint:legacy クリーン |
| M1 | S0 グリッド + SVG 描画 + Grid evolution スライダー（スタンドアロン・preset のみ） | 同一 seed で同一格子、Lloyd 各段が可視 |
| M2 | S1 海/陸 + S2 河川 + S3 市街 + 進行スライダー（`synthSite` 入力） | archetype 4 種の合成 descriptor で破綻なし、岸/弦位置が保存される |
| M3 | FMG descriptor 取り込み（sessionStorage handoff + Burg エディタボタン） | 世界地図の複数 burg で「地図にはまる」ことを目視 |
| M4 | 城壁・門（S4） | `draft.md` 範囲外・別 PR |

---

## 8. 未決事項

1. 母点散布：spiral（TownGenerator 系）か Poisson blue-noise か。
2. UI シェルをバニラ DOM のまま進めるか、早めに React 化するか。
3. 共有リンク（`city/#…`）で descriptor 圧縮が要るか（heightfield 17×17 のサイズ次第）。
4. fixture の初期セット（どの実 burg をサンプル化するか）。
5. `BurgSiteDescriptor` 型：city 側にコピーを持つ（推奨・完全デカップル）か、`import type` で
   FMG service を型参照するか。
