# アルプス周辺の実在DEMと3D地形タイル

| 項目 | 内容 |
| :--- | :--- |
| Status | A0〜A3 済み（2026-11-18）。全域は Terrarium、細かい段はスイス（swissALTI3D）だけで始める |
| Parent | [`japan-terrain-tiles.md`](./japan-terrain-tiles.md) |
| Related | [`japan-local-war-terrain.md`](./japan-local-war-terrain.md)、[`fmg-cell-valleys.md`](./fmg-cell-valleys.md)、[`earth-geography-heightmaps.md`](./earth-geography-heightmaps.md)、[`../../scripts/bakeEarthTiles.mjs`](../../scripts/bakeEarthTiles.mjs)、[`../../src/data/earthRegions.ts`](../../src/data/earthRegions.ts)、[`../../src/renderers/terrainTiles/terrainTileLayer.ts`](../../src/renderers/terrainTiles/terrainTileLayer.ts) |
| Scope | アルプス山脈とその周りを、Japan と同じ四分木タイルで3D表示し、山の造形を確かめる。日本と同じく「出典を記載すれば加工・再配布・商用利用ができる」データだけを使う。シミュの `cells.h`・河川・経路は変えない |

---

## 0. 結論

- 全域（1km〜125m）は、Japan と同じ AWS Terrain Tiles（Terrarium）で焼く。アルプス全域を1つの符号化・1つの取得方法で覆える。アルプス付近の元データは EU-DEM・SRTM（25〜30m）で、オーストリアは国の DGM（10m）がすでに入っている。
- 細かい出典はスイスの swissALTI3D（2m、swisstopo OGD）だけにする。精度が最も高く、規約（出典の記載で利用・再配布・加工・商用可）も国土地理院と同じ条件を満たし、取得も STAC で自動化できる。
- 細かい出典が効くのは、Terrarium では足りない細かい段（接敵の環）だけ。1km〜500m の造形は出典を足しても変わらない。250m・125m で Terrarium が足りるかは A4 で確かめる。
- swissALTI3D はスイス国内だけなので、アルプス全体の1〜2割しか覆わない。モンブラン・ドロミテ・東アルプスは Terrarium の解像度で見る。細かい段の比較はスイス国内の試験地点で行う。
- 他の国の公的DEM（フランス・イタリア・オーストリア・ドイツ）は調べた結果を残し（§2.2）、A4 で「Terrarium では足りない」と分かった国にだけ後から足す。そのときにその国の規約を確認する。
- 地図の範囲は新しい Earth 地域 `alps` にする。既存の `europe-central` は南端が北緯45.5°で、西アルプス・ドロミテが切れる。
- 実装は Japan 専用になっている所（`regionId === "japan"`、`JAPAN_TILE_DIR`、都道府県マスク、試験地点）を地域ごとの設定に一般化し、焼き込みスクリプトを `--region` で切り替える。

## 1. 日本でのやり方（比較の基準）

| 項目 | Japan |
| :--- | :--- |
| 地域の粗い標高 | `japan.bin`（Terrarium z7 を0.02°格子で取り直した int16） |
| タイル | `japan-tiles/`。z0=256km、65点格子。z3（500m）まで配布、z4〜z5（250m・125m）は手元のみ |
| 細かい出典 | 国土地理院 標高タイル（公共データ利用規約 第1.0版。出典の記載で加工・商用可）。100m の段で Terrarium の縞（モアレ）が目立ったので足した |
| マスク | Natural Earth 10m admin-1（都道府県） |
| 出典表記 | Encyclopedia `feature:data-sources` |

使うデータの条件は日本と同じ。

1. 出典の記載で、加工（取り直し・符号化・谷の彫り込み）と再配布ができる。
2. 商用の利用を禁じていない（「非商用」だけのものは使わない）。
3. 登録やAPIキーなしで、スクリプトから取得できる。

## 2. 使うDEM

### 2.1 採用するもの

| データ | 範囲 | 解像度 | ライセンス | 出典表記 | 取得 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| AWS Terrain Tiles（Terrarium） | 全域 | z12 で約25〜30m（アルプス付近） | 各元データの条件に従い出典の記載が必須 | 元データごと。EU-DEM は `Produced using Copernicus data and information funded by the European Union - EU-DEM layers`、オーストリアは `© offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich` など（tilezen/joerd の一覧に従う） | Japan と同じ |
| swissALTI3D | スイス国内 | 2m（0.5m もあるが使わない） | swisstopo の無償地理データ（OGD）。利用・再配布・加工・商用可、出典の記載は必須 | `© swisstopo` | STAC `ch.swisstopo.swissalti3d` の COG（1km タイル、LV95 = EPSG:2056） |

