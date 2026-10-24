# CE elevation / Height field 性能調査

調査日: 2026-10-24。対象: `4c3ee77b1`。今回は調査・計測スクリプトの追加のみで、生成・描画の実装は変更していない。

## 結論

主因はCragのノイズ生成そのものよりも、**建物ごとに増えるpadと、それを合成した地形の描画用三角形を生成中にも構築すること**だった。

600 m / Tiny / hexの固定seedで、Height fieldなしの生成は627 ms、Cragでは6,803 ms。Cragの内訳は街区等97 ms、field取付87 ms、最終farmland 6,616 msだった。実都市には644個のpadができ、その後の `cityTerrain` 単体で6,036 ms、75,233枚の局所地形三角形ができた。通常の生成でも3Dを開く前からこの負荷を支払う。

3Dの地面構築にも別の負荷がある。90,601点の描画格子を作ったあと、着色用の傾斜を93,604回計算し、高さをさらに374,416回評価する。この高さ評価が全地形要素を走査するため、644 padの都市では格子458 ms、チャンク1,887 ms。法線生成16 ms、stamp 0.8 msは今回の主因ではなかった。

## 条件・測定範囲

- Apple M4 / Node v22.23.1。packageの要求はNode >=24なので、正式な性能予算を決める前に対応ランタイムでも再測定する。
- seed: `terrain-profile-20261024`。実都市はTiny / hex / inland / 川なし、既定設定からcoast・rivers・portとHeight fieldのみを指定した。
- 実都市生成は各条件1回。履歴上の旧実装との比較ではなく、現在のコードでHeight fieldなしとCragを比較したもの。高さ条件が変わると建物等の出力も変わる。
- fieldは現在1,200 m以下に限定される。セル標高モード・より大きい都市・水面の多い都市で同じ内訳になるかは未測定。
- 合成pad試験は既存のcliff-fortress studyに人工的な小さい矩形padを0 / 64 / 256個追加。3回中、後半2回の平均を暖機値として掲載する。studyの生成サンプルは4 m、通常の生成は既定2 m。
- 描画格子はauto（600 mでは2 m）。チャンクの頂点数・index数はpad数に依存しない。`vertices` は既存実装の未使用バッファ末尾も含み、`slopeCalls` は実際に書いた頂点数。
- **道路リボンは渡していない**。地形単体のCPU費用を切り分けた測定。ブラウザの `cityView.sync` は道路を渡すので、道路造成を含む実際の総時間は別途確認が必要。
- GPU転送・フレーム時間・UIの履歴構築・FMG全体の生成は対象外。Nodeで実際のCE生成関数と地形・Three.jsの法線計算を実行した。
- `ruralSuitabilityMs` は別途 `cityTerrain` を再構築するため、`modelMs` を含む別呼出し。生成時間・farmland時間・各診断時間を加算してユーザーの待ち時間としない。
- 生データ: [ce-terrain-performance-2026-10-24.json](../../diagnostics/ce-terrain-performance-2026-10-24.json)。CPUプロファイル実行値は通常実行値と区別して保存した。

## 実測

### 実際の生成都市

| 処理 (ms) | Height fieldなし | Crag / pad 644個 |
| --- | ---: | ---: |
| 生成全体（入力グリッド作成を含む） | 626.6 | 6,803.3 |
| 生成後のcityTerrain | 0.8 | 6,035.8 |
| 描画格子 | 対象外 | 458.4 |
| チャンク・実傾斜 | 対象外 | 1,886.7 |
| チャンク・傾斜0の対照 | 対象外 | 9.6 |
| Three.js法線 | 対象外 | 16.0 |
| ruralSuitability（モデル再構築込み） | 1.3 | 5,963.1 |
| 局所地形三角形数 | 380 | 75,233 |

同じ生成済みCrag都市から、診断用のコピーでpadだけを除く対照も実行した。地形モデル初回47.7 ms、後半2回は約1.0 ms、チャンク初回21.9 ms、以後16–18 ms、局所三角形0枚となった。**Cragの自然地形と描画格子の頂点数を保ったまま大幅に軽くなる**ため、pad合成と境界処理の影響が強い。padを消すことは地面形状を変えるため、この対照を製品の修正案として扱わない。

### pad数だけを増やす対照（暖機後2回の平均、ms）

| 追加pad | モデル | 格子 | 実傾斜チャンク | 傾斜0チャンク | 法線 | ruralSuitability | 局所三角形 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1.8 | 8.5 | 36.5 | 8.1 | 9.9 | 4.0 | 236 |
| 64 | 34.4 | 52.5 | 215.9 | 6.2 | 10.3 | 47.7 | 2,116 |
| 256 | 242.0 | 177.0 | 733.1 | 6.9 | 9.9 | 286.0 | 4,888 |

