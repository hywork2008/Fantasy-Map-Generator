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

大河・合流・都市窓外の下流海を扱う次段の契約と実装順は
[`water-context.md`](water-context.md) を正とする。v1 の単一 `waterbody` / 独立 river path は M3 時点の
実装であり、同文書の descriptor v2 導入まで拡張しない。

### 3.1 3 つの起動モード

| モード | 起動 | 入力 |
| -------- | ------ | ------ |
| **世界地図から** | Burg エディタの「都市生成ページを開く」ボタン | `sessionStorage['fmg.citySite']` に stash した descriptor JSON |
| **共有リンク** | `city/#<base64url(descriptor)>` | ハッシュから復元（heightfield 289 個等でサイズが問題なら圧縮） |
| **スタンドアロン** | `city/` を直接（UI で site を組み立て） | `synthSite.ts` が `SiteConfig` から合成 descriptor を捏造。world map をロードしない高速開発ループ |

- 別ドキュメント間・同一オリジンなので `sessionStorage` が最も素直（`window.open` でもタブ遷移でも残る）。
- city ページは FMG world コードを import しない。`BurgSiteDescriptor` の**型だけ**をコピーして持つ
  （`version` フィールドで不整合を検出）。
- **スタンドアロンの site は組み合わせ（M2.5）**: `SiteConfig = { coast: none|straight|bay|cape,
  rivers: RiverShape[]（0..2、shape ∈ through|beside|toCoast）, relief: boolean }`。archetype 排他は撤去。
  「harbor + river」「2 河川に挟まれた都市」「河口に達する川」等がすべて表現可能。実 FMG descriptor
  は元々この一般形（`rivers[]` 複数・`waterbody` と独立）なので M3 は配線のみ。

### 3.2 descriptor → `draft.md` 各ステップの対応

| draft.md ステップ | 使うフィールド |
| ------------------- | --------------- |
| 領域サイズ（縦×横） | `frame.extentMeters`, `frame.cityRadiusMeters`, `burg.population` |
| 海岸線・海セル | `waterbody`（`kind` / `shoreAzimuthDeg` / `shoreline[]`）、`terrain.heightfield.waterMask` |
| 河川・河セル | `rivers[]`（`segments[]` 中心線 + 各点 `widthsMeters` / `axisAzimuthDeg` / `cityBank` / `crossesSite` / `throughBurgCell`） |
| 市街セル | `frame.cityRadiusMeters`, `roads[].entryAzimuthDeg`（門方位）, `burg.walls` / `citadel` / `plaza` / `temple` / `port` / `shanty` — 割り当ては `burg-feature-options.md` |
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

#### 共通機構 — ボロノイ辺グラフの walk（`core/{edgeGraph,graphWalk}.ts`）

`TownGeneratorTS` の `Topology` + `buildStreets` に対応。海岸線も河川も**この同じ walk で形が決まる**:
descriptor が与えるのは**ラフなコリドー**（数点の制御点）だけで、細かい形は walk が出す。

1. **セル辺グラフ** `buildEdgeGraph`: 全セルポリゴン頂点を座標量子化（0.05 m）で dedup → ノード、
   セル辺 = 長さ重みエッジ。
2. **`walkGraph`**（バイアス付きランダムウォーク）: 各交差点で次の辺を
   `1.6·(進行方向との整合) + rng(0..wander) − corridorPull·(コリドーからの距離/セルサイズ)²` で選ぶ。
   `rng` 項が**分岐で行き先を散らす** ── 同じコリドー・別 seed で別ルート、出口も散る。
   `goal` は窓内にクランプ（窓外を狙うと maxSteps まで走る）。`stop(node)` で早期終了。

#### S1 — 海/陸分類（`classifySea.ts`、`waterbody == null` ならスキップ）