確認が要る点（A0）。

| 項目 | 確認すること |
| :--- | :--- |
| swisstopo | 現行の利用条件の文言と出典表記。大量取得の制限（ジオサービスの過剰な利用は制限されうる）。スイス国内の1kmタイル約4.2万枚を一度だけ取得し、手元に置く |
| Terrarium | アルプス範囲の元データ（tilezen/joerd の一覧）と、地図に出す出典の文言 |

### 2.2 後から足す候補

A4 で Terrarium が足りないと分かった国にだけ足す。足すときにその国の規約を確認する。

| 国 | データ | 解像度 | ライセンス（調査時点） | 備考 |
| :--- | :--- | :--- | :--- | :--- |
| フランス | IGN RGE ALTI／BD ALTI | 1m・5m／25m | Licence Ouverte Etalab 2.0 | モンブラン（フランス側）、エクラン |
| イタリア | INGV TINITALY 1.1 | 10m | CC BY 4.0（決められた引用文を書く） | ドロミテ、モンテ・ローザ（イタリア側） |
| オーストリア | geoland.at DGM 10m | 10m | CC BY（版が 3.0 AT か 4.0 か資料で食い違う） | Terrarium にすでに入っている |
| ドイツ（バイエルン） | DGM1 | 1m | CC BY 4.0 | ドイツ・アルプス |
| スロベニア | ARSO/GURS LiDAR | 1m | 確認できなかった | ジュリアン・アルプス |
| リヒテンシュタイン | LLV DTM | 0.5m | 確認できなかった | 狭いので Terrarium で足りる |
| 全域 | Copernicus DEM GLO-30 | 30m | 無償・出典記載。利用者が提供者を賠償請求から守る条項がある | Terrarium の元データの代わりに全域を揃えたい場合だけ |

## 3. 地域 `alps`

| 項目 | 値 |
| :--- | :--- |
| 範囲 | 東経 4.5°〜17.0°、北緯 43.5°〜48.6°（地中海沿岸の海岸アルプスからウィーン盆地の手前まで、ジュラ・南ドイツの丘陵を含む） |
| 投影 | 他の Earth 地域と同じ等距円筒（中緯度 46°）。横約960km × 縦約570km |
| 粗い標高 | `alps.bin`（Terrarium z7 を0.02°格子で取り直す。Japan と同じ） |
| 陸と海 | Natural Earth 10m admin-0（パブリックドメイン）。リグリア海・アドリア海の北端が入る |
| マスク | Natural Earth 10m admin-1（州・県・カントン）。都道府県マスクと同じく表示範囲の選択に使う。swissALTI3D の範囲（スイス国内）もこの多角形で切る |

`europe-central` を広げる案は採らない。その地域はシミュの地図として既に使われ、範囲を変えると既存の地図の座標が変わる。

## 4. タイルの段

Japan と同じ四分木（z0=256km、65点格子）。

| z | 格子間隔 | 出典 | 配布 |
| :--- | :--- | :--- | :--- |
| 0〜1 | 4km・2km | `alps.bin` | する |
| 2 | 1km | Terrarium z9 | する |
| 3 | 500m | Terrarium z10 | する |
| 4 | 250m | Terrarium z11 | 手元のみ |
| 5 | 125m | スイス国内は swissALTI3D を平均で縮めたもの、それ以外は Terrarium z12 | 手元のみ |
| 6 | 62.5m | スイス国内の swissALTI3D だけ（A4 で要否を決める） | 手元のみ |

- swissALTI3D は LV95 から地図の経緯度格子へ取り直す。2m の原データは格子間隔まで平均で縮めてから取り直す（そのまま点を拾うとモアレと尖りが出る）。
- 同じ点では swissALTI3D を Terrarium より優先する。スイスの外では使わない（admin-0 で切る）。
- 国境の継ぎ目：マッターホルン・モンテ・ローザ・ベルニナなどは国境の上にあり、z5 以上ではスイス側だけ細かくなる。継ぎ目はタイルの縁（`border`）と国境沿いの帯（初期値1km）で両方を混ぜて段差を消す。高さの基準の差（スイス LN02 とイタリア・フランス）は1m未満で、125m の段では見えない。z6 はスイスの中だけなので、国境をまたぐ山では z5 で止まる。
- 量の見積もり：z3 までのアルプス範囲は約2,300枚で約20MB（Japan の配布量と同程度）。swissALTI3D の原データ（2m、約4.2万枚・数十GB）は Git 管理外の `temp/` に置き、焼いた z5・z6 だけを手元の段にする。

