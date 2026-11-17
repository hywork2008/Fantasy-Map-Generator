# アルプス周辺の実在DEMと3D地形タイル

| 項目 | 内容 |
| :--- | :--- |
| Status | 調査と設計（2026-11-18）。ライセンスの一部は要確認（§2.3） |
| Parent | [`japan-terrain-tiles.md`](./japan-terrain-tiles.md) |
| Related | [`japan-local-war-terrain.md`](./japan-local-war-terrain.md)、[`fmg-cell-valleys.md`](./fmg-cell-valleys.md)、[`earth-geography-heightmaps.md`](./earth-geography-heightmaps.md)、[`../../scripts/bakeJapanTiles.mjs`](../../scripts/bakeJapanTiles.mjs)、[`../../src/data/earthRegions.ts`](../../src/data/earthRegions.ts)、[`../../src/renderers/terrainTiles/terrainTileLayer.ts`](../../src/renderers/terrainTiles/terrainTileLayer.ts) |
| Scope | アルプス山脈とその周りの国（スイス・オーストリア・フランス・イタリア・ドイツ南部・スロベニア・リヒテンシュタイン）の実在DEMを、Japan と同じ四分木タイルで3D表示し、山の造形を確かめる。日本と同じく「出典を記載すれば加工・再配布・商用利用ができる」データだけを使う。シミュの `cells.h`・河川・経路は変えない |

---

## 0. 結論

- 全域の土台は、Japan と同じ AWS Terrain Tiles（Terrarium）にする。アルプス全域を1つの符号化・1つの取得方法で、1km〜約100m（z12）まで焼ける。出典はタイル提供元の一覧に従って記載する（EU-DEM、オーストリア DGM、SRTM など）。
- 100m より細かい段（接敵の環）は、国ごとの公的DEMで足す。Japan で国土地理院のDEMを足したのと同じ位置付け。使えるのは次の5つ。どれも出典の記載だけで加工・商用・再配布ができる。
  - スイス：swissALTI3D（2m・0.5m、swisstopo OGD）
  - オーストリア：geoland.at DGM 10m（CC BY）
  - フランス：IGN RGE ALTI 1m／BD ALTI 25m（Licence Ouverte Etalab 2.0）
  - イタリア：INGV TINITALY 1.1（10m、CC BY 4.0）
  - ドイツ（バイエルン）：DGM1（1m、CC BY 4.0）
- スロベニア（ARSO/GURS のLiDAR）とリヒテンシュタイン（LLV の DTM）はライセンスを確認できなかった。確認できるまでは Terrarium だけで描く。
- 全域を同じ条件で揃えたい場合の予備として Copernicus DEM GLO-30（30m）を挙げる。無償・出典記載で使えるが、利用者が提供者を賠償請求から守る条項があるので、採るかどうかはユーザーが判断する（§2.3）。
- 地図の範囲は新しい Earth 地域 `alps` にする。既存の `europe-central` は南端が北緯45.5°で、西アルプス・ドロミテ・ジュリアンアルプスが切れる。
- 実装は Japan 専用になっている所（`regionId === "japan"`、`JAPAN_TILE_DIR`、都道府県マスク、試験地点）を地域ごとの設定に一般化し、焼き込みスクリプトを `--region` で切り替える。

## 1. 日本でのやり方（比較の基準）

| 項目 | Japan |
| :--- | :--- |
| 地域の粗い標高 | `japan.bin`（Terrarium z7 を0.02°格子で取り直した int16） |
| タイル | `japan-tiles/`。z0=256km、65点格子。z3（500m）まで配布、z4〜z5（250m・125m）は手元のみ |
| 細かい出典 | 国土地理院 標高タイル（公共データ利用規約 第1.0版。出典の記載で加工・商用可。CC BY 4.0 と互換） |
| マスク | Natural Earth 10m admin-1（都道府県） |
| 出典表記 | Encyclopedia `feature:data-sources` |

アルプスでも同じ条件を満たすものを採る。条件は次の3つ。

1. 出典の記載で、加工（取り直し・符号化・谷の彫り込み）と再配布ができる。
2. 商用の利用を禁じていない（「非商用」だけのものは使わない。日本の国土数値情報 W05 を外したのと同じ）。
3. 登録やAPIキーなしで、スクリプトから取得できる（できない場合は手元のみの段にする）。

## 2. 使えるDEM

### 2.1 国ごとの公的DEM

