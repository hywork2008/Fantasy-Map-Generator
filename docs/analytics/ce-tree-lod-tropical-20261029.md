# CE森林LOD：カポック・オオバヒルギの4品質化

2026-10-29。[全樹種のタスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) F3-1の作業記録。

## 1. 実装と作者

`kapok` と `red_mangrove` をlow／medium／high／ultraとしてBVとCEの共通登録へ接続した。既存のClaude Opus 5.5製defaultは形状を変えずultraとし、新作3品質はCodex GPT-6.1 Solとして作者と派生元を登録した。highはOpus ultra、low／mediumは同樹種highを元にする。既存CE採用表は編集していない。

変更前HEADの生成器とのgeometry全属性・index配列の完全一致を、新2樹種のultraと共有生成器を使うギョリュウ全4品質の計6条件で確認した。バイオームの樹種選択規則・森林領域・保存形式は変更していない。

| 樹種 | 品質 | 三角形 | source bufferBytes | 作者 |
| --- | --- | --- | --- | --- |
| `kapok` | low | 484 | 52,272 | Codex GPT-6.1 Sol |
| `kapok` | medium | 2,025 | 218,700 | Codex GPT-6.1 Sol |
| `kapok` | high | 19,556 | 2,112,048 | Codex GPT-6.1 Sol |
| `kapok` | ultra | 36,752 | 3,969,216 | Claude Opus 5.5 |
| `red_mangrove` | low | 468 | 50,544 | Codex GPT-6.1 Sol |
| `red_mangrove` | medium | 2,799 | 302,292 | Codex GPT-6.1 Sol |
| `red_mangrove` | high | 17,960 | 1,939,680 | Codex GPT-6.1 Sol |
| `red_mangrove` | ultra | 24,848 | 2,683,584 | Claude Opus 5.5 |

[変更前の棚卸し](ce-tree-lod-tropical-before-20261029.json) は53モデル枠、[変更後](ce-tree-lod-tropical-after-20261029.json) は59枠。20樹種のうち13樹種・52品質枠が実装済みとなり、残り7樹種・28枠を継続する。bufferBytesはsource geometryの属性・index配列の合計で、GPU実メモリではない。

## 2. 根の保持とmediumの作り方

[tree-medium-canopy-lobes.md](../plan/tree-medium-canopy-lobes.md) に従い、highの葉の頂点分布から房を当てはめた。乱数は元の順にすべて消費し、葉を間引いても次の枝の位置を変えない。法線・上向きの補正・頂点AO・色むら・頂点の揺らぎ・隠れた面の除去は共通処理を使い、mediumの法線を再計算しない。

- カポック：highは掌状複葉を半分に間引き、小葉の幅を2倍にする。mediumは各葉の層の頂点を集め、中心X座標の両側の2房へ当てはめる。lowは11本の水平な主枝と頂部の葉群を12房へまとめる。背の高い幹と水平の枝段、7枚の板根を維持した。
- オオバヒルギ：highはロゼットの葉を1枚おきに残し、幅を2倍にする。mediumは枝先の8ロゼットを隣接する4個ずつに分けて近似し、主枝の先端のロゼットも残す。lowは7本の主枝ごとに葉群をまとめる。13本の支柱根、分岐した二次根、4本の垂れる気根は低品質でも省略しない。根を小枝の半径による省略対象から外し、支柱根の足跡を元ultraと照合した。

板根の曲線の分割はultra／highで8、mediumで4、lowで2。lowの幹は6分割とする。オオバヒルギの支柱根・主枝の曲線はmediumで最大4、lowで2分割とし、根の到達点は維持する。残す木部の側面分割はmediumで4、lowで3。high／ultraの木部は一致する。

最初のmediumは各葉群を1房にまとめ、coverageはカポック1、オオバヒルギ1.1だった。林ではhighより面が多く、単木では平たい面が大きく見えたため、coverageを0.9／0.85へ下げ、さらに上記の2房への分割を加えた。最終mediumは2,025／2,799三角形で、3,000未満の目安を維持する。lowのcoverageは両種1。

CE森林にはquality-firstの距離LODと、元ultraの樹高／水平最大半径比（カポック1.814、オオバヒルギ1.6）を登録した。共通の正規化後も元の樹形比を保つ。配置候補・位置・seed・樹冠半径・保護範囲は維持し、公園等の明示された高さには影響させない。

## 3. 比較条件と画像

CEと同じ `createBvPrototypeCache().acquire()`、DoubleSideの頂点カラー材質、HemisphereLight（0xf4f0e6／0x6d7a62、0.9）、DirectionalLight（1.15、`sunDirection(DEFAULT_SUN)`）を使う。背景0xc5c5bf、SRGB、DPR 1、1200×800。

