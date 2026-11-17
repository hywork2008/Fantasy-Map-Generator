# 日本テンプレート局地戦3D 調整記録

2026-11-17。設計: [`../plan/japan-local-war-terrain.md`](../plan/japan-local-war-terrain.md)。

## 条件

| 項目 | 値 |
| :--- | :--- |
| テンプレート | `japan`（localStorage `template` で固定） |
| シード | 822066769 |
| ビューポート | 1600×1000（Playwright、Chromium、WebGPU 有効） |
| グラフ | 1321×1000 px |
| `distanceScale` | 1.846 km/px |
| 格子間隔 | 11.49 px ≈ 21.2km |
| パックセル | 6,052（国家 22） |
| `heightExponent` | 1.8 |

## 地理参照

`worldContext.options.earthRegion` = `{ id: "japan", west: 118.5, east: 146.4, south: 29.9, north: 46.6, graphWidth: 1321, graphHeight: 1000 }`。生成直後に設定されていることを確認した。

試験地点の地図ピクセル:

| 地点 | x | y |
| :--- | :--- | :--- |
| 関ヶ原 | 850.84 | 672.46 |
| 川中島 | 932.28 | 598.80 |
| 長篠 | 901.97 | 699.40 |
| 桶狭間 | 875.46 | 691.02 |
| 厳島 | 654.34 | 737.72 |

## 整合チェック

`japan.bin` を生成と同じ式（`encodeEarthCellHeight`）で 0–100 に落とし、陸のセルと比べた。許容差は±2。

| 対象 | 陸のセル | ずれ | 割合 |
| :--- | :--- | :--- | :--- |
| 格子 `grid.points` / `grid.cells.h` | 3,685 | 0 | 0% |
| パック `pack.cells.p` / `pack.cells.h` | 4,149 | 899 | 21.7% |

パックセルの中心は格子点と位置が異なり、高さは格子から引き継ぐ。そのため、パック中心でDEMを読み直すと、起伏の大きい場所でずれる。ずれの多くは +1〜+5（DEMの方が高い）である。整合チェックは格子で行う。

## 現行（双線形）の基準

徒歩7日の窓（一辺392km）。間隔は max(21.2/4, 2) = 5.3km、1辺74点、5,476頂点。接敵カメラ（`openCampaignViewAt`）。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r0-sekigahara-bilinear-contact.png` | 93df27bfd2d8574dfa88df2e1a76881b63b387c30256294decf37a0f5b02b6a3 |
| `raw/japan-local-terrain/r0-kawanakajima-bilinear-contact.png` | c1f86af19479ce6bd4247ce173535dc448e97e0703f6bf016da9d166e4b11e7b |

所見:

- 関ヶ原：国家色の平面にセル境界が見えるだけで、起伏はほぼ判別できない。半径5km内に54〜759mの比高があるはずの盆地は見えない。
- 川中島：セル単位（約21km）の大きな面の折れとして山が見える。善光寺平や妻女山の規模の地形は無い。
- 接敵カメラは真上に近く、低い起伏は陰影が無いと見えにくい。R1 では斜めの作戦カメラも撮る。

## R1：`japan.bin` を窓の高さに差す

### 条件

ビューポートが変わったため、グラフは 1505×1139 px、約1.62 km/px（シード 822066769 は同じ）。地理参照の整合チェックは格子 3,685 点でずれ0。

- 高さ：`japan.bin` の双線形。`worldY = m / (kmPerPx·1000) × 誇張率`
- 間隔：2km
- 陰影：北西45°の光をベイクした頂点色（地面のマテリアルは無照明のため）
- 斜めカメラ：中心の南、半幅の1.4倍離れ、高さは半幅の0.8倍

参考：今の世界メッシュ（指数100の約2,785m が scale 50）は、この地図で水平に対して約29倍に誇張されている。

### 測定

フレームは `requestAnimationFrame` の2秒平均（ヘッドレスChromium）。

| 画像 | 窓 | 頂点 | rAF |
| :--- | :--- | :--- | :--- |
| sekigahara-cells（双線形、7日窓） | 392km / 5.3km | 5,476 | 60 |
| sekigahara-bin 3日 ×1・×3・×10 | 168km / 2km | 7,056 | 60 |
| kawanakajima-bin 2日 | 112km / 2km | 3,192 | 60 |
| kawanakajima-bin 3日 | 168km / 2km | 7,140 | 60 |
| kawanakajima-bin 4日 | 224km / 2km | 12,656 | 60 |

この規模では負荷は問題にならない。

### 所見

- ×1：ほぼ平面。×3：関ヶ原周辺の山地と濃尾平野の境、鈴鹿山脈の筋が読める。×10：山並みははっきりするが、2km格子の尖りが目立つ。初期値は×3のまま、×5前後も R2 で比べる。
- 双線形（7日窓）は国家色の面に21kmセルの折れが出るだけ。`japan.bin` に替えると、同じ地点で谷筋と尾根が出る。
- 桶狭間：×3でも半径数kmの丘陵は判別できない（想定どおり）。最細段の判断はここで行う。
- 川中島：善光寺平の平地と周囲の山地の境は見える。妻女山の規模（比高数百m、幅1〜2km）は2kmでは形にならない。
- 食い違い（§5.4）が既に見える：伊勢湾の海はセル単位の水面色で、実際の海岸とずれて鋸歯状になる。水面は実DEMで陸の場所でもセルの色で塗られる。セル境界線と川は高さに載るが、窓の外の境界線は平らなまま浮いて見える。
- 日数：2日は接敵の周辺だけになり、行軍路が窓から出やすい。4日は端の山が小さく読みにくい。3日を既定とする。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r1-kawanakajima-bin-d2-x3-oblique.png` | 3af58b8762477572671050a66c99f8f81ecaf6ae171f6ea3ba900bb1edc61f74 |
| `raw/japan-local-terrain/r1-kawanakajima-bin-d3-x3-contact.png` | 3630b361f98552fcf90cff916242579b023290cdfc6ae1254c871e19bb4ef28f |
| `raw/japan-local-terrain/r1-kawanakajima-bin-d3-x3-oblique.png` | 06f503d998b2dc9f42de264f3836d4c085e330d16fe30b7255ca230636adce6f |
| `raw/japan-local-terrain/r1-kawanakajima-bin-d4-x3-oblique.png` | ce93fae22d8f473c0ed84ea8f35a597fb87f27e49e58c0ae6a141a1dbf451e26 |
| `raw/japan-local-terrain/r1-kawanakajima-cells-d3-oblique.png` | 75284b1890ea1c0fae4c1dcf940fee9b59ab821eb60d84c0236d8a3297f5a1b9 |
| `raw/japan-local-terrain/r1-okehazama-bin-d3-x3-contact.png` | d527c7a28cf91c4a7c7c046894e50cefd2eef0e763359c02548e8f4ce5033de1 |
| `raw/japan-local-terrain/r1-sekigahara-bin-d3-x1-oblique.png` | 0b2755a309a279cf4f6959029709cede35cb6fa469a08b2fde83906b4cce4807 |
| `raw/japan-local-terrain/r1-sekigahara-bin-d3-x10-oblique.png` | 0380d14919095d3a5f77e0fb49da082d316c912ec8d1861c853ea609fa4f5ca0 |
| `raw/japan-local-terrain/r1-sekigahara-bin-d3-x3-contact.png` | 6ea61a0e5cc2ebcada45947cdd0901542dc045dced50c41fb04a6ed9cf3f50d6 |
| `raw/japan-local-terrain/r1-sekigahara-bin-d3-x3-oblique.png` | c81b5387f9e2c43de776facc56ce34a90d1e1d800885b34dbf104a8e194b62d8 |
| `raw/japan-local-terrain/r1-sekigahara-cells-d3-oblique.png` | 624266b48f3ce4a620666b25bca0f7c1e3b996e51728585d7d977e2fa715ae81 |