描画格子は全条件90,601点。傾斜を0にした対照のメッシュ生成・法線費用はほぼ一定で、傾斜に使う合成高さ評価の増加を切り分けられる。これは着色結果を変更する診断用対照であり、傾斜着色の削除を提案するものではない。

### CPUサンプリング

生成＋生成後のモデル・格子・チャンク・農地適性診断1回を `--cpu-prof` で測った。サンプルの祖先スタックにより分類すると、`gradedPatches` 配下は約16.47秒、`terrainChunkGeometry` 配下は約1.90秒、`buildDrawGrid` 配下は約0.46秒だった。前者は生成時・診断モデル・農地適性の複数回を含む累積であり、1回の関数時間ではない。これは排他的な分類（先にgradedPatchesを判定）なので親子を二重に足していない。GC等の専用スタックはotherに入る。

自己サンプルでは `evaluateTerrainFeatures` 約5.69秒、`edgeDistance` 約3.94秒、`clipPolygonHalfPlane` 約1.26秒、`onTerrainEscarpment` 約1.17秒が目立った。サンプリング・JITインライン化による帰属のずれがあるため、細かな比率よりも三角形境界処理と地形合成の特定に使う。

## 原因と呼出し経路

1. `generateCityOnDocument` → `generateRuralFieldStage(..., {createLotPads:true})` → 最終fabricから `installLotPads` → `applyRuralFields` → `ruralSuitability` → `cityTerrain`。
   - [ruralFieldStage.ts](../../../src/city-editor/generators/ruralFieldStage.ts) は農地に使うfabricをpad生成にも共有している。現行コードに対し「pad用に常にfabric全体を余分に生成する」ことを主因とは断定できない。
   - [ruralSuitability.ts:10](../../../src/city-editor/generators/ruralSuitability.ts) はまずモデル全体を生成する。しかしfieldモードでは `terrain.triangles` を使わず、8 m格子の `slopeAt` で判定している。不要な描画三角形生成を約6秒支払っている。
2. [terrainElevation.ts:449](../../../src/city-editor/generators/terrainElevation.ts) の `gradedPatches` と `PatchIndex` がモデル作成時に即時実行される。draw gridだけは遅延だが、三角形は遅延していない。
   - `fieldSeedSurface` がpadの全頂点をfociとして近隣セルを選ぶ。
   - `gradedPatches.emit` が種三角形ごとに全creaseを調べ、境界に沿って多角形を切る。padの辺が増えるほど走査と分割が増え、実都市では75,233枚となる。
   - 三角形の高さ、崖判定も各点で地形要素を走査する。空間的に遠いpadを候補から外す全体索引はない。個々のoutlineにはboundsとedge binsがあるが、全feature走査自体は残る。
3. [terrainModel.ts:203](../../../src/city-editor/generators/terrainModel.ts) の `evaluateTerrainFeatures` は川・platform・ringCutを順次走査。高頻度のheightAt呼出しごとに地形要素数に比例する費用が発生する。
4. [terrainElevation.ts:457](../../../src/city-editor/generators/terrainElevation.ts) の `slopeAt` は中心差分のためheightAtを4回評価する。[drawGrid.ts](../../../src/city-editor/generators/terrainField/drawGrid.ts) は着色時に各頂点とskirtで呼ぶ。共有境界の重複評価もある。
5. [blockInfill.ts:540](../../../src/city-editor/generators/blockInfill.ts) の建物適性判定も、fieldがあると `cityTerrain` を構築する。基礎高さや傾斜のみを使う経路にも描画三角形の費用が混ざる。呼出し回数はfabricキャッシュ・住宅調整・再試行次第で変わるため、今回の都市以外での累積費用は未確定。

補足: fieldキャッシュは自然地形の格子だけを保持する。[build.ts](../../../src/city-editor/generators/terrainField/build.ts) のキャッシュにhitしても、合成地形・三角形・描画格子・傾斜の再利用にはならない。`cityView.sync` のstamp判定は再構築を抑えるが、変更後の最初の構築は依然重い。stampそのものを最優先で最適化する根拠は今回なかった。

## チューニングの着手順

### 1. 問い合わせ用地形と描画用三角形の分離（最優先）

`heightAt` / `slopeAt` / `surfaceAt` / field基礎計算を、`gradedPatches` を作らず取得できるようにする。`triangles` を遅延化するか、問い合わせ専用の内部モデルを抽出する。