1. **海岸 = 独自の曲率中心をもつ大きな円弧**（`synthSite.synthCoast`）── 都心に合わせて曲げた線
   ではなく地形。都心は弧の**頂点ではなく側面**（apex 方向を海方位 ±55° ずらす）に、弧の上
   （or 0〜0.5R 内陸）に置く。「bay / cape」= **弧のどちら側が水か**:
   - **bay** = 曲率中心が水側、`Rc` ≈ 窓の 1.5〜4 倍 → 陸が水を抱く凹型海岸（大阪湾）。海は窓の
     ~4 割、都心は湾岸に。
   - **cape** = 曲率中心が陸側、`Rc` ≈ 窓の 0.4〜0.95 倍 → 陸が小さな円盤（岬）、周囲が海（~6 割）。
   - **straight** = `Rc` 巨大 → ほぼ直線。
2. コリドー（弧サンプル）を**レグごとに** `walkGraph`（`corridorPull 2.2`）。窓境界沿いに
   `shoreAzimuthDeg` 側を歩き戻って**水ポリゴン**に閉じる。重心が内なら `sea`。近傍多数決 1 パス。

#### S2 — 河川（`riverPath.ts` の `walkRiver`）

1. 河川コリドー（source→chord→mouth の 3 点）を `walkGraph`（`wander 0.5`, `corridorPull 4`）。
   結果 = **実在するセル頂点をセル辺でつないだ折れ線**（`edgePoints`）。
2. **海がある場合、`goal` を海岸線の少し沖（水ポリゴン内）に設定**（`seawardOf`）── そうしないと
   窓縁を狙って手前で止まり「海に届かない」。`synthSite` の `through`/`beside` は海がある時
   軸を `shoreAzimuthDeg` 寄りにして「内陸 → 都心 → 海」へ流す。
3. **`stop` = 水ポリゴン内**。`trimAtWater` は河口（最初の水没頂点）まで残す ── 河口は海岸線に
   接し、それより先へは伸びない。全区間が海上なら河川ごと drop。
4. `smoothPath`（窓平均 3 回）で均す = `RiverPath.points`。海に入る**内部**頂点は元の陸頂点へ
   スナップし戻す（河口頂点は残す）。幅は descriptor から各頂点へ再サンプル。
5. 分類（`classifyRiver`、`edgePoints` に対して）── **岸（bank）分割のみ**:
   - 河川はセル辺の帯として描くだけで、**セルに `water` タグは付けない**（辺に描いた河を
     セルの塗りで二重表現しても無意味なため。旧 `water` 集合は撤去）。
   - 岸（bank）: 重心リンクが**全河川の** `edgePoints` を跨ぐ隣接を切る → **原点を含む成分 = 0（主市街）**。
     「2 河川に挟まれた都市」= 原点が中央の細成分に落ちる。`cityBank` ヒューリスティックは撤去（M2.5）。

#### S3 — 市街セル（`classifyUrban.ts`）

1. `land`（非 `sea`）かつ原点成分の中心セルから外向きに flood-fill（river は bank 分割で
   越えられないので `water` 除外は不要）。
2. 受理条件：`reach(cell) < cityRadiusMeters`。`reach` は内陸なら円距離、**海岸がある場合は
   海岸線接線方向に伸びた楕円距離**（沿岸方向 1.9R、内陸方向 0.72R）── 海岸都市は帯状。
   `roads[].entryAzimuthDeg` 方向のセルにボーナス。
3. `urban` タグ、残りは `outskirts`（街道沿いリボン）/ `rural`。

#### S4 以降 — TownGeneratorTS 2.2–2.6 への対応

`~/Projects/TownGeneratorTS/docs/city-generation-and-rendering.md §2` の固定生成順に合わせる。
`docs/plan/city-generator/v2/` は **不採用**（Voronoi を禁じた失敗案）。参照してよいのは
TownGeneratorTS の `docs/**`（著者の記述）と公知アルゴリズムのみ。フラグ（`walls` / `citadel` /
`plaza` / `temple` / `port` / `shanty`）の割り当ては `docs/city-generator/burg-feature-options.md`。