## R2：Terrarium の段（1km・500m・250m）を窓全体に一様に敷く

### 焼き込み

`node scripts/bakeJapanLocalDem.mjs`（既定：岐阜・長野・愛知・滋賀・三重、JP-21,20,23,25,24）。50秒（タイルの取得を含む）。出力は Git 管理外の `public/heightmaps/earth/japan-local/`。

| 段 | 格子 | Terrarium | タイル | バイト | SHA-256 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1000m | 276×375 | z8 | 12 | 219,966 | 61f3828cb695092ae4ab76cc6dc4dd0809855cd5bca1581900c47f6edd25e292 |
| 500m | 552×749 | z9 | 35 | 878,605 | 3b3ec0636c8a8862ff2a2d52d5aa4c3ad60a4bd135b19991b1b45387f7909c33 |
| 250m | 1104×1497 | z10 | 117 | 3,511,990 | b66253d9b407b7ef42785df532a08b7123e842f17e454e79c792d2ba9d80aca5 |

入力 `temp/japan-local/ne_10m_admin_1_states_provinces.geojson` の SHA-256：22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5。都道府県の外接矩形に3kmの余白を足し、5県の多角形を3km膨らませた範囲だけ標高を持つ（外は NODATA で `japan.bin` に落ちる）。

### 測定

徒歩3日の窓（一辺168km）。「描き直し」は `redraw` を呼んでから地面のメッシュが差し替わるまで（窓の構築・ジオメトリ転送を含む）。ジオメトリは位置・色・法線と添字の合計。

| 間隔 | 頂点 | 描き直し | ジオメトリ | rAF |
| :--- | :--- | :--- | :--- | :--- |
| 2km（`japan.bin`） | 7,056 | 41ms | 0.4MB | 60 |
| 1km | 28,224 | 約70ms | 1.7MB | 60 |
| 500m | 112,896 | 約150ms | 6.8MB | 60 |
| 250m | 451,584 | 約500ms | 27.1MB | 60 |

ヘッドレス Chromium（Mac mini の GPU）では250mでも60fpsを保った。描き直しは250mで約0.5秒、目安（500ms）の上限に当たる。

### 所見

