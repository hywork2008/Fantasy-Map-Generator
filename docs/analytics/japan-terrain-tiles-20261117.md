# 日本の地形タイル 焼き込み記録（2026-11-17）

設計: [`../plan/japan-terrain-tiles.md`](../plan/japan-terrain-tiles.md)

## T1：z=0〜3 の焼き込み

- コマンド: `node scripts/bakeJapanTiles.mjs`（既定 `--maxZoom 3 --rootKm 256 --samples 65 --fineFrom 2`）
- 入力: `public/heightmaps/earth/japan.bin` と `japan-local/manifest.json` の1km・500m（配布の段のみ。`--local` 無し）
- 枠: 北西隅からのkm、中央緯度38.25°の正距円筒。2,437.6km × 1,846.6km、最上位 10×8 枚
- 焼き込み時間: 11.0秒（M系 Mac mini、1プロセス）
- 出力（Git 管理外 `public/heightmaps/earth/japan-tiles/`）

| 段 | 一辺 | 格子間隔 | タイル数 | 大きさ | gzip | 陸の標本のうち県ラスタ由来 | SHA-256 |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| z0 | 256km | 4km | 57 | 481,650 | 257,903 | 21.8% | `447489d28f6697028e67d73781588cc693e98eaf08f92acb0b40a686ac6fa26d` |
| z1 | 128km | 2km | 180 | 1,521,000 | 900,252 | 21.8% | `61f91a9c0752aa21a0b3543eb8ab727e6c7e4d1d568b19bcca8122f756c320c7` |
| z2 | 64km | 1km | 188 | 1,588,600 | 998,616 | 99.7% | `e5d74cb51e42d9edba364f99d6d6c8f25619e9e30730a39a08a787ce47a3d1a4` |
| z3 | 32km | 500m | 557 | 4,706,650 | 3,141,850 | 99.8% | `69d021775a35c1c85a07cb938bc9d334176a884d9117f18ad21c5b8c4a56f85e` |
| index.json | | | | 30,318 | 10,373 | | `434388fff53fb7e24bf57063169b1560323c95ca4eaeb41589af2a8477f0a0c0` |

- 合計 8.33MB（gzip 5.36MB）。同じ1km・500mの県ラスタ（11.5MB）より小さい。県境の重なりと、県の外の空白（NODATA）が無くなるため。
- z0・z1 は朝鮮半島・大陸・樺太の陸も含む（全体表示用）。そのため県ラスタ由来は2割で、残りは `japan.bin`。z2 以降は日本の県に掛かるタイルだけ。
- z0・z1 は1kmの県ラスタを4km・2km間隔で点で拾うので、平均を取らない分だけ尾根が欠けうる（富士山頂 z0 2,971m、z1 3,446m、z3 3,587m）。全体表示で目立てば、焼き込みで面平均か最大値の段を作る。

### 点検（格子点の値）

| 地点 | z0 | z1 | z2 | z3 | z3 の県 |
| :--- | ---: | ---: | ---: | ---: | :--- |
| 富士山頂 | 2,971m | 3,446m | 3,437m | 3,587m | JP-14, JP-19, JP-22 |
| 東京駅 | 16.5m | 16.5m | 20.5m | 15.5m | JP-08, JP-11, JP-12, JP-13 |
| 琵琶湖 | 81m | 81m | 81m | 81m | JP-21, JP-24, JP-25 |
| ソウル | 47.5m | 77m | — | — | — |

## T2：タイル表示（メインスレッド）

- 有効化：`?ltTiles=1`（調整用。既定は無効）。誤差 `ltTileErr`、上限 `ltTileMax`、段 `ltTileZoom`
- 撮影：`scripts/japanTerrainTilesHarness.js`（Playwright）。Japan テンプレート、Height scale 50、画面 1505×1179。z0〜3（配布の段のみ）
- 窓（従来）は徒歩3日の `campaign-ground`（配布の段、500m/1km 環）

