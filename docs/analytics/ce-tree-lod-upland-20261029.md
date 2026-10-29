# CE森林LOD：ハンノキ・ナナカマド・カナリアマツの4品質化

2026-10-29。[全樹種のタスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) F3-2の作業記録。

## 1. 実装と作者

`black_alder`、`rowan`、`canary_pine` をlow／medium／high／ultraとしてBVとCEの共通登録へ接続した。既存Claude Opus 5.5のdefaultは形状を変えずultraとし、新作3品質はCodex GPT-6.1 Solとして作者・派生元を登録した。highはOpus ultra、low／mediumは同樹種highを元にする。既存CE採用表は編集していない。

変更前HEADの生成器とのgeometry全属性・index配列の完全一致を、新3樹種のultraと、共有生成器を使うベイスギの全4品質の計7条件で確認した。バイオームの選択規則・森林領域・保存形式は変更していない。

| 樹種 | 品質 | 三角形 | source bufferBytes | 作者 |
| --- | --- | --- | --- | --- |
| `black_alder` | low | 381 | 41,148 | Codex GPT-6.1 Sol |
| `black_alder` | medium | 2,021 | 218,268 | Codex GPT-6.1 Sol |
| `black_alder` | high | 12,764 | 1,378,512 | Codex GPT-6.1 Sol |
| `black_alder` | ultra | 23,600 | 2,548,800 | Claude Opus 5.5 |
| `rowan` | low | 496 | 53,568 | Codex GPT-6.1 Sol |
| `rowan` | medium | 2,482 | 268,056 | Codex GPT-6.1 Sol |
| `rowan` | high | 14,632 | 1,580,256 | Codex GPT-6.1 Sol |
| `rowan` | ultra | 26,140 | 2,823,120 | Claude Opus 5.5 |
| `canary_pine` | low | 484 | 52,272 | Codex GPT-6.1 Sol |
| `canary_pine` | medium | 2,480 | 267,840 | Codex GPT-6.1 Sol |
| `canary_pine` | high | 15,690 | 1,694,520 | Codex GPT-6.1 Sol |
| `canary_pine` | ultra | 35,214 | 3,803,112 | Claude Opus 5.5 |

[変更前の棚卸し](ce-tree-lod-upland-before-20261029.json) は59モデル枠、[変更後](ce-tree-lod-upland-after-20261029.json) は68枠。20樹種のうち16樹種・64品質枠が実装済みとなり、残り4樹種・16枠を継続する。bufferBytesはsource geometryの属性・index配列の合計であり、GPU実メモリではない。

## 2. mediumの作り方と調整

[tree-medium-canopy-lobes.md](../plan/tree-medium-canopy-lobes.md) に従い、highが描く葉・針葉束の頂点分布を集めて房を当てはめた。葉を間引く前に元の乱数をすべて消費し、high／ultraの木部を一致させる。法線・上向きの補正・頂点AO・色むら・頂点の揺らぎ・埋もれた面の除去は共通処理を使い、生成後の法線再計算で上書きしない。

| 樹種 | high | medium | low |
| --- | --- | --- | --- |
| ハンノキ | 葉を半分に間引き幅2倍、葉先の切込みを維持 | 葉群ごとにcoverage 0.65で当てはめる | 3本の幹それぞれの高さ方向を4群、coverage 0.8。7組の露出根を残す |
| ナナカマド | 羽状葉の小葉の段を1段おきに残し、末端の小葉を保持。実も半分を残す | 小枝ごと／主枝の先端ごとの葉群を0.9、実の房を1で別々に当てはめる | 14本の主枝ごとの葉群を0.95。実の各房は元の点群へ当てはめた水平の菱形2三角形で残す |
| カナリアマツ | 針葉を3分の1にして幅3倍、木部と球果は維持 | 主枝の前後半の針葉群と、幹から出る個々の針葉束を0.75で当てはめる | 9枝段・幹の針葉束の3群・頂部をcoverage 1でまとめ、房の鉛直半径を0.55倍にして枝段の隙間を保つ |

初期のハンノキmediumはcoverage 0.95で林が密すぎたため0.65へ下げた。カナリアマツmediumも0.85から0.75へ調整した。ナナカマドlowは隣接する主枝を2本ずつまとめると平たい層が大きくなったため、主枝ごとの近似へ変更し、実の房を簡略化して500三角形未満に収めた。lowの幹は6分割、残す枝の側面は3分割、mediumの枝は4分割とする。葉の生成・乱数消費は、木部を省いても継続する。

CE森林は距離40／120／400 mのquality-firstとした。元ultraの樹高／水平最大半径比（ハンノキ3.181、ナナカマド2.504、カナリアマツ3.007）を登録し、正規化後も元の樹形比を保つ。候補位置・seed・樹冠半径・保護範囲を維持し、公園等の明示された高さには影響させない。

## 3. 比較条件と画像

CEと同じ `createBvPrototypeCache().acquire()`、DoubleSideの頂点カラー材質、HemisphereLight（0xf4f0e6／0x6d7a62、0.9）、DirectionalLight（1.15、`sunDirection(DEFAULT_SUN)`）を使った。背景0xc5c5bf、SRGB、DPR 1、1200×1200。