| 本プロジェクト | TownGeneratorTS | 内容 |
| ---- | ---- | ---- |
| **S4 内周と門** | 2.2 `optimizeJunctions` + 2.3 `buildWalls` | `Cell.polygon` の近接頂点を統合（辺長 `< cellSize/6` を中点へ、共有参照を付け替え）。`urban` 集合を囲う単純閉ループ（エンベロープ）を作る。門 = descriptor `roads[].path`（無ければ `roads[].entryAzimuthDeg` レイ）がループと交わる点、本数を `suggestedGates` に合わせて頂点を微調整。`walls:true` ならループを描画壁 + 塔 + 水門に。`walls:false` でもループ・門・広場セル・城塞セルは必ず作る（S5 / S6 の前提）。**囲う形・海岸辺の扱い・壁線の規則性のオプション体系は `wall-patterns.md`**（`urban` をそのままなぞると凹んだ長い壁・海側の一様な壁になるため） |
| **S5 街路** | 2.4 `buildStreets` | `core/edgeGraph.ts` 上で門→広場を A\*（`streets`）、門方向の遠方ノード→門を街道（`roads`）。`tidyUpRoads` で辺に分解・つなぎ直して `arteries`、中間頂点を平滑化（端点＝門・交差は固定）。**市外 `roads` のみ二重線で描画。市内街路は描かず、S7 のセットバック隙間として現れる** |
| **S6 街区** | 2.5 `createWards` | 各 `urban` セルにワード型。城塞 = `Castle`、広場 = `Market`、門接 = `GateWard`、以降 `rateLocation`（`Cathedral` / `AdministrationWard` = 広場近く、`MerchantWard` = 中心近く、`Slum` = 中心から遠い…）、キューが尽きたら `Slum`。郊外は 20% で `Farm`、他は空 `Ward`（建物なし） |
| **S7 敷地** | 2.6 `buildGeometry` | 各セルを通りからのセットバック（壁沿い `MAIN_STREET/2`、動脈・広場沿い `MAIN_STREET/2`、市内 `REGULAR_STREET/2`、郊外 `ALLEY/2`）で inset → 凸は `shrink` / 凹は `buffer` → 地区ごとに再帰分割。**セル辺がここで街路として見える** |

生成後の**頂点変形ブラシ**（クローズド版にある、緑=ブラシ半径・赤=対象頂点の編集 UI）も
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
| `vite.config.ts` | `build.rollupOptions.input` に `main` / `city` を追加（§1.2）── M0 で実施済 |
| `src/ui/dialogs/BurgEditorDialog.tsx` | **M3 実施**: フッタに `#burgOpenCityGenerator`（`icon-sitemap`）ボタン。`#burgCopySiteDescriptor` の隣 |
| `src/controllers/burg-editor.ts` | **M3 実施**: `burgEditorActions.openCityGenerator()` ── `getBurgSiteDescriptor(id)` を `sessionStorage['fmg.citySite']` に置き `openURL(\`${import.meta.env.BASE_URL}city/\`)`。`window.open` は同一オリジン新規タブに sessionStorage をコピーするので burg ごとに独立、city タブ reload でも同 burg が残る（名前付きターゲットは再ナビゲーションで sessionStorage を再コピーしないため使わない） |
| `netlify.toml` | `/city/*` の除外リダイレクト（Netlify 配布時のみ）── 未実施 |
| `main.ts` / `app.ts` | **変更なし**（world app は `city-generator/` を import しない） |

---

## 7. 実装マイルストーン