| 国 | データ | 解像度 | ライセンス | 出典表記（例） | 形式・座標系 | 判定 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| スイス | swissALTI3D | 0.5m・2m | swisstopo の無償地理データ（OGD）。利用・再配布・加工・商用可、出典の記載は必須 | `© swisstopo` | COG、LV95（EPSG:2056）。STAC `ch.swisstopo.swissalti3d` で1kmタイル | 使える |
| オーストリア | geoland.at DGM 10m | 10m | CC BY（版は資料により 3.0 AT と 4.0 で食い違う） | `Datenquelle: geoland.at` | GeoTIFF、MGI ランベルト（EPSG:31287） | 使える。版は要確認 |
| フランス | IGN RGE ALTI／BD ALTI | 1m・5m／25m | Licence Ouverte Etalab 2.0（2021年から無償。第三者の権利を含むものを除く） | `IGN – RGE ALTI®`（または BD ALTI®） | ASC/GeoTIFF、ランベルト93（EPSG:2154）。県ごとの配布 | 使える |
| イタリア | INGV TINITALY 1.1 | 10m | CC BY 4.0。引用の形が決まっている | `Tarquini et al. (2023) TINITALY/1.1, INGV, doi:10.13127/tinitaly/1.1` | GeoTIFF、UTM 32N（WGS84） | 使える |
| ドイツ | バイエルン DGM1 | 1m | CC BY 4.0（2023年から無償公開） | `Bayerische Vermessungsverwaltung – www.geodaten.bayern.de` | GeoTIFF、UTM 32N（ETRS89） | 使える |
| スロベニア | ARSO/GURS LiDAR DMR | 1m | GURS のデータは CC BY 4.0 とされるが、LiDAR 自体の規約は確認できなかった | — | 1km タイル、D96/TM（EPSG:3794） | 要確認 |
| リヒテンシュタイン | LLV DTM | 0.5m | 確認できなかった（LLV の公開データは「出典必須」と「商用は許可制」が混在） | — | WCS/ATOM | 要確認。Terrarium で足りる |

### 2.2 全域をまとめて覆うもの

| データ | 解像度 | ライセンス | 使い方 |
| :--- | :--- | :--- | :--- |
| AWS Terrain Tiles（Terrarium） | z12 で約25〜30m（アルプス付近） | 各元データの条件に従い出典の記載が必須。オーストリアは `© offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich`、EU-DEM は `Produced using Copernicus data and information funded by the European Union - EU-DEM layers` など | 土台。Japan と同じ取得・焼き込み |
| Copernicus DEM GLO-30 | 30m | 無償・期限なし・全世界。出典表記 `Produced using Copernicus WorldDEM-30 © DLR e.V.`。利用者が提供者を賠償請求から守る条項がある | 予備。国境で解像度の差を出したくない場合 |

### 2.3 確認が要る点

ユーザーが規約を確認してから焼き込みに入れる。

| 項目 | 確認すること |
| :--- | :--- |
| オーストリア DGM | data.gv.at の現在の記載が CC BY 3.0 AT か 4.0 か。出典表記の文言 |
| スロベニア LiDAR | ARSO eVode／e-prostor（GURS）の規約。登録の要否 |
| リヒテンシュタイン DTM | geodaten.llv.li の規約（商用が許可制なら使わない） |
| Copernicus GLO-30 | 賠償の条項を受け入れるか。AWS 上の旧版の規約ではなく現行の規約で判断する |
| swisstopo | 大量取得の制限（ジオサービスの過剰な利用は制限されうる）。STAC から一度だけ取得する |
| フランス | Etalab 2.0 の対象外（第三者の権利を含む）の県・区画が無いか |

## 3. 地域 `alps`

| 項目 | 値 |
| :--- | :--- |
| 範囲 | 東経 4.5°〜17.0°、北緯 43.5°〜48.6°（地中海沿岸の海岸アルプスからウィーン盆地の手前まで、ジュラ・南ドイツの丘陵を含む） |
| 投影 | 他の Earth 地域と同じ等距円筒（中緯度 46°）。横約960km × 縦約570km |
| 粗い標高 | `alps.bin`（Terrarium z7 を0.02°格子で取り直す。Japan と同じ） |
| 陸と海 | Natural Earth 10m admin-0（パブリックドメイン）。リグリア海・アドリア海の北端が入る |
| マスク | Natural Earth 10m admin-1（州・県・カントン）。都道府県マスクと同じく表示範囲の選択に使う |

`europe-central` を広げる案は採らない。その地域はシミュの地図として既に使われ、範囲を変えると既存の地図の座標が変わる。

## 4. タイルの段