| 撮影 | 描いたタイル | 段ごと（z0/z1/z2/z3） | 頂点 | GPU 側 | 揃うまで | 1回の更新の最大 | FPS |
| :--- | ---: | :--- | ---: | ---: | ---: | ---: | ---: |
| 窓（従来）・斜め | — | — | 114,921 | — | — | （描き直し0.27〜0.4秒） | 60.5 |
| 日本全体 | 92 | 35/57/0/0 | 412,252 | 14.7MB | 0.11秒 | 17.5ms | 60.5 |
| 地方（約400km） | 233 | 1/65/57/110 | 1,044,073 | 37.2MB | 0.31秒 | 14.7ms | 60.5 |
| 関ヶ原・斜め | 182 | 1/55/29/97 | 815,542 | 29.1MB | 0.09秒 | 4.1ms | 61 |
| 関ヶ原・接近（5km上空） | 129 | 1/48/26/54 | 578,049 | 20.6MB | 0.03秒 | 3.3ms | 61 |
| 関ヶ原・地表（1km上空） | 132 | 1/51/28/52 | 591,492 | 21.1MB | 0.03秒 | 2.1ms | 61 |
| 斜め・誤差4px | 99 | 17/13/24/45 | 443,619 | 15.8MB | 0.05秒 | 16.1ms | 60.5 |
| 斜め・誤差1px | 256（上限） | 1/38/47/170 | 1,147,136 | 40.9MB | 0.15秒 | 23.2ms | 60.5 |
| 東京・斜め | 184 | 0/38/35/111 | 824,504 | 29.4MB | 0.05秒 | 20.4ms | 61 |

- 段のデータ（z0〜3）は初回に全段 8.3MB を読む。ヒープは撮影を通して 619→802MB（ページ全体。地図のシミュを含む）。
- 「揃うまで」は1フレーム12枚ずつ作り、作りかけの間は親で代わりに描く。止まりは1回の更新の最大（〜24ms）で、窓を描き直す0.3〜0.4秒より短い。

| 画像 | SHA-256 |
| :--- | :--- |
| t2-sekigahara-window-oblique.png | `fe840c0edb923c08903af26e0d1962a92f3774a96d6b16cd4d128a03885f9e81` |
| t2-sekigahara-tiles-japan.png | `97fadf104b5113f3f2a2ad25b4634a20252119b35d5227c2a61f4ff2338257de` |
| t2-sekigahara-tiles-region.png | `dd97562f74ea1b5dc136bd2b025cb37e88346382f2e64a42f480c526755a3d61` |
| t2-sekigahara-tiles-oblique.png | `f15ba97155f18ce75ecadbc6e802589266b1d7a07f69232029c2a45b8982da44` |
| t2-sekigahara-tiles-close.png | `0860da38e63757a024c5a415365657e1343211736837bafb7499a305095564ab` |
| t2-sekigahara-tiles-ground.png | `0946678e6614138c730f5c15e91258ff53098eb51bbc8e246b3b945169ae2cd4` |
| t2-sekigahara-tiles-err4-oblique.png | `4724acbb73cbf84412ca9c07d27cbe7a287b16d7a3bd25d02de2d194cc5fe46c` |
| t2-sekigahara-tiles-err1-oblique.png | `17892a9bd7f29e769d563ef1576a8138c8c7b080cc36be0b1df640187748638f` |
| t2-tokyo-tiles-oblique.png | `34c5768a779f730e2d3167acaedd865c99e767054c11f0bb9545cc8c4d88d8f7` |

## T3：細かい段（z4・z5）、縁の陰影、高さの拡大

- 焼き込み：`node scripts/bakeJapanTiles.mjs --maxZoom 5 --local`（413秒。z5 の全域走査が大半）。索引 version 2：各タイルの外周に1点ずつ余分に持つ（`border: 1`）、7番目の値 `split`（子が揃っているか）
- 細かい段は、その段以上に細かい県ラスタが陸の5割以上を覆うタイルだけ書く。250m は全県、100m は岐阜・長野・愛知のみ