| M | 内容 | 検証 |
| --- | ------ | ------ |
| **M0 ✅** | MPA スキャフォールド（`src/city/index.html` + `main.ts`、`src/city-generator/ui/CityGeneratorPage.ts` プレースホルダ、`vite.config.ts` に `rollupOptions.input`、`LICENSE-NOTE.md`） | `tsc` 0、`npm run dev` で `/city/` が 200 + プレースホルダ描画（console エラー無し）、`npm run build` が `dist/index.html` と `dist/city/index.html` を出力。city エントリチャンク = 531 B、world バンドルからの import 0（完全分離）。biome / lint:legacy クリーン |
| **M1 ✅** | S0 グリッド + SVG 描画 + Grid evolution スライダー（スタンドアロン・preset のみ）。`core/{types,prng,geom,voronoi,grid,pipeline}.ts`、`site/presets.ts`、`render/{palette,svg}.ts`、`ui/CityGeneratorPage.ts` 実装 | `tsc` 0、`vitest` 5/5（決定論・Lloyd 収束・非退化セル）、biome クリーン。ブラウザ実測: 同一 seed → 同一 SVG パス、scatter↔Lloyd3 が可視差、preset/seed/スライダー/pan-zoom 動作、console エラー無し。build: city payload 20 KB（city 9.4 + delaunator 8.2）、world/d3/three 参照 0 |
| **M2 ✅** | S1 海/陸 + S2 河川（**セル辺グラフ A\* + 平滑化 = `buildStreets` 手法**、`core/{edgeGraph,riverPath}.ts`）+ S3 市街 + 進行スライダー（`synthSite` 入力）。`core/{classifySea,classifyRiver,classifyUrban}.ts`、`site/{burgSiteDescriptor,synthSite,siteInput}.ts` 追加。`pipeline.ts` が S0→S3 を実行し `steps: Snapshot[]` を生成。`render/svg.ts` は grid 系 + step 系の 2 グループ。UI は Size/Site type ボタン + Stage スライダー + First/Prev/Next/Last | `tsc` 0、`vitest` 20/20（決定論、archetype 4 種 smoke、harbor は市街が海に非接触、riverCrossing は岸 >85%・弦位置 ±0.25R 保存 ×4 seed、**river パス頂点は実グラフノード + 連続ペアは実エッジ**、平滑ドリフト < 1 セル）、biome クリーン。ブラウザ実測: 河川がセル辺を辿る（240 頂点の折れ線）、4 archetype で S0→S3 描画、Stage/First-Last/Grid evolution 動作、console エラー無し。build: city payload 44 KB、world/d3/three 参照 0 |
| **M2.5 ✅** | サイト地形レイヤーの一般化（S4 が単一河川・2 値岸を前提にする前に）。archetype enum → `SiteConfig`（`site/siteConfig.ts`）。**S1/S2 を「ラフなコリドー → ボロノイ辺グラフの biased random walk」に全面移行**（`core/{graphWalk}.ts` 新設、`classifySea`/`riverPath` 書き換え）── 海岸線・河川の形がグラフ walk 由来になり、分岐で行き先が散る。**河川は水ポリゴンで stop**（海に入らない）。`classifyRiver` の岸分割を原点成分 = 0 に。Bay = 都心が湾の奥（凹の recess）、Cape = 都心が突端。`GenerationResult` に `shoreline`/`waterPolygon` 追加。UI = Coast/Rivers/River-shape/Relief/Randomize | `tsc` 0、`vitest` 45/45（マトリクス 24 combo×2 seed、河川頂点は水ポリゴン外、urban core は単一連結成分、seed 別に river ルートが散る、toCoast は海岸線到達で停止）、biome クリーン。ブラウザ実測: 海岸線が全域ギザギザ、河川が蛇行し海で止まる、Bay=recess / Cape=headland、seed で river 散る（107–142 頂点、maxSteps 到達なし）、console エラー無し。build: city payload 27.7 KB、world/d3/three 参照 0 |
| **M3 ✅** | FMG descriptor 取り込み。`site/incomingSite.ts`（`parseDescriptor` version チェック + base64url codec + `resolveIncomingSite`：hash payload > sessionStorage stash）。Burg エディタに「都市生成ページを開く」ボタン（`burgEditorActions.openCityGenerator` → `sessionStorage['fmg.citySite']` + `openURL(\`${BASE_URL}city/\`)`）。`CityGeneratorPage` に imported モード（geography = 実 descriptor 固定、seed のみ layout 再ロール、synth 系コントロール非表示、Imported-site 読み出し + Copy shareable link + Use standalone site）。共有リンク = `city/#<base64url(JSON)>`（実測 ~4 KB、圧縮不要）。`siteInput` に 2 つの実 descriptor 適応: (a) `waterbody` あるが `shoreline[]` 空（実 FMG が窓外海岸で出す）→ `shoreAzimuthDeg` から直線ラフ海岸を合成（landlocked にしない）、(b) `crossesSite:false` かつ `offsetRatio ≥ 1.6` の遠い川を drop（窓を埋める無関係な大河対策） | `tsc` 0、`vitest` 86/86（+ `incomingSite.test.ts` 15: codec round-trip・version 拒否・resolver 優先順位・decoded → pipeline urban core、+ `siteInput.test.ts` 6: 空 shoreline 合成海岸で sea セル発生・遠い川 drop）、biome / lint:legacy クリーン。ブラウザ実測: `window.open` 実経路で 4 archetype（harbor+大河 / dry crossroads / 2 河川 / 空 shoreline harbor → 合成海岸）が半径内に収まる、共有リンク round-trip（ラベルが "From shared link" に）、seed 再ロールで layout 変化・geography 固定、Use standalone で sessionStorage+hash クリア、console エラー無し。build: city payload 37 KB、world/d3/three 参照 0 |
| **M4a ✅** | `CityProgram` 配線（`core/types.ts` に `CityProgram`/`DEFAULT_PROGRAM`、`generateCity` 第 3 引数 = `program: CityProgram = DEFAULT_PROGRAM` + `siteInput.siteToProgram`（純パススルー）+ `SiteConfig.features: CityFeatureSet`（`Omit<CityProgram,"capital">`）+ `siteConfig.defaultFeatures`/`FEATURE_KEYS` + `synthSite` の population 捏造撤去 → `config.features` をそのまま `burg.*` へ）。UI = Options に Features トグル行（`FEATURE_KEYS` 6 個、synthOnly、Port は coast=none で disabled、coast 選択で port を true へ引き上げ）+ imported 読み出しに Walls/Citadel/Plaza·Temple/Port/Shanty 行。`pipeline.ts` は `program.walls` で `classifyUrban` 半径を `×WALLED_COMPACTION`(0.92)。**視覚変化なし**（`walls:true` で urban 集合が締まるのみ）。詳細 `burg-feature-options.md §10`。**設計との差分**: §3.2 の「`siteConfigKey()` に features を連結」は不採用 ── M4a では features は S0–S3 幾何に無影響で、key に入れると synth RNG stream（= S0–S3 回帰ネット）を無意味に攪乱するため。幾何効果を持つ機能が出たらその時 key に加える | `tsc` 0、`vitest` 98/98（`core/program.test.ts` 4: program 全 false ≡ 無指定でバイト一致 ×3 config×2 seed、`walls:true` で urban が厳密部分集合かつ小さく ×3×3、`citadel`/`plaza`/`temple`/`port`/`shanty`/`capital` は S3 出力に無影響、(params,geo,program) 決定論。`site/siteConfig.test.ts` 6: `defaultFeatures` の population スケール・`randomSiteConfig` の features roll 全 6 フラグ両値・landlocked は port を振らない・key は features 非依存。`site/siteInput.test.ts` +2: `siteToProgram` verbatim パススルー）、biome / lint:legacy クリーン。ブラウザ実測（dev 実経路）: 標準モードで Features 行が population 由来の初期状態（Walls/Plaza/Temple/Shanty on）、トグルで再生成（seed 再ロール + SVG 変化）、Bay 選択で Port が enabled + active、None 復帰で Port disabled、imported（sessionStorage stash）で Features 行非表示・読み出しに descriptor のフラグ 5 行が正しく出る・Use standalone で復帰、console エラー無し。build: city payload 38.5 KB（M3 37 KB から +1.5）、world/d3/three 参照 0 |
| **M4b** | S4 内周と門（TownGeneratorTS 2.2–2.3、§4.2）── `optimizeJunctions` 移植 + `border` ループ + 門 + `walls:true` の描画壁・塔・水門 + `plaza` セル + `citadel` セル。Snapshot `S4 · 内周と門` | `tsc` 0、`vitest`（`border` は単純閉曲線・`urban` を内包、門数 = `suggestedGates`、河川分断で成分ごとに 1 ループ、`plaza`≠`citadel` セル、`citadel` は `border` 隣接 & 原点から ≥0.15R、`walls:false` で描画壁 Overlay なし、シード安定）、ブラウザ（4 archetype で壁・門・城塞が妥当、`walls` トグルで壁が出入り） |
| **M5 ✅** | S5 街路（TownGeneratorTS 2.4、§4.2）── `core/streets.ts` 新設。`buildEdgeGraph(interiorCells)` 上の A\* で `門 → 広場頂点`（広場が無ければ原点）の **streets**、`門方向の窓縁 → 門` の **roads**。マスクは TownGenerator の `Topology` に倣い **ノード集合**で: streets は `urban` セル頂点のみ通行可（`borderNodes` は 1.6× ペナルティで通常は内側を通り、棘状の門でのみ壁沿い）＋城塞ポリゴン内は不可、roads は非 `urban` 頂点のみ（門頂点は urban と共有され A\* が剥がれないので窓縁→門前エプロン＝門から `1.2·cellSize` 外の非 urban ノードまで引き、最後に門への短い放射スタブを付ける）。`tidyUpRoads`（`streets.ts`、辺分解→広場辺 drop→非 degree-2 で分割→`smoothPath(_,2)` で端点固定平滑化）で `arteries`。`GenerationResult.streets: StreetNetwork {streets,roads,arteries}`。Snapshot `S5 · Streets` は S4 のオーバーレイ（壁・塔・城塞リング・門）を引き継ぎ **roads のみ** paths に追加。`render/svg.ts` `roadStroke` = `ROAD.casing`/`ROAD.fill` の二重線。**市内 streets は描かない**（S7 のセットバック隙間として現れる）。§4.2 の「城門→城塞への専用街路」は S4 に城門が無いため見送り（M4b.1／M6 で城門と同時に）。決定論・RNG 不使用（synth stream 不攪乱） | `tsc` 0、`vitest` 139/139（`streets.test.ts` 7: 全門から広場へ streets が通る、streets は壁を越えず城塞リング内に入らない、roads は非 urban を通り窓縁→陸門、決定論、S5 paths は road のみで street 無し、`tidyUpRoads` の Y 分岐分割＋端点保存＋中間平滑化＋広場辺 drop。`pipeline.test.ts`／`synthSite.matrix.test.ts` を 6 ステップへ更新）、biome / lint:legacy クリーン。ブラウザ実測（dev、standalone smallCity）: S5 で 5 陸門から二重線 roads が窓縁まで放射、S4↔S5 で roads が出入り、壁・塔・門・広場は継続表示、Prev/Next・Stage スライダー動作、console エラー無し。build: city チャンク 74.9 KB raw / 26.7 KB gzip（M4b から +8.5 KB）、world/d3/three 参照 0 |
| **M6 ✅** | S6 街区（TownGeneratorTS 2.5、§4.2）── `core/wards.ts` 新設。各 `urban` セルにワード型（城塞 = `Castle`、広場 = `Market`、門接 = `GateWard`、以降 `rateLocation`：Cathedral / Administration は広場近傍、Merchant は中心近く、Slum は中心から遠い。TownGenerator の ~36 区画キューを格子の都市セル数まで繰り返す。尽き余りは `Slum`）。郊外 20% `Farm`（コンパクト時）、他は空 `Ward`。`temple` → `Precinct{temple}` + Cathedral、`port` → `Precinct{harbor}` + `Overlay{quay}`（`waterbody` 必須、無ければ `console.warn`）、`shanty` → `CellTag "shanty"` かつ `WardKind "shanty"` を `border` 外側 3–6 セル（§12.2 は CellTag 採用）。Snapshot `S6 · Wards` は S4 家具 + S5 roads を引き継ぎ、セルをワード色で塗る。決定論（`${seed}:program:wards` / `temple` / `shanty`） | `tsc` 0、`vitest` 145/145（`wards.test.ts` 8: Castle/Market、Cathedral は広場近傍・別セル、Slum 平均距離 > Merchant、harbor は waterbody 必須・海隣接 + quay、shanty は border 外 3–6、フラグ off で非配置、決定論、S6 が最終ステップ。`pipeline.test.ts`／`synthSite.matrix.test.ts` を 7 ステップへ更新）、biome クリーン。ブラウザ実測（dev、standalone smallCity）: 既定が S6 · Wards、ワード色 + Temple/Plaza precinct、Inspector に `ward`、S5↔S6 でワードが出入り（S5 は roads 5 本・ward 無し）、Bay で Harbour + quay、console エラー無し。build: city チャンク 83.3 KB raw / 29.3 KB gzip（M5 から +8.4 KB）、world/d3/three 参照 0 |
| **M7** | S7 敷地（TownGeneratorTS 2.6、§4.2）── セットバック inset → セル辺が街路化、地区ごと再帰分割、建物ポリゴン | `tsc` 0、`vitest`（セットバック距離が辺種別どおり、凸 / 凹で shrink / buffer、空 Ward は建物なし）、ブラウザ（羊皮紙地図として town に見える） |

