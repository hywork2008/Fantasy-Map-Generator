実在の地形を使うテンプレート(Precreated heightmap の Japan、Britain など)と、日本の局地戦3D表示が使う地理データの出典とライセンスです。

## 陸地と行政区域

| データ | 使いどころ | ライセンス |
| :--- | :--- | :--- |
| Natural Earth 10m 国(admin-0) | Earth 領域テンプレートの陸と海の区別 | パブリックドメイン |
| Natural Earth 10m 州・県(admin-1) | 日本の局地戦3Dで、標高データを都道府県ごとにまとめる範囲と海岸線 | パブリックドメイン |

出典: Made with Natural Earth. https://www.naturalearthdata.com/

## 標高

| データ | 使いどころ | ライセンス・出典表記 |
| :--- | :--- | :--- |
| AWS Terrain Tiles(Terrarium 形式) | Earth 領域テンプレートのセル標高、日本の局地戦3Dの1km〜100mの段 | 元データごとの表記に従う。日本付近は SRTM、GMTED2010、ETOPO1 など(いずれもパブリックドメイン)。一覧: https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
| 国土地理院 標高タイル(DEM10B ほか) | 日本の局地戦3Dの細かい段(既定で優先) | 公共データ利用規約(第1.0版)(PDL1.0)。出典: 国土地理院 標高タイル(https://maps.gsi.go.jp/development/ichiran.html)を加工して作成 |

公共データ利用規約(第1.0版): https://www.digital.go.jp/resources/open_data/public_data_license_v1.0

## 河川

| データ | 使いどころ | ライセンス・出典表記 |
| :--- | :--- | :--- |
| 国土地理院ベクトルタイル(試験公開)の河川(地球地図日本、1:100万) | 日本の局地戦3Dで描く実在の河川と、その谷の掘り下げ | 国土地理院コンテンツ利用規約(公共データ利用規約(第1.0版)と互換)。出典: 国土地理院ベクトルタイル(地球地図日本)を加工して作成 |

地図生成で作られるFMGの河川(シミュレーションが使う河川)は、この実在の河川とは別のものです。局地戦3Dは既定でFMGの河川を2D地図と同じ幅の水面として描きます。実在の河川は配布物に含まれず、焼き込んだ場合だけ、設定で切り替えて描けます。

## 加工について

標高は、地図の生成時と局地戦3Dの準備時に、上記のタイルを格子に取り直して(双線形補間・海岸の判定・河川沿いの掘り下げ・都市の周りの平坦化)使っています。表示される地形は元データそのものではありません。

詳しい手順は docs/plan/japan-local-war-terrain.md と docs/plan/earth-geography-heightmaps.md にあります。