| 段 | 格子間隔 | タイル数 | 割れる（split=1） | 大きさ | gzip | SHA-256 |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| z0 | 4km | 57 | 57 | 511,746 | 268,736 | `bb68fc75cc376101944314d3c63b45f67f0f7f8003521be1ecf8dec468883fd9` |
| z1 | 2km | 180 | 65 | 1,616,040 | 936,579 | `fbc1f4ab9bb0e8781e686cf115621997d1b26d3b6df14283f24f476d8e783275` |
| z2 | 1km | 186 | 185 | 1,669,908 | 1,011,491 | `c83649166399aa24bbef018eea988f5394985ef11f36c38dac365d6bee0eff0d` |
| z3 | 500m | 555 | 551 | 4,982,790 | 3,191,410 | `5bc5d494ede1485b1e000bc7b3ad7a82dda8e5d4c57d9d87a87c73fec40e4648` |
| z4 | 250m | 1,855 | 114 | 16,654,190 | 10,598,490 | `3e119553fe632a0f1d4d8bff747f126daf9cb3f9a37c99eaadb92d6bf87e1d9c` |
| z5 | 125m | 507 | 0 | 4,551,846 | 3,298,038 | `dccf5c5346408ad03d3a44b5323d0ed1874d93a8d33c5ed5020cdb66ecaa489a` |
| index.json | | | | 109,553 | 36,290 | `ca2c04b35e87d11d6b908d0e961eb55c88ecd4e01aa9fc37c182e17c77a35773` |

- 外周の余分な点で、z0〜3 は T1 より約6%大きい。

| 撮影（`maxZoom` 5） | タイル | 段ごと（z0/1/2/3/4/5） | 頂点 | GPU 側 | 揃うまで | 更新の最大 |
| :--- | ---: | :--- | ---: | ---: | ---: | ---: |
| 窓（従来・接触モード 100m）・接近 | — | — | 168,921 | — | — | 描き直し |
| 日本全体 | 92 | 35/57 | 412,252 | 14.7MB | 0.08秒 | 14.8ms |
| 関ヶ原・斜め | 256（上限） | 1/58/21/51/119/6 | 1,147,136 | 40.9MB | 0.36秒 | 24ms |
| 関ヶ原・接近 | 240 | 1/48/26/22/83/60 | 1,075,440 | 38.3MB | 0.21秒 | 7ms |
| 関ヶ原・地表 | 244 | 1/51/28/23/78/63 | 1,093,364 | 39.0MB | 0.04秒 | 6.5ms |
| 関ヶ原・接近（z4 まで） | 198 | 1/48/26/22/101 | 887,238 | 31.6MB | 0.07秒 | 9.3ms |
| 川中島・接近 | 205 | 0/33/37/31/69/35 | 918,605 | 32.8MB | 0.05秒 | 10.6ms |
| 東京・接近（100m なし） | 256（上限） | 0/33/35/51/137 | 1,147,136 | 40.9MB | 0.05秒 | 11.6ms |

- FPS はすべて 60〜61。段のデータは z0〜5 で 30.0MB を読む（段ごとにファイル全体）。
- Height scale 50→100：表示中の257枚のうち252枚はそのまま（群の縦倍率だけ変わる）。入れ替わった5枚は高さの範囲が変わって選び直されたもの。

| 画像 | SHA-256 |
| :--- | :--- |
| t3-sekigahara-window-close.png | `c812d58bf363a99fffc17f757f9d3c8c4bb5ac791746e35f37a39d097d3b6fa2` |
| t3-sekigahara-z5-japan.png | `720ddc83b7c2256cefeddff70a03ff296dbd94af15b35176570b15ebcd02173a` |
| t3-sekigahara-z5-oblique.png | `7a6b8f690c8be1b80f170da73e086064f62ed6be0a879f83e2a5f57a36549b86` |
| t3-sekigahara-z5-close.png | `e3092815e828a1c368570d844fe76f931e33afe05d4f6b6d952b21ada86aee6d` |
| t3-sekigahara-z5-ground.png | `03e4b810f3f84537fff86112b6bf8b6df12fded659cac09c89c8eea975c4bba4` |
| t3-sekigahara-z4-close.png | `bebea1e29f6a75f778caea114508bd402385c0baa6b8324943621845bfc4fd06` |
| t3-sekigahara-z5-hs100-close.png | `8f39b3738db10e8684dd4f586bf014b438114a204866da8afbe2fdb12df746f2` |
| t3-kawanakajima-z5-close.png | `2a23c0239b9ce63cf3c225664a5a983f6f220ef92d249ec73af2cbeaccd7f5e3` |
| t3-tokyo-z5-close.png | `e58f69d2299e811cf6fb8b396699ca63173fddf838a544ea432ea94d24263eb6` |