---

## 8. 未決事項

1. ~~母点散布~~ → **決定（M1）**: ジッタ付き格子 + Lloyd 緩和 3 回（`core/grid.ts`）。spiral は
   放射状に密度が偏るため不採用。
2. UI シェルをバニラ DOM のまま進めるか、早めに React 化するか。→ M1 はバニラで着地。継続。
3. **セル密度**: `siteToParams` は `cellSize ≈ cityRadius/9` × 窓 `6×radius` で総 ~2900 セル。
   分類は問題なく機能するが窓外縁は依然過密。S4（城壁）着手時に窓外縁を粗くするか判断。
4. **S3 市街の形**: `GATE_PULL`（門方位のセルにコスト -0.35R）で市街が門へ触手状に伸びる。
   design 意図どおりだが細く不自然。S4 で城壁クリップ後に再評価。
5. ~~S2 の river パス~~ → **完了（M2、§4.2 S2 どおり）**: `core/edgeGraph.ts`（セル辺グラフ +
   A\* + `smoothPath`）+ `core/riverPath.ts`。河川は descriptor 中心線ではなく**実セル辺の折れ線**を
   平滑化したもの。`water`/岸分割もこの on-edge パスに対して算出。S4 の城壁はこの同じグラフを使う。
6. ~~`BurgSiteDescriptor` 型~~ → **決定（M2）**: city 側に型のみコピー（`site/burgSiteDescriptor.ts`、
   `DESCRIPTOR_VERSION` 付き）。