## 5. 実装の一般化

| 場所 | 今 | 変更 |
| :--- | :--- | :--- |
| [`earthRegions.ts`](../../src/data/earthRegions.ts) | `japan` などの地域 | `alps` を足す。`localTerrain`（タイルの置き場・マスクの名前・試験地点）を地域の設定に持たせる |
| [`terrainTileLayer.ts`](../../src/renderers/terrainTiles/terrainTileLayer.ts) | `JAPAN_TILE_DIR` | 地域の設定から `heightmaps/earth/<region>-tiles/` を読む |
| [`three-d-renderer.ts`](../../src/renderers/three-d-renderer.ts) | タイルは `earthRegion.id === "japan"` のときだけ | 地域の設定に `localTerrain` がある地域で有効 |
| [`localTerrainSampler.ts`](../../src/renderers/localTerrainSampler.ts) | `regionId !== "japan"` で実在河川と県の段を読まない | 地域の設定から読む。`prefectures` を `admin1` に名前を変える（URL の `ltTilePrefs` は残す） |
| [`localTerrainGeoref.ts`](../../src/utils/localTerrainGeoref.ts) | `JAPAN_LOCAL_TERRAIN_SITES` | 地域ごとの試験地点 |
| 焼き込み | `bakeJapanTiles.mjs`、`bakeJapanLocalDem.mjs` | `bakeEarthTiles.mjs --region alps` に一本化し、出典の取得を `scripts/dem-sources/<name>.mjs` に分ける（まず Terrarium・GSI・swissALTI3D の3つ） |
| 座標変換 | 経緯度のみ | LV95 から経緯度へ。`proj4`（開発依存）を使う。GDAL には頼らない |
| 出典表記 | Encyclopedia `feature:data-sources` に Japan の出典 | Terrarium のアルプスの元データと `© swisstopo` を足す。地図の出典表示（`attribution`）にも入れる |

谷の彫り込み（[`fmg-cell-valleys.md`](./fmg-cell-valleys.md)）は地域によらず同じ高さ関数で効く。ただし横断面の寸法は日本の実測なので、アルプスの氷河のU字谷には合わない。アルプスで谷の形を合わせるのは別の回とする（A5）。

## 6. 試験地点

細かい段（z5・z6）の比較はスイス国内で行う。スイスの外の地点は Terrarium の解像度で全体の造形を見る。

| 地点 | 経度・緯度 | 出典 | 見るもの |
| :--- | :--- | :--- | :--- |
| ツェルマット／マッターホルン | 7.66, 46.00 | swissALTI3D（山頂の南は Terrarium） | 尖峰（ホルン）と深い谷、国境の継ぎ目 |
| ラウターブルンネン | 7.91, 46.59 | swissALTI3D | 氷河のU字谷と懸谷・崖 |
| アレッチ氷河 | 8.03, 46.45 | swissALTI3D | 長い氷河の谷と両側の稜線 |
| エンガディン（サンモリッツ） | 9.84, 46.50 | swissALTI3D | 高地の広い谷と湖 |
| ルガーノ湖 | 8.95, 46.00 | swissALTI3D（南はイタリアで Terrarium） | 氷河湖と湖岸の山、国境の継ぎ目 |
| モンブラン／シャモニー | 6.87, 45.92 | Terrarium | 最高峰の山塊（全体の造形） |
| ドロミテ（セッラ山群） | 11.82, 46.51 | Terrarium | 卓状の岩山と急崖（全体の造形） |
| インスブルック／イン川 | 11.39, 47.27 | Terrarium（元はオーストリア DGM） | 広い谷底と両側の山稜 |

## 7. 進め方