- 1km：2kmより山の輪郭が滑らかになるが、谷の細部は出ない。
- 250m：関ヶ原の周囲の山と盆地、伊吹山地・養老山地の筋がはっきり分かる。川中島は善光寺平の平地と、周りの山地の谷筋まで見える。作戦カメラでも接敵カメラでも、見栄えは250mが最もよい。
- 桶狭間：500m×3ではほぼ平地。250m×5で尾張東部の丘陵の起伏が読める。丘陵の判別には250mと×5前後が要る。
- 誇張率：250mでは×3が自然。×5は丘陵向けで、山地では尖って見える。誇張率をカメラの高さか地形で変える案を R3 で考える。
- 不具合と食い違い：
  - 窓が5県の外に出る所（川中島の東、群馬・新潟側）は `japan.bin` の2kmに落ち、境目で解像度が段になり、板を並べたような縞が出る。都道府県の束を窓の範囲まで増やすか、境界をぼかす。
  - Terrarium z10 には斜めの細かい縞（元データのモアレ）が残る。地理院10mとの比較（R4）の材料にする。
  - 海はセル単位の水面色のまま。伊勢湾の海岸が鋸歯状に残る（R5）。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r2-kawanakajima-dem-1000m-x3-oblique.png` | 9aef181b1c474de082b8ace63332251aa35d03226785e9d0100b93c403d54c80 |
| `raw/japan-local-terrain/r2-kawanakajima-dem-250m-x3-contact.png` | 2476353feafd90405cf650daaaf038d48b67a7ecf81ec394627ffe6611ec9fef |
| `raw/japan-local-terrain/r2-kawanakajima-dem-250m-x3-oblique.png` | 59bdbaf992a3f4fd0c88996b4d4d32e81b66172b9e450189ae808ddafec1de64 |
| `raw/japan-local-terrain/r2-okehazama-dem-250m-x3-contact.png` | 6d189e4a38ee4a4b187899a6ea6e7deccdae8a4b27eb89f2fedeb28021c1d4ef |
| `raw/japan-local-terrain/r2-okehazama-dem-250m-x5-contact.png` | 5a47f33e9ec2601417a63f201c6a6aa0a8d4964dd2535027dc05b839d9112bbf |
| `raw/japan-local-terrain/r2-okehazama-dem-500m-x3-contact.png` | 8b9f0885b2709f145e96a8877316ce6c550e963d8e17c25d188207e8ceca46e9 |
| `raw/japan-local-terrain/r2-sekigahara-dem-1000m-x3-oblique.png` | a56c659cefa7a5d31c6980048801639cd0a9b97b94b0e2d53f0057f96d739a43 |
| `raw/japan-local-terrain/r2-sekigahara-dem-250m-x3-contact.png` | 4acb754d15b0dc27ea831cfcbb8205f5a0823685d93eae66c5fe3e429b529a8b |
| `raw/japan-local-terrain/r2-sekigahara-dem-250m-x3-oblique.png` | 0671f449bbeaaa032f6e6093d3767a69150c55dd158e745aaffff3d9f4fb08f6 |
| `raw/japan-local-terrain/r2-sekigahara-dem-250m-x5-oblique.png` | 95a6d716bfc8548a96dddb7d3cd5df356d88e1af521b694b0856c2441926f1ec |
| `raw/japan-local-terrain/r2-sekigahara-dem-500m-x3-oblique.png` | 680cd28ffd09761f3c61673061a6d3bc0ecf31c2dd78c3932f1c3ba7df3c1cc3 |
| `raw/japan-local-terrain/r2-sekigahara-japanBin-2000m-x3-oblique.png` | c75067f6f8ded2b50c5c7bf8d2de7e76ed0edd8b9cc4750077a0188c3a874dee |

## R3：同心LOD（テンソル格子）

### 方式

環ごとに別メッシュを作らず、1枚の格子の列と行の間隔を中心からの距離で変える（`campaignAxis`）。環の内側の列・行は環の間隔、外側は外の間隔になる。T字の継ぎ目が出ない代わりに、外側の帯では細かい方向と粗い方向が混ざった細長い面ができる。段は頂点ごとに局所の間隔で選ぶ（`heightAt(x, y, stepKm)`）。

束の外に出る段差を避けるため、隣接13県（群馬・埼玉・新潟・富山・石川・福井・山梨・静岡・京都・大阪・兵庫・奈良・和歌山）の束も焼いた。

| 段 | 格子 | バイト | SHA-256 |
| :--- | :--- | :--- | :--- |
| 1000m | 513×572 | 623,580 | a1acc6a1b222c6931ef5faedf10f6788514ea41ef00b0d020eed0b584c75ab62 |
| 500m | 1025×1143 | 2,489,625 | 22042c3706a3a8a353a411f5c439fc1017af6d8671a2117f571c9c3a5be5dd4f |
| 250m | 2049×2285 | 9,949,204 | ab11d2559725def9289d3f7595ac0fc51dedc36a87ca335eea602c60c3e65bf5 |

### 測定（徒歩3日の窓）

| 構成 | 頂点 | 描き直し | ジオメトリ | rAF |
| :--- | :--- | :--- | :--- | :--- |
| u250：250m一様 | 451,584 | 約510ms | 27.1MB | 60 |
| B：半幅35km 250m、外1km | 143,641 | 197ms | 8.6MB | 60 |
| C：半幅35km 250m、60km 500m、外1km | 184,041 | 約235ms | 11.0MB | 60 |
| D：半幅20km 250m、45km 500m、外1km | 114,921 | 約162ms | 6.9MB | 60 |

### 所見

- D は目標（頂点15万以下、描き直し0.2秒以下）に収まる。作戦カメラでは中心付近は u250 と見分けにくく、窓の手前と奥の端だけ粗い。
- B・C は頂点が増えるわりに、中心の見た目は D と変わらない。外側の500mの帯は D の45kmで足りる。
- 束を増やしたことで、川中島の東側の段と縞は消えた。
- 外側の帯の細長い面が、陰影で斜めの筋として見える所がある（川中島の南、山梨側）。気になるなら外側も500mにする（頂点は約1.7倍）か、環のメッシュを分ける。
- 誇張率：D で関ヶ原×3、桶狭間×5。×4 は両者の中間で、どちらの地点でも破綻しない。既定は×3のまま、丘陵地での切替は R5 以降に回す。
- 既定値を D・×3・`source=dem` にした（束が無ければ `japan.bin` に落ちる）。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r3-kawanakajima-r20-250_r45-500_o1000-x3-oblique.png` | 3b9f3f06e882d3fda6c9efa1a179485f3204243affad4643adc3089e7751dd27 |
| `raw/japan-local-terrain/r3-kawanakajima-r35-250_r60-500_o1000-x3-oblique.png` | e34402bcd5f152467d2bc2b727d50ea5d4239b0a131cdd00ca90ccb27d442579 |
| `raw/japan-local-terrain/r3-kawanakajima-u250-x3-oblique.png` | d8ecb46e7bfdceccb8f31fe0bf14af68281d31d818a62fcd7895b5dcefbaef2d |
| `raw/japan-local-terrain/r3-okehazama-r20-250_r45-500_o1000-x5-contact.png` | ea9d3e8ab3df830f7ee80262830aed36afcdcfc50028ac5bfbc2a0fcbc73663c |
| `raw/japan-local-terrain/r3-okehazama-r35-250_r60-500_o1000-x4-contact.png` | b6d0629416d828c7f5b62c305d516050bb2af4ce21a79c387c4639807c32be38 |
| `raw/japan-local-terrain/r3-sekigahara-r20-250_r45-500_o1000-x3-oblique.png` | b61edd24c6a62d0978d4fb57284c76c7af6af75998efc5d33898c708ccc68d80 |
| `raw/japan-local-terrain/r3-sekigahara-r35-250_o1000-x3-oblique.png` | a3adcea34e1f4934f49e2da31b93fdbe09c3c3fcc2b3d3fa07a9bed49e222b4b |
| `raw/japan-local-terrain/r3-sekigahara-r35-250_r60-500_o1000-x3-contact.png` | 9d0ca605a50b2201232bc3c9c3469b24784f4ecc0cb4b382deee804b93f4839f |
| `raw/japan-local-terrain/r3-sekigahara-r35-250_r60-500_o1000-x3-oblique.png` | 2d7d94932170222ca5ce59c9157222ee1dc98e8a029365e82d9c87ef0d1c2408 |
| `raw/japan-local-terrain/r3-sekigahara-r35-250_r60-500_o1000-x4-oblique.png` | 75c8384cd941df8c47d3cd44bc1997b1bb4680725911b282a31583bb720195e4 |
| `raw/japan-local-terrain/r3-sekigahara-u250-x3-oblique.png` | 9091f0c672df134357771e3b7273fa6242f5fd04bec36780faa4b02a7cd16e23 |