## T4：遠景の制限、都道府県の部分表示、国の色（任意）

- 県マスク：`node scripts/bakeJapanTiles.mjs --maskOnly` で `prefectures.bin`（1km格子、2,438×1,847、4,506,680 bytes、gzip 26,554、SHA-256 `9618a88b03081de1707d3da8d6587647417628f6e71de7cd01133615c48abdc5`）と索引の `prefectureMask` を追加。index.json は 109,635 bytes、`bcb7dbedbd2e7c0eb809b096d99bf3991f60cf7e075d1ccf1da87a0f9d715d09`
- 撮影は `maxZoom` 5、Height scale 50

| 撮影 | タイル | 段ごと（z0/1/2/3/4/5） | 頂点 | GPU 側 | 揃うまで |
| :--- | ---: | :--- | ---: | ---: | ---: |
| 関ヶ原・斜め・遠景制限なし | 256（上限） | 1/58/21/51/119/6 | 1,147,136 | 40.9MB | 0.19秒 |
| 関ヶ原・斜め・200km | 256（上限） | 1/68/2/34/137/14 | 1,147,136 | 40.9MB | 0.18秒 |
| 関ヶ原・斜め・100km | 247 | 1/71/4/12/133/26 | 1,106,807 | 39.5MB | 0.18秒 |
| 関ヶ原・接近・100km | 163 | 1/61/2/4/35/60 | 730,403 | 26.0MB | 0.07秒 |
| 東京・接近・100km | 118 | 0/52/5/3/58 | 528,758 | 18.9MB | 0.04秒 |
| 岐阜・滋賀のみ・日本全体 | 7 | 0/7 | 31,367 | 1.1MB | 0.03秒 |
| 岐阜・滋賀のみ・斜め | 75 | 0/1/0/4/70 | 336,075 | 12.0MB | 0.11秒 |
| 国の色・斜め・100km | 247 | 1/71/4/12/133/26 | 1,106,807 | 39.5MB | 0.17秒 |
| 国の色・日本全体 | 92 | 35/57 | 412,252 | 14.7MB | 0.10秒 |

- 遠景の制限は、斜めでは浮いた枠を窓の近くの z4・z5 に回す（枚数はほぼ同じ、近くが細かくなる）。接近では枚数が減る（関ヶ原 240→163、東京 256→118）。
- FPS はすべて 60〜61。

| 画像 | SHA-256 |
| :--- | :--- |
| t4-sekigahara-far0-oblique.png | `a7b0f95f7dda65c0034242de910f0c73243bd05d03013fb1bfb633ce6022c625` |
| t4-sekigahara-far200-oblique.png | `4dfbaeefb871dbdca586f0ea2f6dd24ff6451d654f75946c75167af0cfeadaa3` |
| t4-sekigahara-far100-oblique.png | `964fae7c8adbbaf778ede7e292381c8d051f7fd27dfe7fa5a9c260a93d705a8c` |
| t4-sekigahara-far100-close.png | `07ae047cae5905837b721877b23ad9207f186be75ced2513caa9a3c2146d58b9` |
| t4-tokyo-far100-close.png | `30967090e6b72132ae6983fe950a75c815861a7353aae20d2f652ca0dcca847b` |
| t4-sekigahara-gifu-shiga-japan.png | `e856ae93094bc02187a3ea738907c0df88da25c536be658293169b959914264f` |
| t4-sekigahara-gifu-shiga-oblique.png | `81d13773b9fe239f8713e9fee1c5f38a096933102f58bd2619bebd220dfa00cd` |
| t4-sekigahara-states-oblique.png | `d5030a96fcf9d4bbe06514de1f803eff65f7458ff9ef31ef1efee97419357f6d` |
| t4-sekigahara-states-japan.png | `af1f77f1934f486e4deec0d5e3563c1547e4ba580241be228958dde002303225` |

## T5：既定化、配布の段、タイル単位の読み込み

- 焼き込み：`node scripts/bakeJapanTiles.mjs --maxZoom 5 --local` が 26.8秒（T3 は413秒）。z3 以降は1段上で焼いたタイルの子だけ走査する。z3 は 555→553 枚（親の z2 が陸なしで落ちた2枚）。
- 配布（コミット）は 500m 以上：`index.json`・`z0.bin`〜`z3.bin`・`prefectures.bin`。z4・z5 と `index.local.json` は Git 管理外。

