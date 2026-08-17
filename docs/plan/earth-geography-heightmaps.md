# 公開地理データに基づく実在地形 heightmap

| 項目 | 内容 |
| :--- | :--- |
| Status | Phase 0–2 implemented (2026-08-18). Phase 3 in progress: `japan`, `britain`, `mediterranean-sea`, and `europe-central` Earth regions added. atlantics 等は未着手。PNG 経路は他 id とユーザー投入用に残存 |
| Parent | なし |
| Related | [`../map-initialization-process.md`](../map-initialization-process.md)、[`src/generators/heightmap-generator.ts`](../../src/generators/heightmap-generator.ts)、[`src/data/precreated-heightmaps.ts`](../../src/data/precreated-heightmaps.ts)、[`src/data/earthConfig.ts`](../../src/data/earthConfig.ts)、[`public/heightmaps/import-rules.txt`](../../public/heightmaps/import-rules.txt)、日本パッチ [`../../scripts/patchEastAsiaJapan.mjs`](../../scripts/patchEastAsiaJapan.mjs) |
| Scope | precreated heightmap（`east-asia` など実在地域のカタログ）を、「Heightmapper のスクショ PNG を世界とみなす」経路から、「公開 DEM ＋ 陸海ベクトルをセル中心でサンプルする」経路へ置き換える設計。手続生成テンプレ（Archipelago / Pangea 等）は対象外 |

---

## 0. 結論

現行の precreated heightmap は、公開されている現実地理をセル世界へ写す最善の方法ではない。

今の経路は **レンダラ向けの絵をあとから世界にする**。Heightmapper の画面を PNG に焼き、実行時にグリッドへ引き伸ばし、明るさ 1 本で陸/海と標高を同時に決める。測地・位相・気候はここで落ちる。関東平野が海になる、瀬戸内・津軽が埋まる、朝鮮は綺麗で日本だけ崩れる、東アジアを選んでも気温帯が別の緯度に乗る、は個別バグではなくこの契約の症状である。

置き換える契約は次の 2 点だけである。

1. カタログを `{ png }` から `{ bbox, crs, landMask, dem, climateAnchor }` にする。
2. 高さエンコードを「明るさ 1 本」から「`land` ビット ＋ 標高」にする。

手続生成テンプレと、PNG をプレビュー用サムネイルとして残すことは変えない。文化・国家・交易の手続生成も変えない。変えるのは **実在地形モードの入力と、グリッドへの載せ方** である。

この 2 点が無い限り、PNG をいくら正確な GeoJSON で塗り直しても、`fromPrecreated()` の縮小としきい値が同じ事故を繰り返す。日本パッチ（マスク、海峡の意図的な拡張、`SAFE_LAND_GRAY`、connectivity テスト）は、そのローダを前提にした後付け補正であり、本設計が入れ替われば不要になる。

---

## 1. 背景

### 1.1 やりたいこと

公開されている MIT / パブリックドメインの地理データ（DEM と海岸線）から、東アジアや日本のような **実在地形に近似した地図** を生成したい。ファンタジーの「地球風」ではなく、陸の形・平野・海峡・気候帯が、選んだ地球上の範囲と一致すること。

### 1.2 いま起きていること

`east-asia` を例にすると:

- 入力は `public/heightmaps/east-asia.png`（400×256 グレースケール）。CRS も経緯度も無い。
- Heightmapper（min -500 m / max 2000 m）のスクショを縮小したものである。海面 0 m はほぼ gray 51 = `IMAGE_WATER_THRESHOLD` 0.2 に落ちる。
- `fromPrecreated()` がこの PNG を `cellsX × cellsY` に `drawImage` し、明るさで `grid.cells.h` を決める。`h ≥ 20` が陸。
- 関東・濃尾・大阪のような平野は地理的には陸でも、明るさでは海になる。
- 瀬戸内・津軽・関門は PNG 縮小とローダの二段ダウンサンプルで隣の陸と混ざる。
- 現行 `defineMapSize()` はテンプレート固有の経緯度を持たない。旧 `public/main.js` の `east-asia → [11, 28, 9.4]` は TypeScript 化で落ちている。気候はロックしなければ乱数。