## R4：接敵の環に100mを足す

### 焼き込み

`--levels 100` を県ごとに実行した（外接矩形を小さく保つため）。間隔の半分以下の画素を選ぶ規則で Terrarium z12（約31m）を使った。タイルのキャッシュは `temp/terrarium-cache` で合計84MB。

| 束 | 格子 | タイル | バイト | SHA-256 |
| :--- | :--- | :--- | :--- | :--- |
| 愛知 23-100m | 1093×951 | 195 | 2,208,845 | f9d52200e9498abf63104cc6249a2c3d398b0451161df83f0e9b206c456794bb |
| 岐阜 21-100m | 1295×1513 | 360 | 4,163,615 | 8326468eed9c841d6df7b57c1dc3d2442104f69722e89d9ecbabc20dbf83ffde |
| 長野 20-100m | 1313×2081 | 476 | 5,806,279 | 8e0e1355b4ac01cfa9749782b61fcd2cfc964d81924422e119ef62d4606c4d8e |

### 測定

構成 D（R3 の既定）と、D の内側に半幅6kmの100mを足した E。新しい「近接」カメラは地点の南12km・高さ5km。

| 構成 | 頂点 | 描き直し | ジオメトリ |
| :--- | :--- | :--- | :--- |
| D | 114,921 | 150〜175ms | 6.9MB |
| E | 168,921 | 約220ms | 10.1MB |

いずれも60fps。

### 所見

- 桶狭間：D（250m）×3 の近接ではほぼ平ら。E×5 で丘陵と谷の細かい起伏が出る。丘陵地の戦場には100mと×5前後が要る。
- 川中島：E×3 で善光寺平の平地と、その縁の尾根（妻女山の規模）が分かれて見える。
- 関ヶ原：E×3 で盆地を囲む山の尾根と谷筋が描き分けられる。
- 近接カメラでは、都市の球と地名のラベルが地形に対して大きすぎる。表示の大きさを窓の尺度に合わせる必要がある（R5 以降）。
- 100m の環は E で頂点が約1.5倍、描き直しが約0.22秒。常に入れると R3 の目標を超える。近接カメラのときだけ入れる案が有力。

### 全国の大きさ

陸域は約37.8万km²。R2〜R4 の実測では、県の外接矩形のラスタは陸だけの量の約2.1〜2.8倍になる（海と隣県の NODATA を含むため）。