| ファイル | 大きさ | SHA-256 |
| :--- | ---: | :--- |
| index.json | 32,195 | `abc651a713e4ccf517de36bdbe7b7dca797e9bee4b4d2b1a2b061bbe5bb3c8ac` |
| z0.bin | 511,746 | `bb68fc75cc376101944314d3c63b45f67f0f7f8003521be1ecf8dec468883fd9` |
| z1.bin | 1,616,040 | `fbc1f4ab9bb0e8781e686cf115621997d1b26d3b6df14283f24f476d8e783275` |
| z2.bin | 1,669,908 | `c83649166399aa24bbef018eea988f5394985ef11f36c38dac365d6bee0eff0d` |
| z3.bin | 4,964,834 | `b050973efe777af1face1def4288f82f228b11d27c78c418c6024b2ae369c513` |
| prefectures.bin | 4,506,680 | `9618a88b03081de1707d3da8d6587647417628f6e71de7cd01133615c48abdc5` |
| （手元）index.local.json | 77,304 | `d8341c1197211fd60e20339c9cae38e111867d0eb81812b036330a8823632f1c` |
| （手元）z4.bin | 16,627,256 | `92341e6a75bdaf43ea6a4bca1591bec7efc50e80d716252e1bd55a8bc3a40204` |
| （手元）z5.bin | 4,551,846 | `dccf5c5346408ad03d3a44b5323d0ed1874d93a8d33c5ed5020cdb66ecaa489a` |

- 読み込み：2MB 以下の段（z0〜z2、3.8MB）は丸ごと、z3 以降は1枚ずつ HTTP Range（同時8本、メモリ上は48MBまで LRU）。Range が効かない配信なら段ごと丸ごとに切り替える。開発サーバー（Vite）では Range が効いた。
- 既定の設定（タイル表示・`maxZoom` 5・`farKm` 100）で撮影。dist は z4・z5・`index.local.json` を退避した配布の状態。

| 撮影 | 組 | タイル | 段ごと（z0/1/2/3/4/5） | 頂点 | 読み込んだ高さ | Range で読んだタイル | 揃うまで |
| :--- | :--- | ---: | :--- | ---: | ---: | ---: | ---: |
| 関ヶ原・日本全体 | dist | 92 | 35/57 | 412,252 | 4.05MB | 28 | 0.10秒 |
| 関ヶ原・斜め | dist | 126 | 1/71/4/50 | 564,606 | 4.25MB | 50 | 0.16秒 |
| 関ヶ原・接近 | dist | 85 | 1/61/2/21 | 380,885 | 4.25MB | 50 | 0.03秒 |
| 東京・接近 | dist | 77 | 0/52/5/20 | 345,037 | 4.51MB | 79 | 0.04秒 |
| 川中島・接近 | dist | 73 | 0/50/3/20 | 327,113 | 4.73MB | 104 | 0.03秒 |
| 関ヶ原・日本全体 | local | 92 | 35/57 | 412,252 | 5.05MB | 139 | 0.10秒 |
| 関ヶ原・斜め | local | 247 | 1/71/4/12/133/26 | 1,106,807 | 6.13MB | 260 | 0.32秒 |
| 関ヶ原・接近 | local | 163 | 1/61/2/4/35/60 | 730,403 | 6.30MB | 279 | 0.07秒 |
| 東京・接近 | local | 118 | 0/52/5/3/58 | 528,758 | 7.21MB | 380 | 0.04秒 |
| 川中島・接近 | local | 123 | 0/50/3/4/31/35 | 551,163 | 8.39MB | 511 | 0.03秒 |

- 読み込んだ高さは、T3・T4 の段ごと丸ごと（30.0MB）から 4〜8MB に減った（撮影を順に回した累計）。FPS はすべて 60〜61。