日本だけ GeoJSON と DEM で塗り直す作業は、このローダに合わせて溝を太くし平野を底上げする方向に収束した。それは対症療法であり、カタログ全体（britain、mediterranean-sea、world 等）にはスケールしない。

---

## 2. 現行プロセス

### 2.1 オフライン（人手）

`public/heightmaps/import-rules.txt` の手順:

1. [Tangrams Heightmapper](https://tangrams.github.io/heightmapper) を開く
2. auto-exposure を切る
3. max elevation 2000、min elevation -500
4. 範囲を探す
5. 画像を書き出す
6. 500×300 px 程度に縮小する（高解像度は使われない、と明記されている）

成果物は `public/heightmaps/{id}.png`。カタログ [`src/data/precreated-heightmaps.ts`](../../src/data/precreated-heightmaps.ts) は `id` と表示名だけを持つ。

### 2.2 実行時

[`docs/map-initialization-process.md`](../map-initialization-process.md) および `runGeneratePipeline()`:

```
generateGrid()
HeightmapGenerator.generate()
  └─ id が heightmapTemplates に無い
       → fromPrecreated(graph, id)
            PNG を cellsX×cellsY に drawImage
            getHeightsFromImageData()
              lightness < 0.2 → 海 (h 0–20)
              lightness ≥ 0.2 → 0.8 乗で陸 (h 20–100)
Features.markupGrid()          // h ≥ 20 が陸
addLakesInDeepDepressions()
openNearSeaLakes()
reGraph()
defineMapSize()                // mapSize 既定 12.9%、lat/lon は乱数
calculateMapCoordinates()
calculateTemperatures()
generatePrecipitation()
Rivers / Biomes / Cultures / States / …
```

`fromPrecreated()` はセル中心の経緯度を知らない。画像の画素行をグリッド行だと思っている。

### 2.3 現行が最適化しているもの

- ファンタジー地形との見た目の統一（同じ 0–100 の `h`）
- カタログ追加の手軽さ（スクショ 1 枚）
- ランタイムの依存ゼロ（PNG 以外を読まない）

実在地形の位相・測地・平野は最適化対象ではない。

---

## 3. 目標と非目標

### 3.1 目標

- 公開 DEM と陸海ベクトルから、選んだ地球範囲の近似地図をセル世界へ載せる。
- 陸/海と標高を分離する。標高 0 m の平野は陸のまま残る。
- 残すべき海峡・島を、セル数（points）が変わっても位相として保証できる。
- 気候・距離尺度が、その heightmap が表す地球上の範囲と一致する。
- 再現可能である（データ版＋ bbox ＋投影で同じ入力を再生成できる）。
- 既存の手続生成テンプレ、保存地図、`h` 0–100 契約、4 層アーキテクチャを壊さない。

### 3.2 非目標

- 手続生成テンプレ（Hill / Pit / Range や Archipelago 等）の廃止。
- SVG / WebGL レンダラの変更。入力は今まで通り `grid.cells.h` と pack である。
- 文化・国家・都市名・交易を実在のそれに固定すること。地形と気候が合ったあとの世界は、従来どおり手続生成してよい。
- 画素単位で地球と一致する地図。セル一般化は必ず情報を落とす。落とすものを明示するのが本設計である。
- 初回から Worker / SharedArrayBuffer / 全球リアルタイムストリーミング。
- OSM（ODbL）など、MIT / パブリックドメイン以外のデータをバンドルすること。

---

## 4. 理想アーキテクチャ

世界の座標が先で、絵は結果である。

```
[オフライン・再現可能なビルド]
  公開データ
    DEM:     GMTED2010 / SRTM / ETOPO（パブリックドメイン）
    陸海:    Natural Earth 10m land / admin-0、または GSHHG
    任意:    湖・主要河川（Natural Earth rivers, lakes）
  マニフェスト EarthRegion
    crs, west, east, south, north, projection
    climateAnchor { mapSize, latitude, longitude }
    topology { keepStraits, minIslandAreaKm2 }
  成果物
    ランタイムが読む DEM ＋ マスク（またはセル生成時にサンプルするソース）
    PNG はプレビュー用サムネイルのみ

[実行時]
  generateGrid()                         // 現行どおり点群＋Voronoi
  各セル中心 (x, y) → マニフェストで lon/lat
  land = ベクトルマスク（標高と独立）
  z    = DEM（陸なら標高 m、海なら水深 m）
  位相の一般化
    最小島面積、残す海峡をセル幅で保証
  エンコード
    海: h = 0–19（水深）
    陸: h = 20 + f(標高)                 // 0 m 平野も陸
  defineMapSize / calculateMapCoordinates
    climateAnchor を使う（乱数で上書きしない）
  河川は DEM 流下。任意で実河川ベクトルを種にする
  以降は現行の手続生成
```

中核は **「陸かどうか」と「どれだけ高いか」を別チャネルにすること** である。

---

## 5. 工程比較

| 工程 | 現行 | 本設計 |
| :--- | :--- | :--- |
| 入力 | Heightmapper の画面キャプチャ | CRS 付き DEM ＋ 陸海ポリゴン |
| 範囲の定義 | 人間が画面を切り、縮小する | 経緯度 bbox と投影をマニフェストに書く |
| リポジトリ上の表現 | 400×256 前後の PNG。地理メタデータなし | 地理データ＋マニフェスト。PNG は見本 |
| グリッドへの載せ方 | 画像をセル数に引き伸ばす | セル中心の lon/lat でサンプル |
| 陸/海 | 明るさ 0.2 | ベクトルマスク。標高 0 m でも陸 |
| 標高 | 明るさのべき乗 → 0–100 | 実標高を 20–100 に写像。海は別 |
| 海峡・離島 | 画素が残れば残る。細かい points で消える | 残す位相を先に決め、セル幅で保証する |
| 気候・距離 | テンプレと非連動。緯度は乱数 | マニフェストの緯度経度を使う |
| 河川 | 粗い DEM を下るだけ | DEM 流下。任意で実河川を種にする |
| 日本パッチのような後処理 | ローダに合わせて溝を太くし、平野を底上げする | 不要。マスクとサンプルが先にある |
| 再現性 | スクショ手順に依存 | データ版＋bbox＋投影で再生成できる |
| 向いている目的 | ファンタジーの「地球風」地形 | 公開データに近似した実在地形 |

---

## 6. データ契約

### 6.1 `EarthRegion` マニフェスト

`src/data/precreated-heightmaps.ts` を拡張する。手続生成テンプレは今の `heightmapTemplates` のまま。

```ts
export interface EarthRegion {
  id: string;
  name: string;
  /** WGS84 の経度緯度。west < east、south < north。180° 横断は初回対象外 */
  west: number;
  east: number;
  south: number;
  north: number;
  /** 初回は equirectangular。Web Mercator は Heightmapper 互換のために残してよい */
  projection: "equirectangular" | "webMercator";
  /** defineMapSize / calculateMapCoordinates が読む地球上の位置 */
  climateAnchor: {
    mapSize: number;
    latitude: number;
    longitude: number;
  };
  landMask: { type: "geojson"; path: string };
  dem: { type: "terrarium-tiles" | "geotiff"; path: string };
  topology?: {
    /** 残すべき海峡。セル幅で最低 1 セルの海を保証する */
    keepStraits?: Array<{ name: string; a: [number, number]; b: [number, number] }>;
    minIslandAreaKm2?: number;
  };
  /** 選択 UI 用。生成には使わない */
  previewPng?: string;
}
```

旧 PNG カタログは残す。`fromPrecreated(id)` は、`id` が `EarthRegion` なら新経路、そうでなければ現行 PNG 経路。段階移行できる。

`climateAnchor` の初期値は、旧 `public/main.js` の `getSizeAndLatitude()` を復元してよい。例: `east-asia → mapSize 11, latitude 28, longitude 9.4`。ただしこれは 0–100 のシフト値であり、現行 `calculateMapCoordinates()` の `latitude`（度）とは意味が違う。移行時に **地理中心緯度・経度へ変換してマニフェストに書く**。PNG の見た目 bbox と気候 bbox が一致していることを検証する。

### 6.2 高さエンコード

`HeightThreshold.WATER_MAX_HEIGHT`（20）と `heightToMeters()` / `depthToMeters()` は維持する。変えるのは **入力から `h` を作る写像** だけ。

| セル | 規則 |
| :--- | :--- |
| マスクが海 | `h = 0–19`。水深があるなら `depthToMeters` の逆。無ければ浅い海 18 付近 |
| マスクが陸、標高 z m | `h = max(20, encodeLandMeters(z))`。z = 0 でも陸 |
| マスクが陸、DEM 欠損 | `h = 20`（最低の陸）。海に落とさない |

`encodeLandMeters` は既存の `heightToMeters(h, heightExponent)` の逆関数にする。しきい値を `h` 生値に固定しない（[`harbor-siting.md`](./harbor-siting.md) §2.2 と同じ方針）。

これで `IMAGE_WATER_THRESHOLD` は Earth 経路では使わない。PNG 互換経路だけが残す。

### 6.3 ライセンス

バンドルしてよいデータはパブリックドメイン（または MIT）に限る。

| 用途 | 候補 | ライセンス |
| :--- | :--- | :--- |
| 海岸線・陸ポリゴン | Natural Earth 10m land / admin-0 | Public Domain |
| 全球〜地域 DEM | GMTED2010、ETOPO1/2022、SRTM | Public Domain |
| タイル配送 | AWS terrain terrarium（中身は GMTED / ETOPO） | ソースの PD を使う。配布物に attribution を残す |
| 使わない | OpenStreetMap、国土地理院の一部、GADM | ODbL / 政府標準利用規約 / 非 PD |

ソースと版は `public/heightmaps/sources/README.md`（または地域ごとの README）に残す。

---

## 7. ランタイム変更

### 7.1 新しい生成入口

`HeightmapGenerator.generate()` の分岐:

```
id ∈ heightmapTemplates        → fromTemplate()          // 現行
id ∈ earthRegions              → fromEarthRegion()       // 新規
それ以外（旧 PNG）             → fromPrecreated()        // 現行のまま残す
```

`fromEarthRegion(graph, region)`:

1. `graph.points[i] = [x, y]` をマニフェストで lon/lat にする。
2. 陸海マスクをその点で評価する（点-in-ポリゴン、または事前ラスタの最近傍）。
3. DEM をその点でサンプルする（バイリニア）。
4. §6.2 で `h[i]` を書く。
5. `topology.keepStraits` があれば、対応するセル列を海に落とす（最低 1 セル幅。points が細かいときは実幅に近づける）。
6. `minIslandAreaKm2` 未満の陸成分は落とすか、最寄り本土へ接続する（方針は地域マニフェスト）。

画像の `drawImage` は使わない。セル数（points）が変わっても、同じ lon/lat を読み直すだけである。

### 7.2 気候アンカー

`defineMapSize()` は、選択中の id が `EarthRegion` なら `climateAnchor` を書き、`latitude` / `longitude` / `mapSize` をロック相当として扱う（ユーザーが明示解除したときだけ上書き可）。

`calculateMapCoordinates()` の出力 `{ latN, latS, lonW, lonE }` は、マニフェストの bbox と一致するか、そこから導いた値でなければならない。東アジアの形に南半球の気温が乗る状態をやめる。

`distanceScale` は既にある `getEarthDistanceScale(mapSize, graphWidth)` を、アンカーの `mapSize` で計算する。

### 7.3 河川（Phase 3 以降、任意）

初回は現行の `Rivers.generate()` のままでよい。DEM が実地形なら、流下だけでも大河川の位置は近づく。

任意の次段:

- Natural Earth / HydroSHEDS の主要河川を種にし、DEM 上を流して pack の川にする。
- 種が無い谷は現行アルゴリズムに任せる。

これは地形ローダとは別 PR にする。

### 7.4 レイヤ所属

| モジュール | 層 |
| :--- | :--- |
| `src/data/earthRegions.ts`（マニフェスト） | State / データ |
| DEM・マスクの読み取り、`fromEarthRegion()` | Generator（`pack` / `grid` を書いてよい） |
| プレビュー PNG の描画 | Renderer（読むだけ） |
| Heightmap 選択 UI の Earth タブ | Editor / UI |

4 層ルールは変えない。Renderer が DEM を書いてはならない。

### 7.5 プレビュー UI

`HeightmapSelectionDialog` の precreated 一覧は残す。Earth 地域は同じカードでよく、プレビューは:

- 暫定: マニフェストの `previewPng`（今の PNG を流用）
- 本実装: `fromEarthRegion` を今のプレビュー用グリッドで走らせ、`drawHeights` する

ユーザーから見ると「Precreated」が「Earth regions」に名前が変わる程度でよい。

---

## 8. 位相の一般化

PNG に太い溝を塗ってダウンサンプルに賭けるのをやめる。残す位相はマニフェストに書く。

| 対象 | 規則 |
| :--- | :--- |
| 海峡（津軽、関門、瀬戸内の主要水道、ドーバー等） | 両岸の代表点を経度緯度で持ち、その線分上のセルを海にする。幅は `max(1, round(実幅 / セル幅))` |
| 最小島 | `minIslandAreaKm2` 未満は落とす。本州・四国のような名義島は面積に関係なく残す（明示リスト） |
| 湖 | 初回は DEM の窪み＋現行 `addLakesInDeepDepressions`。ベクトル湖は Phase 3 |
| points 変更 | 同じ lon/lat を再サンプルする。海峡幅はセル幅に再計算する |

`scripts/patchEastAsiaJapan.test-connectivity.mjs` が今やっている「全 points × アスペクトで四島が別成分」は、ローダ後処理の回帰ではなく、`fromEarthRegion` の仕様テストになる。

---

## 9. 段階計画

各 Phase は単独でマージ可能であること。PNG 経路を Phase 4 まで残す。

### Phase 0 — 契約と検証（実装をほとんど増やさない）

- `EarthRegion` 型と、east-asia のドラフトマニフェスト（bbox は画像から推定せず、意図する地球範囲を人が決める）。
- 現行 `fromPrecreated` ＋ しきい値を通した east-asia について、既知の失敗をテストとして固定する（関東が海、本州〜北海道が連結しうる、気候アンカーが無い）。
- 旧 `getSizeAndLatitude` の値を地理度へ変換する表を書く。

完了条件: 失敗がテストで見える。本番経路はまだ変えない。

### Phase 1 — サンプル経路の並行実装

- `fromEarthRegion()` を追加。east-asia だけ切り替える。
- 陸マスクは Natural Earth 10m。DEM は既に使っている GMTED/ETOPO（terrarium タイルでよい）。
- `climateAnchor` を `defineMapSize` に接続する。
- プレビューは既存 PNG のままでよい。

完了条件: east-asia で関東が陸、気候が東アジア、朝鮮・中国の質感が現行 PNG 経路から大きく壊れない。`fromPrecreated` は他 id で健在。

### Phase 2 — 位相保証

- `keepStraits` を east-asia（津軽、関門、豊後、鳴門、明石、来島）と britain（ドーバーは任意）に入れる。
- points 全段で名義島が別陸塊のままであるテストを、パッチスクリプトからジェネレータテストへ移す。
- 日本パッチ (`patchEastAsiaJapan.mjs` の本番依存) を east-asia から外す。PNG はプレビュー専用。

完了条件: 海峡テストが `HeightmapGenerator.fromEarthRegion` を直接叩く。パッチを回さなくても四島が分かれる。

### Phase 3 — カタログ展開と任意ハイドロ

- `japan` を追加済み。内容 bbox は黄海〜北海道北東（118.5–146.4°E, 29.9–46.6°N）。グラフをテンプレートの真の縦横比に合わせ、余ったウィンドウは領域外（黒）にする。陸マスクは枠内の島と隣接地を残す。
- `britain` を追加済み。内容 bbox はアイルランド西岸〜シェトランド（11.5°W–3.0°E, 49.0–61.7°N）。ドーバーに海路余白。枠内の隣接地（カレーなど）は残す。
- `mediterranean-sea` を追加済み。内容 bbox はジブラルタル〜レヴァント（7.0°W–36.8°E, 29.8–46.2°N）。ジブラルタル／メッシーナ／ボニファチオ／ダーダネルス／ボスポラスを海峡として残す。
- `europe-central` を追加済み。内容 bbox は海峡〜エルベ（1.8°W–14.8°E, 45.5–54.3°N）。北仏・低地・ラインの産業革命中核。ドーバーを海峡として残す。
- atlantics、iceland など、範囲が狭く検証しやすい id から `EarthRegion` 化する。
- world / world-from-pacific は投影（太平洋中心）が特殊なので後回し。
- 任意: 主要河川ベクトルを種にする。

### Phase 4 — PNG 経路の縮小

- Earth 化した id のフル解像度 PNG をリポジトリから外し、小さな preview だけ残す。
- `fromPrecreated` はユーザー投入 PNG と未移行 id の互換として残す。
- `IMAGE_WATER_THRESHOLD` は「ユーザー PNG 用」とドキュメントする。

---

## 10. テスト

| 種類 | 内容 |
| :--- | :--- |
| ユニット | lon/lat ↔ セル、`encodeLandMeters` 往復、0 m 陸が `h ≥ 20` |
| 位相 | east-asia で北海道・本州・四国・九州が、サポートする全 points で別連結成分 |
| 平野 | 関東・濃尾・大阪の代表点が陸 |
| 気候 | east-asia 生成後の `mapCoordinates` がマニフェスト bbox と一致。南半球に落ちない |
| 回帰 | 手続生成テンプレ数種のシード固定生成が変わらない |
| 互換 | 旧 PNG id とユーザー PNG が `fromPrecreated` のまま動く |
| E2E | Heightmap 選択で east-asia を選び、生成完了後に `window.fmg.world.pack` の日本付近セルが陸（ヘルパ経由） |

E2E は `WEBGL_MANAGED_SVG_LAYER_IDS` や overlay クリックの既存注意（`AGENTS.md` §5.1、§1.1）に従う。heightmap のアサーションは SVG 輪郭ではなく pack データで行う。

---

## 11. 日本パッチとの関係

`scripts/patchEastAsiaJapan.mjs` と `SAFE_LAND_GRAY` / `STRAIT_CUTS` は、本設計 Phase 2 完了まで east-asia の応急処置として残してよい。

本設計が入り次第:

- パッチは「EarthRegion ビルドの参考実装」として `scripts/` に残すか、削除する。
- connectivity テストの意図（四島分離、points 耐性）はジェネレータテストへ移す。
- `east-asia.png` を生成の正本にしない。

パッチをさらに複雑にして PNG 経路を延命しない。

---

## 12. リスクと判断

| リスク | 対応 |
| :--- | :--- |
| DEM ＋ マスクの容量 | 地域タイルだけを同梱するか、ビルドで切り出す。全球 GeoTIFF はリポジトリに置かない |
| 実行時のサンプルコスト | セル数は最大でも 10 万前後。点-in-ポリゴンはマスクを低解像度ラスタにしておけば足りる |
| 投影の食い違い | 初回は equirectangular に固定。Heightmapper 由来の歪みは捨てる |
| 旧セーブ | `.fmg` は生成済み `h` を持つ。ローダ変更は新規生成にしか効かない。互換問題は小さい |
| 「地球に見えすぎる」 | 文化・国境は手続生成のまま。地形だけ実在、政治はファンタジー、でよい |
| bbox の政治的解釈 | Natural Earth の admin-0 を使い、プロジェクトとしての解釈をマニフェストに 1 行書く |

---

## 13. 最初に切る実装

議論で固定した切れ目:

1. カタログを `{ png }` から `{ bbox, crs, landMask, dem, climateAnchor }` にする。
2. 高さエンコードを「明るさ 1 本」から「`land` ビット ＋ 標高」にする。

実装に入るときは Phase 0 の失敗テスト固定から始め、Phase 1 で east-asia だけ新経路に乗せる。