| 段 | 陸だけ（int16） | 外接矩形のラスタ（実測倍率） |
| :--- | :--- | :--- |
| 1km | 0.76MB | 約2MB |
| 500m | 3.0MB | 約7MB |
| 250m | 12MB | 約30MB |
| 100m | 76MB | 約160MB |

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r4-kawanakajima-D-x3-close.png` | f03e916e5cda5ca685595ed8729255984cb644e77c6f3d22539a028c3f12ff69 |
| `raw/japan-local-terrain/r4-kawanakajima-E100-x3-close.png` | 6a815dbd322d864bec12cf14e7ef2c430e104f834ed9c03e7988f09f8b77b971 |
| `raw/japan-local-terrain/r4-nagashino-E100-x3-close.png` | aedbb80b34691a88a67f51e8f5dca45f4646484e3315ca84fab8b60c23fb64d8 |
| `raw/japan-local-terrain/r4-okehazama-D-x3-close.png` | 6cb79bd683db5979b30fc968186db10c785657d03f6441fcf42c910c407153e0 |
| `raw/japan-local-terrain/r4-okehazama-E100-x3-close.png` | dfe98e2028f535e57bd7953a857714a56d64b26bb3b12ccbf651bcfb81da8886 |
| `raw/japan-local-terrain/r4-okehazama-E100-x5-close.png` | 75d114c537fe289477116685c157975ee9254a2d23bebc281007bb700bce3575 |
| `raw/japan-local-terrain/r4-sekigahara-D-x3-close.png` | f478b31d39d7b377325d609469bd6cfda90e823027e63badfc98bdebf7849b7e |
| `raw/japan-local-terrain/r4-sekigahara-E100-x3-close.png` | 23747bc8173ee58fdc2c98a56aaa259d910f0f9d740e3311d3a260b540d4eba1 |
| `raw/japan-local-terrain/r4-sekigahara-E100-x3-oblique.png` | b2b6240435e5b3d7e37aae8bd582c5245d045d7c7ca2bc9ee8800aebf7e88cac |

## R5：シミュとの食い違いと接敵表示

### 実装

- 海岸：段の陸ビット（Natural Earth admin-1 を段の解像度で塗ったもの）で海と陸を塗る。段の無い所は `japan.bin` の陸ビット。DEMで陸なのに海セルの所は、近くの陸セルの色。
- 都市：半径1.5kmを都市の標高で平らにし、3kmで元へ戻す。
- 河川：FMG の川の折れ線を100mごとに読み、高い端から流れ下る「上がらない」断面で幅300mの廊下を掘る。掘る深さは30mで頭打ち。
- 駒：海上の陸の駒（都市・連隊）は最寄りの陸へ、陸上の艦隊は最寄りの海へ、表示だけ移す（最大10km）。
- 接敵：カメラと注視点の距離が25km未満で100mの環と×4に切り替え、40km超で戻す（300msの遅延で1回だけ作り直す）。
- 駒とラベル：カメラ距離に比例した大きさにし、元の大きさを上限にする。
- 国土地理院 標高タイル（DEM10B PNG）を `--source gsi` で焼けるようにした。愛知の100mを焼いた（z12、174タイル、4分）。同じ段に両方あるときは `demSource`（既定 gsi）を優先する。

| 段 | バイト | SHA-256 |
| :--- | :--- | :--- |
| 23-100m-gsi | 2,208,845 | 2fff921140d5298f2cba7b18134c2c01cbf9ac7456b737b29d187e083c72230d |

### 測定

| 地点・カメラ | 頂点 | 接敵 | 都市の平坦化 | 駒の移動 | 川の標本 | 掘る（>1m） | 30m超 | 最大 | 平均 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 関ヶ原・作戦 | 114,921 | なし | 14 | 2 | 3,690 | 2,542 | 1,443 | 836m | 86m |
| 厳島・作戦 | 114,921 | なし | 14 | 0 | 901 | 732 | — | 417m | 123m |
| 川中島・近接 | 168,921 | あり | 7 | 1 | 3,110 | 1,737 | 1,191 | 1,378m | 108m |
| 桶狭間・近接 | 168,921 | あり | 16 | 2 | 4,129 | 2,945 | — | 1,832m | 162m |
| 長篠・近接 | 168,921 | あり | 14 | 2 | 3,329 | 2,199 | — | 1,280m | 121m |

描き直しは平坦化・河川の準備を含めて作戦0.26〜0.30秒、接敵0.26〜0.29秒（R3 の0.16秒から約0.1秒増）。60fps。

### 所見

- 海岸：伊勢湾・三河湾の海岸線が実際の形になった。束の外（厳島・広島湾）は `japan.bin` の2km陸ビットのままで、海岸が階段状。横一列の陸の帯も出る（`japan.bin` の陸マスクの行）。広島周辺の束を焼けば直る。
- 河川：FMG の川は21kmセルから作るので、実際の谷を通らない。川の標本の約4割で、30m以上の尾根を横切っている。上限なしで掘ると最大1.8kmの峡谷になるため、30mで頭打ちにした。尾根を越える区間は、川の線を地表に載せるだけになる。根本的には、局地窓では実在の河川（国土数値情報 W05 など）を描く案と、FMG の川を谷へ寄せる案がある（R6 で判断）。
- 都市の平坦化：作戦カメラでは目立たず、近接で街の下が平らになる。
- 駒の移動：1窓あたり0〜2件。
- 接敵の切替：近接カメラで100mの環に入り、引くと戻る。川中島の近接で手前に壁のような山が写るのは、カメラ（高さ5km固定）が×4の山（1,500m×4）に近すぎるため。撮影用のカメラを地表からの高さにする。
- GSI と Terrarium（桶狭間・100m）：GSI の方が丘陵の形が細かく、Terrarium の斜めの縞が無い。100mは GSI を既定にする。
- 駒とラベルが画面上で一定の大きさになり、近接で地形を隠さなくなった。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r5-itsukushima-default-xundefined-oblique.png` | f6e06bf0a2fb97e63483a359710d27cc979ec1bd48dc69c6764765b90188dd4d |
| `raw/japan-local-terrain/r5-itsukushima-raw-xundefined-oblique.png` | 047afd6a51e136ec2b5f9b32903313713deae025a0000b77aa32806f61ffe381 |
| `raw/japan-local-terrain/r5-kawanakajima-cap30-xundefined-close.png` | 73e0873a17560f68a0591d2ab7e763fe1504a1562ab10827d6e8838431f9edf7 |
| `raw/japan-local-terrain/r5-kawanakajima-default-xundefined-close.png` | e29145564358d077fb6169a66039476753b4dc8fb2f3a7b2ea7283d572c9422d |
| `raw/japan-local-terrain/r5-kawanakajima-uncapped-xundefined-close.png` | 8751fc540f282a40bab3f2375a5177700acea721d0ed87dda3afa9e71eed3345 |
| `raw/japan-local-terrain/r5-nagashino-default-xundefined-close.png` | d36db73528c8b0d5f07d800afd12795ba98b0c5eca0d917a746c4eb2d602d84e |
| `raw/japan-local-terrain/r5-okehazama-gsi-xundefined-close.png` | fce809080ab6215ae415fdd867199ba15abee1732ea499595c314bae33db19ab |
| `raw/japan-local-terrain/r5-okehazama-terrarium-xundefined-close.png` | e516e1b2eb3cc72ef17f372974f1e496052e63b4dba29aa12b5f52a6a32c278f |
| `raw/japan-local-terrain/r5-sekigahara-cap30-xundefined-oblique.png` | a0b7a03e270687b04f8311859db4b85ae1faa74a9ac3e1fea5fee0e8d3a2c0ad |
| `raw/japan-local-terrain/r5-sekigahara-default-xundefined-close.png` | c0a8665a7b829b7a7970fab485f47097abc6d4606062ce264f9ad098823f3206 |
| `raw/japan-local-terrain/r5-sekigahara-default-xundefined-oblique.png` | 1d669aec886bc00e09bae0734a3da1075f750647581f71f7639235644e36116f |
| `raw/japan-local-terrain/r5-sekigahara-raw-xundefined-oblique.png` | 0a6b4d3ccb30959a60bb8f9ca6e4c2353e91ac51eb0c3d2c4568c0fc1219541e |