| 画像 | SHA-256 |
| :--- | :--- |
| t5-sekigahara-dist-japan.png | `83ccd99f497174fc39417d8373510eba91723e31ae467f3b0045616e9434db35` |
| t5-sekigahara-dist-oblique.png | `315a3da7d41113a45badbb6a9b1bf3af74ddf6dfa67cbf515dc75df50e0fa84e` |
| t5-sekigahara-dist-close.png | `c1b57849476da83f794cc867915b8c8f25bb9fa3288de7b550008f9fa490a854` |
| t5-sekigahara-dist-ground.png | `5beecbb9162a47afeace7397e93ab07080c04f41c0462b59c6d368e51042e9f9` |
| t5-tokyo-dist-close.png | `f5894251736a0742a57f1f9a1ea233c51339c5ca44577880f6cd018a597166a7` |
| t5-kawanakajima-dist-close.png | `d7ccf117e86af843a1be568f6c336a4e71d2cc32f38957707b880c0bf93777bf` |
| t5-sekigahara-local-japan.png | `5ac2a3f40b9ae9d2b243d0c72bb0ea359fa6bc191956b8bdac0fe39174cda772` |
| t5-sekigahara-local-oblique.png | `a26d48cbd97aba805c863f79775045cab6d3476f15bf28ecd0ce73ee691f006c` |
| t5-sekigahara-local-close.png | `48a92655ad852cbc173decade0e8048b605098f431094792162e6121fb381c8e` |
| t5-sekigahara-local-ground.png | `864958f33691af8a9980a78aa520a7ffc3e164cc9fd02b20f4e656d37401dd15` |
| t5-tokyo-local-close.png | `52c9e343195872150a07303d846cb5796146bb9100c75a7628b5cad87501fb22` |
| t5-kawanakajima-local-close.png | `e0b271fd0ed1865b8544a3c244eb2a85e3c815825a54055d73ee845e1831c691` |

## T6：窓の地面を作らない、線と駒の高さをタイルから取る

- 川中島・接近（手元の全段）で `ThreeDRenderer.redraw` を2回ずつ計測。タイル表示の切り替えは `window.__fmgLocalTerrain`。

| 状態 | 窓の地面の頂点 | 描き直し |
| :--- | ---: | ---: |
| タイル表示（地面を作らない） | 0 | 38ms、24ms |
| 従来の窓（`tiles.enabled` false） | 114,921 | 373ms、372ms |

- 線の高さ：窓の中の線（川・道・境界・行軍）の頂点 15,054 点で、読み込み済みの最も細かいタイルの高さとの差は平均 +15m（`liftScale` の15m）、地面より下の点は0。
- 画像 `t6-kawanakajima-local-close.png`：`37a9eb78e688e2647880a2a6b47c1ed699c059d35e01dc6ca3ebda762a3548e9`

## T7：川の谷寄せと海岸の判定をタイルの高さで行う（比較）

- 実装：`tiles.fieldSource`（URL `ltFieldSource=tiles`、既定は `prefectures` のまま）。`tiles` のときは `createLocalTerrainField` の高さ・海岸をタイルから読み、残りは地域ラスタ（`japan.bin`）だけの sampler で補う。`japan-local/` は読まない。
- 焼き直し：県ラスタが無く `japan.bin` で埋めた点のうち、`japan.bin` の陸マスクが海の所は -6m 以下で書く（従来の sampler が陸マスクで「海」と答えていた所を、タイルでも海と答えるため）。z0〜z3 の新しい SHA-256：index.json `0d4bba2ee4569a1ee7ed59e288ff200ae60806cd3901259ed494770dc12b638c`、z0 `0af0eff8a53c4506452e32bc7af05e473cf81a4366a2dcc780d397bdaf013284`（511,746）、z1 `fb2264b2c84cce1cd1cfdbc1a82e4eab4b0c4e4b2f356c382fbec468aa653a47`（1,607,062、179枚）、z2 `0cffe0ebdb9ffb767058b33e9a4f24873057530bab9f6a5229282812b5f5e8ca`（1,669,908）、z3 `37a112285da9647c66e660d308d6b8cccf4f8838ae5cdc610d72ecfd30e6493d`（4,973,812、554枚）。
- 測定：`scripts/japanFieldCompareHarness.js`（同じ地図・同じ窓で `prefectures` → `tiles` → `prefectures` の順に作り、川の各点のずれと海岸を比べる）、`scripts/japanFieldOverlay.js`（重ね描き）。窓は中心から 84km 四方、海岸は 0.5km 格子（約11.3万点）。
- 同じ設定で2回作った川のずれ（繰り返し）はどの地点も 0。結果は決定的。
- 「local」は手元の全段（250m・100m あり）、「dist」は配布の状態（`manifest.local.json`・z4・z5・`index.local.json` を退避）。地図はページを開き直すたびに作り直されるので、local と dist は別の地図。