- [4品質・斜め](ce-tree-lod-tropical-20261029/models-front.png)、[側面](ce-tree-lod-tropical-20261029/models-side.png)、[俯瞰](ce-tree-lod-tropical-20261029/models-top.png)
- 単木medium／high：high樹冠bounds基準の45／90 px相当で倍率を揃え、[12°](ce-tree-lod-tropical-20261029/single-medium-high-12.png)、[40°](ce-tree-lod-tropical-20261029/single-medium-high-40.png)、[70°](ce-tree-lod-tropical-20261029/single-medium-high-70.png)を比較。
- [各260本の林、35°／130 m](ce-tree-lod-tropical-20261029/stand-medium-high.png)：同じ位置・回転・寸法で比較。
- 実BV：[カポックmedium](ce-tree-lod-tropical-20261029/bv-kapok-medium.png)、[オオバヒルギmedium](ce-tree-lod-tropical-20261029/bv-red-mangrove-medium.png)。各4品質の選択と描画を確認した。

mediumは葉を不透明な房にまとめるため、highより面の占有率が高い。低品質の根の曲線も粗くなる。画像はこの差を含む比較資料であり、全条件の最終受入はF5に残す。

## 4. CE森林とGPU確認

固定seed `ce-tree-lod-tropical-v1`、standard密度、256 m四方から24×32 mの穴を除いた平坦な森林（64,768 m²）を使った。`tropicalRainforest`／`mangrove` × 俯瞰・林縁・低視点 × light／standard／highの18条件を、Apple M4・ANGLE Metal・Chromiumで描いた。全条件で面積を維持し、表示樹木数と採用BVモデルの品質別本数合計が一致した。

距離40／120／400 mのquality-firstを使い、三角形・本数の予算による汎用形状への退避は行わない。影の提出予算は維持する。boundedの数量上限達成とは区別する。

森林standardの数量：

| バイオーム | 視点 | 表示樹木 | low / medium / high / ultra | 三角形 | calls |
| --- | --- | --- | --- | --- | --- |
| `tropicalRainforest` | overview | 773 | 773 / 0 / 0 / 0 | 374,856 | 6 |
| `tropicalRainforest` | edge | 398 | 0 / 304 / 89 / 5 | 2,540,568 | 9 |
| `tropicalRainforest` | low | 219 | 0 / 127 / 82 / 10 | 2,229,011 | 9 |
| `mangrove` | overview | 773 | 773 / 0 / 0 / 0 | 362,488 | 6 |
| `mangrove` | edge | 398 | 0 / 304 / 89 / 5 | 2,574,300 | 10 |
| `mangrove` | low | 217 | 0 / 126 / 81 / 10 | 2,056,638 | 8 |

- カポック：[林縁](ce-tree-lod-tropical-20261029/tropicalRainforest-edge.png)、[俯瞰](ce-tree-lod-tropical-20261029/tropicalRainforest-overview.png)、[低視点](ce-tree-lod-tropical-20261029/tropicalRainforest-low.png)
- オオバヒルギ：[林縁](ce-tree-lod-tropical-20261029/mangrove-edge.png)、[俯瞰](ce-tree-lod-tropical-20261029/mangrove-overview.png)、[低視点](ce-tree-lod-tropical-20261029/mangrove-low.png)

品質切替3巡のgeometry数は両バイオームとも15→15→15で安定し、WebGL・pageerror・BVエラーは0件。[描画記録JSON](ce-tree-lod-tropical-20261029/results.json) の時間は単発CPU更新／提出のみで、GPU完了時間・街全体の操作p95・33 ms目標の達成を示さない。平坦な森林レイヤーの確認であり、干潟・水面と支柱根の接地、全バイオームの割当、影あり外観・別GPU・高DPRはF3-3／F5に残す。

## 5. 検証・再現と次の作業

関連8ファイル84件のVitestが成功（重複実行は数えない）。登録・採用・作者、三角形の単調増加と制作目安、接地・寸法・有限値、high／ultra木部一致、CE prototypeの法線／色、資源解放、森林・公園・CE更新を確認した。オオバヒルギlow／mediumは、元ultraの深さ0.3 m超の根の頂点に対し、水平距離0.12 m以内に縮約後の根の頂点が存在することも検査する。

汎用LODの予算・退避・復元を検証する既存試験は、4品質化したカポックに代えて未対応のハンノキを使う。同時4樹種の制限／cache eviction試験も未対応の5樹種を使い、元の検証目的を維持した。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/treeRegistration.test.ts src/city3d/adoption.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/cityViewRendering.test.ts
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-tropical-after-20261029.json
node --import tsx scripts/verifyCeTropicalTreeLod.mts
```

変更前JSONは上書きしない。棚卸しJSONにはソースSHA-256、描画スクリプトには固定入力と比較条件を保存した。今回のJSON・画像は各ファイル2 MB未満。TypeScript全体検査は既存の `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗し、今回の変更ファイルには型エラーが報告されなかった。

次のモデル作製はF3-2のハンノキ・ナナカマド・カナリアマツ。F1の既存モデル基準画像・温帯寒帯確認、F2-3の乾燥地の適用確認、F3-3の全対象バイオームの割当・接地も残作業とする。