## R6：実在河川・Height scale・日本全体の負荷

### 実在河川

`node scripts/bakeJapanRivers.mjs`：国土地理院ベクトルタイル（試験公開 `experimental_bvmap`）z8 の `river` 層（地球地図日本、1:100万）。79タイル・5秒。34,791本・190,061点、4.8MB（`rivers.json`、SHA-256 91e1dfd9cdb9c58bb831c443e4c773f88135eefd5b3f3f1b8b734e7ebc069036）。国土数値情報 W05（河川）は使用許諾が「非商用」のため使わない。

局地窓では既定で実在河川を描き、その線で廊下を掘る（`riverSource: "real"`）。FMG の河川は描かない。

| 地点 | 河川 | 川の標本 | 掘る（>1m） | 30m超 | 最大 | 平均 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 関ヶ原 | FMG | 3,690 | 2,541 | 1,448（39%） | 835m | 87m |
| 関ヶ原 | 実在 | 15,576 | 3,845 | 383（2.5%） | 120m | 3.3m |
| 川中島 | 実在 | 40,328 | 7,523 | 675（1.7%） | 126m | 2.3m |
| 厳島 | 実在 | 30,520 | 12,309 | 1,460（4.8%） | 113m | 5.8m |

実在河川は谷を通るので、掘る量は平均2〜6mに収まる。30m超の残りは、1:100万の線の位置ずれ（数百m）で谷壁に乗る区間。描き直しは0.32〜0.36秒（川の標本が増えたため、R5 より約0.05秒増）。

### Height scale

誇張率は 3D Options の Height scale から決める：`誇張率 = Height scale ÷ (50/3)`（既定50で×3、25で×1.5、100で×6）。接敵モードの×4 は廃止し、Height scale に従う。

### 海岸線

段の陸ビット（Natural Earth admin-1、1:1000万）は250mの窓には粗く、厳島付近で海岸が角張った。陸と海を段の標高（0mより上が陸）で決めるように変えた。段の無い所は `japan.bin` の陸ビットかつ標高0m超（`japan.bin` の陸ビットにある海上の横帯を消すため）。

### 日本全体の焼き込み（実測）

沖縄（JP-47）は地図の範囲外（南端29.9°N）。東京都は小笠原などの島を除いて焼いた。46都道府県×3段、Terrarium、合計10分30秒（タイル取得を含む、1件は ECONNRESET で再実行）。

| 段 | ファイル | 合計 | Terrarium タイル | 格子点 | 陸だけ（int16）の推定 | 倍率 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1km | 46 | 2.3MB | 337 | 1.09M | 0.76MB | 3.0 |
| 500m | 46 | 9.2MB | 926 | 4.34M | 3.0MB | 3.1 |
| 250m | 46 | 36.9MB | 3,003 | 17.3M | 12MB | 3.1 |
| 100m（推定） | — | 約150MB | 約19,000（z12） | 約108M | 76MB | 約2 |

100m は愛知・岐阜・長野の実測（3県で12.2MB、陸2.94万km²）を陸域37.8万km²に比例させた。タイルのキャッシュは `temp/terrarium-cache` で217MB。

都道府県ごとの外接矩形は陸だけの約3倍になる（海と隣県の NODATA）。一覧: [japan-local-dem-files-20261117.md](./japan-local-dem-files-20261117.md)。

### 日本全体を読み込んだときの負荷

全段（46県×3段＋100m 4枚＝142枚）を地図の読み込み時にまとめて読む今の実装で測った。

| 項目 | 値 |
| :--- | :--- |
| ラスタのデコード後 | 88.6MB（標高 int16 と陸ビットの展開分） |
| 読み込み時間 | 250〜350ms（開発サーバーから、キャッシュあり） |
| JS ヒープ | 1.13〜1.31GB（地図全体を含む。読み込み前の測定なし） |

日本全体を1つの窓にした場合（`footDays` 45、環なし）：

| 間隔 | 頂点 | 描き直し | ジオメトリ | rAF |
| :--- | :--- | :--- | :--- | :--- |
| 4km | 235,620 | 1.6秒 | 14MB | 60 |
| 2km | 941,460 | 4.1秒 | 56MB | 60 |
| 1km | 3,763,994 | 12.4秒 | 226MB | 60 |