### 川の位置（FMG の川を谷へ寄せた後の、点ごとのずれ）

| 組 | 地点 | 川 | 点 | 平均 | 中央 | 95% | 最大 | 1km 超 |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| local | 関ヶ原 | 7 | 62 | 1.30km | 0.25km | 6.0km | 7.5km | 18 |
| local | 川中島 | 6 | 39 | 0.24km | 0 | 1.75km | 1.75km | 3 |
| local | 東京 | 3 | 29 | 0.42km | 0 | 2.25km | 2.25km | 5 |
| dist | 関ヶ原 | 7 | 56 | 0.67km | 0.5km | 3.0km | 4.0km | 14 |
| dist | 川中島 | 7 | 53 | 0.74km | 0.25km | 3.5km | 5.75km | 10 |
| dist | 東京 | 4 | 38 | 1.08km | 0.5km | 5.5km | 6.0km | 10 |

- 谷寄せの半径は 6km。ずれの大きい区間は、関ヶ原（local）の木曽川上流で隣の谷を選んだ1本と、関東平野・濃尾平野のような平地（谷の底が決まらない所）。山間の川（川中島 local）はほぼ重なる。
- 谷寄せ後の平均の掘り下げ：関ヶ原 local 60.7→58.4m、川中島 94.7→83.5m、東京 5.7→5.1m（prefectures→tiles）。

### 海岸（DEM の三値 landAt の一致）

| 組 | 地点 | 不一致 | うち陸と海が逆 | `field.waterAt`（川の塗りを含む）の不一致 |
| :--- | :--- | ---: | ---: | ---: |
| local | 関ヶ原 | 1.27% | 67点 | 2.07% |
| local | 川中島 | 0.19% | 44点 | 0.40% |
| local | 東京 | 0.93% | 61点 | 0.73% |
| dist | 関ヶ原 | 3.46% | 202点 | 2.29% |
| dist | 川中島 | 0.29% | 117点 | 0.92% |
| dist | 東京 | 1.80% | 225点 | 2.04% |

- 不一致の大半は「片方が未定（-5〜+0.5m）で FMG のセルに任せる」点。陸と海が逆になるのは海岸線に沿った1点幅（0.5km）で、タイルの格子が県ラスタの格子と半目ずれているため。重ね描きでは海岸線の縁の点として出る。
- dist の関ヶ原は「県ラスタ：海／タイル：未定」が 2,539点。陸の無い z3 タイルは焼かないので、その海では z2（1km）の値を読み、海岸近くで -5m より浅くなる。

| ファイル | SHA-256 |
| :--- | :--- |
| t7-local-rivers.json | `425eb763b06c6daf7ad7a4d3b5bd23e52eff4dbc2c4f904f42fb6a55ab8cde91` |
| t7-dist-rivers.json | `22e50edf8da0e9f4f11ad09326403195bfe597966eb594b101672f1a175ed6ca` |
| t7-local-sekigahara-overlay.png | `68bf7aeeacc814f9ffa9917d8c37dd66aa163bc1b13d0d40a094ff10525f1929` |
| t7-local-kawanakajima-overlay.png | `b042aa24a10ce0dfbca3a0b20c986a4eac672252307e98e7000cf0b3b2c706c8` |
| t7-local-tokyo-overlay.png | `35d85a485feb394b2d73544e108dc9c6642abf809d7aec4493338eb6118b58ab` |
| t7-dist-sekigahara-overlay.png | `cb1b79453df79270ee7e95f39d280978e6f8059ca953afdbbb53cc184d1b7fc2` |
| t7-dist-kawanakajima-overlay.png | `2e285cee6ec3b80846450853a1a0a64d8b520654e17d903ec8f1f10a03a37a33` |
| t7-dist-tokyo-overlay.png | `39622f7148868e4a5f9d8288c02302d2ece28ef3ae74e0515efe777ca8ce205d` |