- [4品質・斜め](ce-tree-lod-upland-20261029/models-front.png)、[側面](ce-tree-lod-upland-20261029/models-side.png)、[俯瞰](ce-tree-lod-upland-20261029/models-top.png)
- 単木medium／high：high樹冠bounds基準の45／90 px相当で倍率を揃え、[12°](ce-tree-lod-upland-20261029/single-medium-high-12.png)、[40°](ce-tree-lod-upland-20261029/single-medium-high-40.png)、[70°](ce-tree-lod-upland-20261029/single-medium-high-70.png)を比較。
- [各260本の林、35°／130 m](ce-tree-lod-upland-20261029/stand-medium-high.png)：同じ位置・回転・寸法で比較。
- 実BV：[ハンノキ](ce-tree-lod-upland-20261029/bv-black-alder-medium.png)、[ナナカマド](ce-tree-lod-upland-20261029/bv-rowan-medium.png)、[カナリアマツ](ce-tree-lod-upland-20261029/bv-canary-pine-medium.png)。各4品質の選択と描画を確認した。

mediumは個別葉を不透明な房へまとめるためhighより面の占有率が高く、lowの葉群や枝も粗い。画像はこの差を含む比較資料であり、全条件の最終受入はF5に残す。

## 4. CE森林とGPU確認

固定seed `ce-tree-lod-upland-v1`、standard密度、256 m四方から24×32 mの穴を除いた平坦な森林（64,768 m²）。`wetland`／`alpineTundra`／`volcanicBarrens` × 俯瞰・林縁・低視点 × light／standard／highの27条件をApple M4・ANGLE Metal・Chromiumで描いた。全条件で面積を維持し、表示樹木数とBV品質別本数合計が一致した。

quality-firstは森全体の三角形・本数の予算で汎用形へ戻さない。影の提出予算は維持する。boundedの数量上限達成とは区別する。森林viewportは1200×1200のため、以前の1200×800の観測数量とは直接比較しない。

森林standardの数量：

| バイオーム | 視点 | 表示樹木 | low / medium / high / ultra | 三角形 | calls |
| --- | --- | --- | --- | --- | --- |
| `wetland` | overview | 773 | 773 / 0 / 0 / 0 | 295,237 | 6 |
| `wetland` | edge | 302 | 0 / 230 / 64 / 8 | 1,471,250 | 9 |
| `wetland` | low | 181 | 0 / 101 / 68 / 12 | 1,355,997 | 9 |
| `alpineTundra` | overview | 773 | 773 / 0 / 0 / 0 | 384,132 | 6 |
| `alpineTundra` | edge | 296 | 0 / 226 / 64 / 6 | 1,654,944 | 10 |
| `alpineTundra` | low | 177 | 0 / 100 / 66 / 11 | 1,502,176 | 10 |
| `volcanicBarrens` | overview | 773 | 773 / 0 / 0 / 0 | 374,856 | 6 |
| `volcanicBarrens` | edge | 301 | 0 / 229 / 64 / 8 | 1,854,516 | 9 |
| `volcanicBarrens` | low | 178 | 0 / 101 / 66 / 11 | 1,674,098 | 9 |

- ハンノキ：[林縁](ce-tree-lod-upland-20261029/wetland-edge.png)、[俯瞰](ce-tree-lod-upland-20261029/wetland-overview.png)、[低視点](ce-tree-lod-upland-20261029/wetland-low.png)
- ナナカマド：[林縁](ce-tree-lod-upland-20261029/alpineTundra-edge.png)、[俯瞰](ce-tree-lod-upland-20261029/alpineTundra-overview.png)、[低視点](ce-tree-lod-upland-20261029/alpineTundra-low.png)
- カナリアマツ：[林縁](ce-tree-lod-upland-20261029/volcanicBarrens-edge.png)、[俯瞰](ce-tree-lod-upland-20261029/volcanicBarrens-overview.png)、[低視点](ce-tree-lod-upland-20261029/volcanicBarrens-low.png)

品質切替3巡のgeometry数は3バイオームとも19→19→19で安定し、WebGL・pageerror・BVエラーは0件。[描画記録JSON](ce-tree-lod-upland-20261029/results.json) の時間は単発のCPU更新／提出のみで、GPU完了時間・街全体の操作p95・33 ms目標の達成を示さない。

固定の森林レイヤーの描画試験であり、高山や火山にこの密度の自然林を生成する方針を決めるものではない。自然林・人工植栽の適用、温度分岐・斜面・水辺の接地、影あり外観・別GPU・高DPRはF1-4／F2-3／F3-3／F5に残す。

## 5. 検証と再現

関連8ファイル96件のVitestが成功（重複実行は数えない）。登録・採用・作者、三角形の単調増加と制作目安、接地・寸法・有限値、high／ultra木部一致、CE prototypeの法線／色と資源解放、森林・公園・CE更新を確認した。

自然林で使う主な樹種がquality-firstになったため、汎用LODの予算・退避・復元を試験する3ケースは、樹種選択関数だけをイトスギへ固定する。各試験後にspyを復元し、実際のwetland等の樹種選択試験と分ける。同時4樹種制限／cache evictionは、用途別の未対応4樹種とboundedのイチイを使って検証した。これらはテスト用の指定であり、製品のバイオーム規則・LOD方針は変更しない。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/treeRegistration.test.ts src/city3d/adoption.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/cityViewRendering.test.ts
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-upland-after-20261029.json
node --import tsx scripts/verifyCeUplandTreeLod.mts
```

変更前JSONは上書きせず保持する。棚卸しJSONにソースSHA-256、描画スクリプトに固定入力・条件を保存した。今回のJSON・画像は各ファイル2 MB未満。TypeScript全体検査は既存の `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗し、今回の変更ファイルには型エラーが報告されなかった。

次のモデル作製はF4-1のイトスギ・コノテガシワ・インドボダイジュ・シダレヤナギ。残る4樹種の作製後も、各バイオームの適用確認とF5の最終受入を継続する。