描き直しの大半は、窓内の全都市の平坦化（385）と全実在河川の標本（67万点）の準備。表示はヘッドレス Chromium で60fpsを保ったが、1kmでは描き直しが実用にならない。日本全体の俯瞰では、陰影の起伏は画面上ほとんど見えない（地図の水平尺度に対して山が低い）。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r6-honshu-japan-1km-japan.png` | 56995931136224554b715c8459e8cfedb5d94635784fd29ed104df02a059e5ee |
| `raw/japan-local-terrain/r6-honshu-japan-2km-japan.png` | 4233b02b12f6f68754b5c888d853717b822340308253d14b4cc6b31265ec6484 |
| `raw/japan-local-terrain/r6-honshu-japan-4km-japan.png` | 94681a7503244aa9be89d499ea0c7d34623d69c7a50ca592db18d11dd7a488ac |
| `raw/japan-local-terrain/r6-itsukushima-allPrefs-oblique.png` | 6d6699b37fb517afa1a816ee1758d08cba7628500d5954ffb51566eac406339e |
| `raw/japan-local-terrain/r6-itsukushima-demCoast-oblique.png` | 370b247f38c2abc2d7e08c0beaebe3a3fd7e03ce9ae9ef5fef40e7e958c0d79f |
| `raw/japan-local-terrain/r6-kawanakajima-realRivers-close.png` | 77690dc0d42294f2ef248b1896ff80ef11100d72d29f7f893db4f0dd503672ef |
| `raw/japan-local-terrain/r6-sekigahara-demCoast-oblique.png` | 9b0df82a42d091b7633b784dc88971dbf7510b2ec3d53401af044a0125c4ce40 |
| `raw/japan-local-terrain/r6-sekigahara-fmgRivers-oblique.png` | 22c85c0c5532d14f228e893608408ea806b16bb312d26403d026558d6dfc4911 |
| `raw/japan-local-terrain/r6-sekigahara-hs100-oblique.png` | 2b5fb7707db9a08f7889790f03c63fc5587b634337aecc185b525a075502e504 |
| `raw/japan-local-terrain/r6-sekigahara-hs25-oblique.png` | 4d7a4b7138f4b405e5703f9ce3cff00d29fad52b09689fef6a5803c1f732f526 |
| `raw/japan-local-terrain/r6-sekigahara-realRivers-close.png` | 86bc6dfd9075204eeeff1f500e5713d8038a5a5a91b6cec9b66c435711a1df33 |
| `raw/japan-local-terrain/r6-sekigahara-realRivers-oblique.png` | 298437cad34092754546c5bcbeffc73889060952ab9d5f9e6f3224f51f1506e1 |

### 浮いた線の修正

近接で川・境界線・街道が空中に浮いていた。原因は二つ。

1. 線の持ち上げ `CAMPAIGN_LINE_LIFT`（0.75）はセル標高メッシュの単位で、既定の Height scale では約40m。実尺の局地窓（約1.6km/px、×3）では1単位が約540mになり、線が約400m、駒が約800m浮いていた。
2. 線は折れ線の頂点だけで高さを取っていた。地球地図の川は頂点の間隔が数百m〜数kmあり、谷と尾根を弦で結んで空中や地中を通っていた。

局地窓では、持ち上げを15m相当に縮め（`liftScale`）、線を250mごとに分けて各点を地表に載せる（`drapeStepPx`）。描き直しは0.39〜0.42秒（約0.05秒増）。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r6-kawanakajima-draped-close.png` | dc0b5d2df5f20eb1e33b41bc05e0fee371889b64efb351f08dd5dc97a09256aa |
| `raw/japan-local-terrain/r6-sekigahara-draped-close.png` | cb00950b16a62dce4251911b81f5ca7421bd8b61893d7b8aaf6717c583b1ab8f |
| `raw/japan-local-terrain/r6-sekigahara-draped-oblique.png` | 5005a04e8217b5644ae925a8aff5920ec4f2ce7a6363f83f4bbeaa1bc186f443 |

### 河川の既定を FMG に戻す・FMG の河川を水面で描く

配布は案A（河川データを含まない）に決まったため、既定を FMG の河川に戻した。FMG の河川は 2D と同じ蛇行点と川幅で水面として塗る。海の判定は、DEM が +0.5m 超で陸、-5m 未満で海、その間は FMG のセルに従う（東京東部のゼロメートル地帯で陸に青い点が出ていたため）。