Japan と同じ四分木（z0=256km、65点格子）。

| z | 格子間隔 | 出典 | 配布 |
| :--- | :--- | :--- | :--- |
| 0〜1 | 4km・2km | `alps.bin` | する |
| 2 | 1km | Terrarium z9 | する |
| 3 | 500m | Terrarium z10 | する |
| 4 | 250m | Terrarium z11 | 手元のみ |
| 5 | 125m | Terrarium z12、または国の公的DEM（§2.1）を平均で縮めたもの | 手元のみ |
| 6 | 62.5m | 国の公的DEM だけ | 手元のみ（A4 で要否を決める） |

- 国の公的DEMは段の生成時に、各国の座標系から地図の経緯度格子へ取り直す。1m・2m の原データは格子間隔まで平均で縮めてから取り直す（そのまま点を拾うとモアレと尖りが出る）。
- 同じ点に複数の出典があるときの優先：国の公的DEM（自国内）＞ Terrarium。国境の外側は使わない（国の境界を admin-0 で切る）。
- 国境の段差：各国の高さの基準（スイス LN02、オーストリア GHA、イタリア Genova 1942 など）は数十cm〜1m程度の差しかなく、125m の段では見えない。継ぎ目はタイルの縁（`border`）で両方を混ぜて消す。
- 量の見積もり：z3 まででアルプス範囲は約2,300枚（65²×2バイト）で約20MB。Japan の配布量と同程度。z4 以上は手元のみなので配布量に入らない。

## 5. 実装の一般化

| 場所 | 今 | 変更 |
| :--- | :--- | :--- |
| [`earthRegions.ts`](../../src/data/earthRegions.ts) | `japan` などの地域 | `alps` を足す。`localTerrain`（タイルの置き場・マスクの名前・試験地点）を地域の設定に持たせる |
| [`terrainTileLayer.ts`](../../src/renderers/terrainTiles/terrainTileLayer.ts) | `JAPAN_TILE_DIR` | 地域の設定から `heightmaps/earth/<region>-tiles/` を読む |
| [`three-d-renderer.ts`](../../src/renderers/three-d-renderer.ts) | タイルは `earthRegion.id === "japan"` のときだけ | 地域の設定に `localTerrain` がある地域で有効 |
| [`localTerrainSampler.ts`](../../src/renderers/localTerrainSampler.ts) | `regionId !== "japan"` で実在河川と県の段を読まない | 地域の設定から読む。`prefectures` を `admin1` に名前を変える（URL の `ltTilePrefs` は残す） |
| [`localTerrainGeoref.ts`](../../src/utils/localTerrainGeoref.ts) | `JAPAN_LOCAL_TERRAIN_SITES` | 地域ごとの試験地点 |
| 焼き込み | `bakeJapanTiles.mjs`、`bakeJapanLocalDem.mjs` | `bakeEarthTiles.mjs --region alps` に一本化し、出典の取得を `scripts/dem-sources/<name>.mjs` に分ける（Terrarium・GSI・swissALTI3D・geoland・RGE ALTI・TINITALY・バイエルン DGM1） |
| 座標変換 | 経緯度のみ | 各国の座標系から経緯度へ。`proj4`（開発依存）を使う。GDAL には頼らない（手元の環境を増やさない） |
| 出典表記 | Encyclopedia `feature:data-sources` に Japan の出典 | アルプスの出典（§2 の表記）を足す。地図の出典表示（`attribution`）にも Terrarium と使った国の名前を入れる |

谷の彫り込み（[`fmg-cell-valleys.md`](./fmg-cell-valleys.md)）は地域によらず同じ高さ関数で効く。ただし横断面の寸法は日本の実測なので、アルプスの氷河のU字谷には合わない。アルプスで谷の形を合わせるのは別の回とする（A5）。

## 6. 試験地点

造形の確認に使う。地形の種類が違う所を選ぶ。

| 地点 | 経度・緯度 | 見るもの |
| :--- | :--- | :--- |
| マッターホルン／ツェルマット | 7.66, 46.00 | 尖峰（ホルン）と深い谷 |
| ラウターブルンネン | 7.91, 46.59 | 氷河のU字谷と懸谷・崖 |
| モンブラン／シャモニー | 6.87, 45.92 | 最高峰の山塊と谷底の町 |
| グロースグロックナー | 12.69, 47.07 | 東アルプスの高峰と氷河 |
| ドロミテ（セッラ山群） | 11.82, 46.51 | 卓状の岩山と急崖 |
| インスブルック／イン川 | 11.39, 47.27 | 広い谷底と両側の山稜 |
| ブレンナー峠 | 11.51, 47.00 | 峠と鞍部（国境の継ぎ目も見る） |
| コモ湖 | 9.26, 46.00 | 氷河湖と湖岸の山 |

