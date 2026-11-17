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