- 最初の適用先はfieldの `ruralSuitability` と建物適性。field以外の基礎計算は実際に三角形を使うため、共通経路を一律に削らない。
- 3Dでは水岸・壁などが `terrain.triangles` を使用するので、地面が格子になったからといって三角形を全廃しない。
- `triangles` をgetter化するならspread / serialization / rendererの参照で意図せず評価しないことを確認する。
- 成功条件: 生成のfarmland・問い合わせモデル時間の大幅削減、建物・農地・高さの結果が一致。

### 2. pad / crease / 崖判定の空間索引

モデル構築時にfeature・creaseのboundsで索引を作り、点・三角形に近いものだけ評価する。まず全形状を維持できるこの変更を、細分化精度の変更より先に行う。

- 重なったpadの「後のものが優先」、川→platform→ringCutの順、castleの優先、崖の0.25 m帯、同じboundaryに接するセルの連続性を維持する。
- `fieldSeedSurface` のfoci探索も候補。ただし今回の自己サンプルでは境界分割と高さ評価が優先。
- 644 pad都市のモデル・格子・チャンク時間を同じ保存文書で比較する。0 / 64 / 256 padで増加傾向も確認する。

### 3. 傾斜評価の重複削減

チャンク間の共通頂点とskirtで傾斜色を再利用する。必要なら合成地形の差分サンプルを事前格子化する。

- 現行は±1 m差分。描画格子は2 m以上にもなるため、単純に隣接描画頂点の差分に置換すると崖・壁・岩色が変わる。まず同一点の厳密なメモ化から検討する。
- 自然地形だけの傾斜に戻すとpad・道路造成を無視するため採用しない。
- 索引化後に再計測し、キャッシュのメモリ費用が見合うか判断する。

### 4. 再構築回数・道路造成・ブラウザ確認

同一文書内の問い合わせを共有できるか確認する。文書を直接変更する経路もあるので、文書identityだけのキャッシュは使わず、地形・水面・道路・pad・設定の無効化を設計する。ブラウザで `cityView.sync` のfabric取得、道路造成、地形、water mesh、建物基礎、法線、GPU描画を分けて測る。

描画spacingを粗くする、field許可サイズを変える、Cragを平らにする措置は後段とする。今回の主因は固定頂点数でも増えるCPU費用であり、地形の精度を落とさず削れる処理がある。

## 再実行方法

[profileCeTerrain.ts](../../../scripts/profileCeTerrain.ts) はstdoutにJSON、stderrに進捗を出す。`--repeat` は**生成後の地形診断の反復回数**で、都市生成は一度だけ。最初の診断前に自然fieldキャッシュをclearし、以後は同じfieldを再利用する。モデル・格子・チャンクは各回作り直す。JITの暖機費用は残る。

```sh
node --import tsx scripts/profileCeTerrain.ts --generate=none --repeat=1 > temp/terrain-none.json
node --import tsx scripts/profileCeTerrain.ts --generate=crag --repeat=1 --save-document=temp/terrain-crag-city.json > temp/terrain-crag.json
node --import tsx scripts/profileCeTerrain.ts --document=temp/terrain-crag-city.json --repeat=3 > temp/terrain-crag-warm.json
node --import tsx scripts/profileCeTerrain.ts --pads=64 --repeat=3 > temp/terrain-pads64.json
node --cpu-prof --cpu-prof-dir=temp --import tsx scripts/profileCeTerrain.ts --document=temp/terrain-crag-city.json --repeat=1 > temp/terrain-profile.json
```

`--save-document` は既存ファイルを上書きしない。通常の数値比較ではCPU profilerを外し、計測は順次実行する。`--extent=300|600|1200` と `--spacing=auto|1|2|4|8` はstudyの描画密度調査に使える。studyはセル配置が固定なのでextent変更を実都市サイズ間比較と解釈しない。大きなextentやpad数は負荷が増えるため、まず上記の単一条件で比較する。

## 改修時の検証

- 高さ問い合わせと最適化後の出力を固定文書で比較。平地、Crag、川＋段状pad、castle cliff/rampを代表例にする。featureの重なりと遠方除外を確認する。
- 農地・建物数と配置・川水面・橋余裕・壁と地面の境界を維持。橋の角度判定は `bridgeSkewPolicy.ts` に従う。
- 関連テストのみ実行し、ブラウザで3Dの岩色・擁壁・道路造成・水面を確認。描画精度変更時だけ継ぎ目誤差も比較する。
- 本調査時: `npx vitest run src/city-editor/generators/terrainField/field.test.ts src/city-editor/generators/terrainField/layers.test.ts src/city-editor/generators/ruralFields.test.ts` → 3ファイル / 29件成功。
- スクリプトはstudy 0 / 64 / 256 pad、通常生成なし / Crag、保存文書読込、CPUプロファイルで実行確認済み。性能改善の実装・ブラウザGPU検証はまだ行っていない。