## 7. 進め方

| 回 | 内容 | 測る値・決めること |
| :--- | :--- | :--- |
| A0 | §2.3 の規約をユーザーが確認する。使う出典を決める | 使う出典の一覧と出典表記 |
| A1 | 地域 `alps` を足す（`alps.bin`、admin-0 の陸、admin-1 のマスク）。シミュの地図として生成できること | 生成時間、陸の形、国家の数 |
| A2 | 実装の一般化（§5）。Japan の見た目と速さが変わらないこと | Japan の試験地点の比較画像、タイル更新の時間 |
| A3 | Terrarium だけで z0〜z3 を焼いて3D表示する | 配布量、試験地点の画像 |
| A4 | z4〜z5 を Terrarium で焼き、国の公的DEMと比べる（Japan の GSI と Terrarium の比較と同じ）。z6 の要否を決める | 尾根・崖・谷底の見え方、国境の継ぎ目、焼き込み時間 |
| A5 | アルプスの谷の横断面を測り（`sampleJapanValleyProfiles.mjs` を地域で切り替え）、U字谷の曲線を足すか決める | 深さ別の寸法と側壁の形 |

## 8. やらないこと

- 非商用だけのデータ、登録者だけが使えるデータは使わない。
- 原データ（1m・2m）をそのまま配布しない。段の格子間隔まで縮めたものだけを手元に置く。
- 国の公的DEMを実行時にブラウザから取りに行かない（オフライン不可・外部依存になる）。
- シミュの地形（`cells.h`）を実在DEMで書き換えない。

## 9. 調べた資料

- swisstopo：[無償地理データの利用条件](https://www.swisstopo.admin.ch/en/conditions-geodata)、[出典表記の FAQ](https://www.swisstopo.admin.ch/en/source-reference-ogd-swisstopo)、[opendata.swiss の swissALTI3D](https://ckan.opendata.swiss/dataset/swissalti3d)、[STAC コレクション](https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d)
- オーストリア：[OpenDEM のオーストリアのメタデータ](https://opendem.info/opendemeu_meta_austria.html)、[EMD Wiki（CC BY 3.0 AT の記載）](https://help.emd.dk/mediawiki/index.php/Austrian_Elevation_Model)、[上オーストリア州 DORIS](https://doris-metadaten.ooe.gv.at/at.gv.ooe.doris.geonetwork_extern/srv/api/records/C37B02D1-501F-4001-8F67-891094A4CB7B)
- フランス：[RGE ALTI（Earth Engine カタログ、etalab-2.0）](https://developers.google.com/earth-engine/datasets/catalog/IGN_RGE_ALTI_1M_2_0)、[IGN データの無償公開（2021）](https://www.actuia.com/index.php/en/news/the-igns-public-data-relating-to-topography-relief-and-visualization-of-the-territory-are-free-and-open-to-the-public/)、[BD ALTI 25m](https://ckan2.data.arnia-bfc.fr/en/dataset/bd-alti-25m)
- イタリア：[TINITALY（INGV）](https://tinitaly.pi.ingv.it/)、[ダウンロード 1.1](https://tinitaly.pi.ingv.it/Download_Area1_1.html)
- ドイツ：[OpenDTM-DE（州ごとのライセンス）](https://opendem.info/opendtm_de.html)、[バイエルンのオープンデータ（2024）](https://lohr.bayernlab.bayern.de/mam/ldbv/dateien/infoverm_2024_opendata_stopet.pdf)
- スロベニア：[e-prostor 一般条件](https://www.e-prostor.gov.si/fileadmin/struktura/EGP/General_terms.pdf)、[OSM フォーラム](https://community.openstreetmap.org/t/dem-data-for-slovenia/95475)
- リヒテンシュタイン：[LLV 地理情報](https://www.llv.li/en/national-administration/civil-engineering-and-geoinformation-office/geodata-infrastructure/departments-topics)、[INSPIRE の DTM 記録](https://inspire-geoportal.ec.europa.eu/srv/api/records/3a1af678-01fa-4069-bc83-d17627725ef4)
- 全域：[Terrain Tiles の出典一覧（tilezen/joerd）](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)、[AWS Registry](https://registry.opendata.aws/terrain-tiles)、[Copernicus DEM GLO-30 ライセンス](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf)