| 回 | 内容 | 測る値・決めること |
| :--- | :--- | :--- |
| A0 | swisstopo の利用条件と出典表記、Terrarium のアルプスの元データと出典表記をユーザーが確認する | 出典表記の文言 |
| A1 | 地域 `alps` を足す（`alps.bin`、admin-0 の陸、admin-1 のマスク）。シミュの地図として生成できること | 生成時間、陸の形、国家の数 |
| A2 | 実装の一般化（§5）。Japan の見た目と速さが変わらないこと | Japan の試験地点の比較画像、タイル更新の時間 |
| A3 | Terrarium だけで z0〜z3 を焼いて3D表示する | 配布量、全試験地点の画像 |
| A4 | z4〜z5 を Terrarium で焼き、スイス国内で swissALTI3D の z5 と比べる（Japan の GSI と Terrarium の比較と同じ）。z6 の要否、国境の継ぎ目の見え方、他の国の出典（§2.2）を足すかを決める | 尾根・崖・谷底の見え方、縞の有無、継ぎ目の段差、焼き込み時間 |
| A5 | アルプスの谷の横断面を測り（`sampleJapanValleyProfiles.mjs` を地域で切り替え）、U字谷の曲線を足すか決める | 深さ別の寸法と側壁の形 |

## 7.1 記録

### A0（2026-11-18）

- swisstopo：[無償地理データの利用条件](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)（2022-08-26 掲載、版 1.3.2021）。利用・頒布・公開、加工、商用利用ができ、出典の記載は必須。使える表記は `Federal Office of Topography swisstopo`、`Bundesamt für Landestopografie swisstopo` などの各言語名と `©swisstopo`。地図やサービスでは、各要素の横か、地図からリンクした出典の一覧ページに書く。派生データは「derived from ...」を前に付けてよい。ジオサービスを過剰に使うとアクセスを制限されうる（数値の上限は無い）。連邦空間データ基盤（FSDI）の一般利用条件も掛かる。→ 地図の出典表示とEncyclopedia の出典一覧に `©swisstopo`（派生なので `derived from swissALTI3D ©swisstopo`）を書く。
- Terrarium（tilezen/joerd の出典一覧）：アルプスに掛かるのは次の表記。swisstopo・イタリア・フランスの元データは含まれない。
  - `Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich`（CC BY 3.0 AT）
  - `Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers`
  - `Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration`
  - `global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey`
- 残る確認：FSDI の一般利用条件（http://www.geo.admin.ch/terms-of-use）は読んでいない。A4 で swissALTI3D を取得する前に読む。

### A1（2026-11-18）

- `scripts/bakeAlpsEarthRaster.mjs` で `public/heightmaps/earth/alps.bin` を焼いた（Terrarium z7、0.02°、675×305、437KB。範囲は地域を0.5°広げた 4.0–17.5°E, 43.0–49.1°N）。陸は Natural Earth 10m admin-0（`temp/ne_10m_admin_0_countries.geojson`、Git 管理外）。
- `ALPS_REGION`（[`earthRegions.ts`](../../src/data/earthRegions.ts)）とテンプレート `alps`（id 25）を足した。気候の基準は東経4.5–17.0°、中心北緯46.05°。
- seed 12345 で生成：約4秒、9,598 セル（陸 9,080）、最高 h=100、川 197、国家 14、都市 66（Cultures set Antique のため Settlement pattern が Marches）。人口に頼る試験では Standard に変える。

### A2（2026-11-18）

- `EarthRegion.localTerrain`（`tileDir`・`localDemDir`・`sites`）を足し、Japan と Alps に設定した。タイル表示は `localTerrain` を持つ地域で有効になり、地域が変わるとタイルの層を作り直す（`TerrainTileLayer.directory`）。
- 県の段（`manifest.json`）と実在河川（`rivers.json`）は `localDemDir` から読む（Alps は無し）。試験地点は `localTerrainSites(regionId)`。`JAPAN_LOCAL_TERRAIN_SITES` は Japan の設定を指す別名として残した（既存のハーネス用）。
- `prefectures` → `admin1` の名前変更は見送った（URL・ハーネス・タイルの索引の書式が変わるだけで、Alps の表示には要らない）。
- 確認（seed 12345）：Japan 川中島はタイル 176枚を描き、谷の数値（川8本・3,368点・峡谷8点）も V3 と同じ。Alps ツェルマットは `alps-tiles/` が無いのでタイルは読めず、窓の地面（`alps.bin` の2km）で描く。

### A3（2026-11-18）

- `scripts/bakeEarthTiles.mjs --region japan|alps` を足し、`bakeJapanTiles.mjs` を置き換えた。Japan は `--local --maxZoom 5` で今の `japan-tiles/` の全ファイルとバイト単位で一致した。
- Alps は `alps.bin` と Terrarium（1km 段に z8、500m 段に z9。段の間隔の半分以下の画素になる縮尺）から z0〜z3 を焼いた。取得 288枚（`temp/terrarium-alps/`、37MB）、焼き込み17秒。マスクは admin-0 の国（ISO A2）にした（admin-1 はスロベニアの市町村だけで約200あり、1バイトの索引に収まらない）。