7. ~~`presets.ts` の置き換え~~ → **完了（M2）**: `presets.ts` は list のみ。
   `synthSite.ts`（preset+archetype → descriptor）+ `siteInput.ts`（descriptor → params/geography）。
8. ~~共有リンク（`city/#…`）で descriptor 圧縮~~ → **不要（M3）**: 実 descriptor JSON は ~3 KB
   （heightfield 17×17 の elevations は同値連続で JSON 化が短い）、base64url で ~4 KB。生の
   `#<base64url(JSON)>` で十分。
9. fixture の初期セット（どの実 burg をサンプル化するか）。M3 のブラウザ実測で使ったのは harbor /
   dry crossroads / 2 河川 inland / 空 shoreline harbor の 4 パターン。
10. **実 descriptor の river 幅**: FMG `widthMeters` は実寸（大河で 1〜2 km）。`crossesSite` する
    川がこの幅だと窓を覆う。M3 は「遠い非交差の川を drop」で最悪ケースだけ回避。交差する
    大河の描画幅クランプ（`render/svg.ts` の帯幅 or `siteInput` の widths 上限）は S4/描画調整で。
11. **imported モードの seed 初期値**: `descriptor.burg.seed`（watabou プレビュー共有）。UI から
    burg 本来の seed に戻すボタンは未実装（再入力 or Use standalone → 戻る、で代替可）。