| 地点 | 河川 | 川の標本 | 30m超 | 最大 | 平均 | 描き直し |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 東京・作戦 | FMG（幅あり） | 3,364 | 255 | 975m | 27m | 0.42秒 |
| 東京・作戦 | 実在 | 9,281 | 335 | 112m | 4.7m | 0.39秒 |
| 関ヶ原・作戦 | FMG（幅あり） | 3,949 | 1,656 | 1,094m | 95m | 0.44秒 |

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r6-tokyo-fmgRivers-close.png` | d3c5ff6af1e4730d797974334a60d9b2114608ad947214a556f4c0b0b0c6db08 |
| `raw/japan-local-terrain/r6-tokyo-fmgRivers-oblique.png` | 8928608f38387cf1e84173425b1db7a8f70a834788b7865bb9d4199ab94570f2 |
| `raw/japan-local-terrain/r6-tokyo-realRivers-oblique.png` | 9db6a89c88bed2d5b0e539b287fa8680ebfb69de4b25d55c36d9de3892091e15 |
| `raw/japan-local-terrain/r6-sekigahara-fmgRivers-oblique.png` | ce4f3124e6b9be51f5d9bd9210d548f813b27127146de89b797277b66b5cdb9e |

## R7：案Aの配布で測る・遅延読み込み・FMG の川を谷へ寄せる

`manifest.local.json` と `rivers.json` を一時的に外し、配布される1km・500mの段だけで測った。

| 地点・カメラ | 頂点 | 描き直し | 読んだ段（累計） | 読んだバイト（累計） | 谷寄せの平均 | 30m超 | 平均の掘り下げ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 関ヶ原・作戦（寄せない） | 67,081 | 0.31秒 | 22 | 2.4MB | — | 1,492 | 83m |
| 関ヶ原・作戦（寄せる） | 67,081 | 0.29秒 | 22 | 2.4MB | 0.52km | 1,470 | 79m |
| 関ヶ原・近接 | 67,081 | 0.28秒 | 22 | 2.4MB | 0.52km | 1,470 | 79m |
| 川中島・近接 | 67,081 | 0.27秒 | 36 | 5.3MB | 0.66km | 1,691 | 103m |
| 東京・作戦 | 67,081 | 0.29秒 | 44 | 6.0MB | 0.69km | 198 | 24m |

- 全段を一括で読んでいた R6（88.6MB）に比べ、1窓で2〜3MB。
- 配布の段だけでは中心の起伏は500mまでで、R3 の250mより丸い。尾根と谷の配置は読める。
- 谷寄せは平均0.5〜0.7km動くが、尾根越えの区間はほとんど残る。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r7-kawanakajima-dist-snap-close.png` | 5c37ee9e425d0bb00b41e5cbc9a53cdc40039d84d50f6b3f258f28ba11c2df4d |
| `raw/japan-local-terrain/r7-sekigahara-dist-nosnap-oblique.png` | 4dc682ffee21d0eb22df3ce9c162307e60644f981b5143a1efd5961ac1e49a22 |
| `raw/japan-local-terrain/r7-sekigahara-dist-snap-close.png` | f078654c6899039fe055e481989c072e715c40aef4e6cf8500dd1e7602f10e32 |
| `raw/japan-local-terrain/r7-sekigahara-dist-snap-oblique.png` | dd184f89181fbeb2ecc031ff5e7957c70db4c28f4a47debeaa1518cd7ed559b9 |
| `raw/japan-local-terrain/r7-tokyo-dist-snap-oblique.png` | 28e7991b138793abc0b0b655bd9cd7d16f205f881ccda5cb7196cb06959423bb |

## R8：FMG の川を「下り続ける」条件で谷へ寄せる

R7 の谷寄せ（各点を独立に最低点へ寄せ、あとでならす）を、動的計画法に替えた（`snapRiverToValley`）。各点の横ずれ候補（±半径、250m刻み）から、地面の高さ＋上流からの登り×4＋隣との横ずれの差の和が最小になる経路を選ぶ。隣どうしの横ずれは半径の1/3まで、両端は動かさない。全段（手元の250m・100mを含む）で測った。

| 地点 | 寄せる半径 | 平均の横ずれ | 30m超 | 平均の掘り下げ | 最大 | 描き直し |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 関ヶ原 | なし | — | 1,656 | 95m | 1,094m | 0.41秒 |
| 関ヶ原 | 3km | 1.2km | 1,566 | 79m | 778m | 0.41秒 |
| 関ヶ原 | 6km（既定） | 2.1km | 1,436 | 57m | 514m | 0.41秒 |
| 関ヶ原 | 10km | 3.3km | 1,313 | 53m | 590m | 0.41秒 |
| 川中島 | なし | — | 1,665 | 114m | 1,167m | 0.39秒 |
| 川中島 | 6km | 1.9km | 1,462 | 104m | 1,539m | 0.40秒 |
| 東京 | なし | — | 255 | 27m | 975m | 0.41秒 |
| 東京 | 6km | 2.5km | 169 | 21m | 684m | 0.38秒 |

- 半径6kmで平均の掘り下げは関ヶ原で4割、東京で2割減った。R7 の独立に寄せる方式（3kmで1,492→1,470）より効く。描き直しの時間は変わらない。
- 関ヶ原では、濃尾平野を流れる区間が平野の低い所へ寄り、山地を斜めに横切る線が減った。
- 川中島は山地の中で FMG の川が別の流域を通っており、6kmでは谷に届かない区間が多い。最大値はかえって増えた（寄せた先の尾根越え）。
- 10kmは6kmより少し良いが、FMG の川の形から離れていく。既定は6kmとする。

| 画像 | SHA-256 |
| :--- | :--- |
| `raw/japan-local-terrain/r8-kawanakajima-local-dp6-close.png` | f8a4405cf96624cf8a12da7b8a79fe0de0018bd06b9879663eabc13325129b6c |
| `raw/japan-local-terrain/r8-kawanakajima-local-nosnap-close.png` | 2cf9b68140644611e3815fcacd0773b0e08aa1a8f485465a9ed28f6ba4670a3a |
| `raw/japan-local-terrain/r8-sekigahara-local-dp10-oblique.png` | 6c0b3c50ab3635482c34187df15ca8ea6c9471d33149c86018670d2ec268f764 |
| `raw/japan-local-terrain/r8-sekigahara-local-dp3-oblique.png` | 2520121a833af3fc38fc941e96cfe562ac0552e39093afdee72c7604ce809c66 |
| `raw/japan-local-terrain/r8-sekigahara-local-dp6-close.png` | 065cca20289bbc8a3b9b8e156e38ce47373863a9f5980161ca5a3569ff69e14e |
| `raw/japan-local-terrain/r8-sekigahara-local-dp6-oblique.png` | 0583a97f40e90cef0e15bff54b1dc0defefafa55bc0ac1e5515c15032e4e9cf4 |
| `raw/japan-local-terrain/r8-sekigahara-local-nosnap-oblique.png` | f51ab67667d7d97a06e1b81b10e5cbc3b37e305e6a6a6a5e85358e818481ed98 |
| `raw/japan-local-terrain/r8-tokyo-local-dp6-oblique.png` | baa6d6a83f531a6df9048f70ccf9dd159523019ff67a11e0cd0be3a6d30f0e19 |
| `raw/japan-local-terrain/r8-tokyo-local-nosnap-oblique.png` | ae2153435a3e60194630402d8b4b3b0a0138725a6b5e65a8cee6b10d641ebb78 |