| z | 間隔 | 枚数 | バイト（gzip） |
| :--- | :--- | ---: | :--- |
| 0 | 4km | 12 | 108K（68K） |
| 1 | 2km | 40 | 359K（267K） |
| 2 | 1km | 140 | 1.26M（0.94M） |
| 3 | 500m | 526 | 4.72M（3.37M） |
| マスク | 1km | — | 545K（9K） |

- 配布量は計7.0MB（gzip 約4.6MB）。Japan の z0〜z3（約13MB）より小さい。
- 試験地点8か所の3D（`scripts/alpsTerrainTilesHarness.js`、`docs/analytics/raw/alps-terrain/a3-*.png`）：描くタイル21〜35枚・9.4万〜15.7万頂点、タイル更新の最大4〜17ms。地点の高さはラウターブルンネン 802m、ルガーノ 291m、インスブルック 586m と実際の谷底に近い。
- 見え方：500m で山並み・主な谷（ツェルマット谷、イン川、アレッチ）は読める。寄ったラウターブルンネン・シャモニーでは面が粗く、U字谷の崖や尖峰は出ない（A4 の細かい段の課題）。
- 課題：湖（ルガーノ湖・コモ湖など）は湖面が海抜270m前後なので陸として描かれる。高さの色は Japan の色分け（2,200m 以上で灰、3,200m で白）のままで、アルプスでは広い範囲が白くなる。

## 8. やらないこと

- 非商用だけのデータ、登録者だけが使えるデータは使わない。
- swissALTI3D の原データ（2m）を配布しない。段の格子間隔まで縮めたものだけを手元に置く。
- 国の公的DEMを実行時にブラウザから取りに行かない（オフライン不可・外部依存になる）。
- スイス以外の国の公的DEMは、A4 で必要と分かるまで取り込まない。
- シミュの地形（`cells.h`）を実在DEMで書き換えない。

## 9. 調べた資料

- swisstopo：[無償地理データの利用条件](https://www.swisstopo.admin.ch/en/conditions-geodata)、[出典表記の FAQ](https://www.swisstopo.admin.ch/en/source-reference-ogd-swisstopo)、[opendata.swiss の swissALTI3D](https://ckan.opendata.swiss/dataset/swissalti3d)、[STAC コレクション](https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d)
- 全域：[Terrain Tiles の出典一覧（tilezen/joerd）](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)、[AWS Registry](https://registry.opendata.aws/terrain-tiles)、[Copernicus DEM GLO-30 ライセンス](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf)
- 後から足す候補：
  - フランス：[RGE ALTI（Earth Engine カタログ、etalab-2.0）](https://developers.google.com/earth-engine/datasets/catalog/IGN_RGE_ALTI_1M_2_0)、[IGN データの無償公開（2021）](https://www.actuia.com/index.php/en/news/the-igns-public-data-relating-to-topography-relief-and-visualization-of-the-territory-are-free-and-open-to-the-public/)、[BD ALTI 25m](https://ckan2.data.arnia-bfc.fr/en/dataset/bd-alti-25m)
  - イタリア：[TINITALY（INGV）](https://tinitaly.pi.ingv.it/)、[ダウンロード 1.1](https://tinitaly.pi.ingv.it/Download_Area1_1.html)
  - オーストリア：[OpenDEM のオーストリアのメタデータ](https://opendem.info/opendemeu_meta_austria.html)、[EMD Wiki（CC BY 3.0 AT の記載）](https://help.emd.dk/mediawiki/index.php/Austrian_Elevation_Model)
  - ドイツ：[OpenDTM-DE（州ごとのライセンス）](https://opendem.info/opendtm_de.html)、[バイエルンのオープンデータ（2024）](https://lohr.bayernlab.bayern.de/mam/ldbv/dateien/infoverm_2024_opendata_stopet.pdf)
  - スロベニア：[e-prostor 一般条件](https://www.e-prostor.gov.si/fileadmin/struktura/EGP/General_terms.pdf)、[OSM フォーラム](https://community.openstreetmap.org/t/dem-data-for-slovenia/95475)
  - リヒテンシュタイン：[INSPIRE の DTM 記録](https://inspire-geoportal.ec.europa.eu/srv/api/records/3a1af678-01fa-4069-bc83-d17627725ef4)
