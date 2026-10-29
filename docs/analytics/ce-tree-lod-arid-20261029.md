# CE森林LOD：ナツメヤシ・アンブレラソーンの4品質化

2026-10-29。[全樹種のタスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) F2-1の作業記録。

## 1. 実装と作者

`date_palm` と `umbrella_thorn` をlow／medium／high／ultraとしてBV・CEの共通登録へ接続した。既存のClaude Opus 5.5製defaultは生成結果を変えずultraとし、新作3品質をCodex GPT-6.1 Solとして登録した。highの派生元はOpus ultra、low／mediumの派生元は同樹種highである。既存のCE採用表は編集していない。

変更前HEADの生成器とのgeometryの全属性・index配列の完全一致を、2樹種のultraと同じ生成器を使う未着手のサクサウールで確認した。バイオームの樹種選択規則・森林領域・保存形式は変更していない。

| 樹種 | 品質 | 三角形 | source bufferBytes | 作者 |
| --- | --- | --- | --- | --- |
| `date_palm` | low | 452 | 48,816 | Codex GPT-6.1 Sol |
| `date_palm` | medium | 2,455 | 265,140 | Codex GPT-6.1 Sol |
| `date_palm` | high | 4,224 | 456,192 | Codex GPT-6.1 Sol |
| `date_palm` | ultra | 6,816 | 736,128 | Claude Opus 5.5 |
| `umbrella_thorn` | low | 349 | 37,692 | Codex GPT-6.1 Sol |
| `umbrella_thorn` | medium | 1,887 | 203,796 | Codex GPT-6.1 Sol |
| `umbrella_thorn` | high | 6,448 | 696,384 | Codex GPT-6.1 Sol |
| `umbrella_thorn` | ultra | 14,660 | 1,583,280 | Claude Opus 5.5 |

[変更前の棚卸し](ce-tree-lod-arid-before-20261029.json) は38モデル枠、[変更後](ce-tree-lod-arid-after-20261029.json) は44枠。20樹種のうち8樹種・32品質枠が実装済みとなり、残り12樹種・48枠を継続する。bufferBytesはsource geometryの属性・index配列の合計で、GPU実メモリではない。

## 2. mediumの作り方と樹形の保持

[tree-medium-canopy-lobes.md](../plan/tree-medium-canopy-lobes.md) の方法に従い、highの葉の頂点から房を当てはめた。同じ乱数を最後まで消費してから葉を間引き、high／ultraの木部を一致させる。法線・頂点AO・色むら・頂点の揺らぎ・埋もれた面の除去は共通処理を使い、法線を再計算しない。

- ナツメヤシ：highは対の小葉を半分に間引き、幅を補う。mediumは各羽状葉を前後2つに分け、高品質で出力する頂点を採取する。水平の楕円体だけでは垂れた枯葉が丸く膨らんだため、葉軸の接線を使う局所座標で当てはめ、固定のQuaternionで元の傾きへ戻す。coverageは初期0.85から0.65へ下げ、林でhighより密になる差を減らした。生葉と枯葉は色を分ける。
- アンブレラソーン：highは小葉の3分の1を残し、面積を補う。mediumはhighが作る平たい葉群ごとにcoverage 1で当てはめる。lowは5本の主枝の葉群と頂部の葉群を6房へまとめる。低い分岐と平たい傘状樹冠を維持した。
- ナツメヤシlowは同じ葉軸の湾曲に沿う折れた帯を使い、主冠・株元の芽・垂れた枯葉を残す。lowの幹は6分割とし、`createTreeBase` の既定16分割は維持する。

Quaternion指定は任意で、既存の房は従来の計算経路を使う。傾きは静的な葉の方向であり、カメラ追従しない。外接範囲、法線、隠れた面の判定にも同じ回転を適用する。

CE森林では元モデルを共通の樹高10 m・樹冠半径1へ正規化するため、従来の共通寸法のままではアカシアが縦長になった。今回の2樹種に任意の `forestHeightToRadius` を登録し、元ultraの樹高／水平最大半径比（ナツメヤシ2.109、アカシア1.128）で森林の高さを決める。位置・候補数・seed・配置半径・保護範囲は維持する。他の樹種の寸法計算と、公園等で明示される高さは変更しない。

## 3. 比較条件と画像

CEと同じ `createBvPrototypeCache().acquire()`、DoubleSideの頂点カラー材質、HemisphereLight（0xf4f0e6／0x6d7a62、0.9）とDirectionalLight（1.15、`sunDirection(DEFAULT_SUN)`）を使う。背景0xc5c5bf、SRGB、DPR 1、1200×800。

- [4品質・斜め](ce-tree-lod-arid-20261029/models-front.png)、[側面](ce-tree-lod-arid-20261029/models-side.png)、[俯瞰](ce-tree-lod-arid-20261029/models-top.png)
- 単木medium／high、high樹冠bounds基準の45／90 px相当：[12°](ce-tree-lod-arid-20261029/single-medium-high-12.png)、[40°](ce-tree-lod-arid-20261029/single-medium-high-40.png)、[70°](ce-tree-lod-arid-20261029/single-medium-high-70.png)
- [各260本の林、35°／130 m](ce-tree-lod-arid-20261029/stand-medium-high.png)：同じ位置・回転・寸法で比較。
- 実BV：[ナツメヤシmedium](ce-tree-lod-arid-20261029/bv-date-palm-medium.png)、[アンブレラソーンmedium](ce-tree-lod-arid-20261029/bv-umbrella-thorn-medium.png)。それぞれ全4品質の選択と描画を確認した。

mediumは葉群を不透明な面へ縮約するため、highの個別葉に比べて面の占有率が高く、特にナツメヤシの葉の透け方は一致しない。画像はこの差を含む採用比較資料であり、最終受入はF5に残す。

## 4. CE森林とGPU確認

既存ライム・タイガ等と同じ距離40／120／400 mの `quality-first` とした。全表示樹木に採用済みBVモデルを使い、森全体の三角形・本数の予算で汎用形へ戻さない。影の提出予算は既存処理を使うため、boundedの数量上限達成とは区別する。

固定seed `ce-tree-lod-arid-v1`、standard密度、256 m四方から24×32 mの穴を除いた平坦な森林（64,768 m²）を用いた。`hotDesert`／`savanna` × 俯瞰・林縁・低視点 × light／standard／highの18条件をApple M4・ANGLE Metal・Chromiumで描画した。面積を維持し、全条件で表示樹木数とBVモデルの品質別本数合計が一致した。これは固定の森林レイヤー試験であり、自然砂漠にこの密度の森を生成する方針を決めるものではない。

森林standardの数量：

| バイオーム | 視点 | 表示樹木 | low / medium / high / ultra | 三角形 | calls |
| --- | --- | --- | --- | --- | --- |
| `hotDesert` | overview | 773 | 773 / 0 / 0 / 0 | 350,120 | 6 |
| `hotDesert` | edge | 398 | 0 / 304 / 89 / 5 | 1,156,756 | 9 |
| `hotDesert` | low | 220 | 0 / 127 / 82 / 11 | 733,726 | 8 |
| `savanna` | overview | 773 | 773 / 0 / 0 / 0 | 294,809 | 8 |
| `savanna` | edge | 396 | 0 / 303 / 89 / 4 | 1,180,411 | 12 |
| `savanna` | low | 218 | 0 / 126 / 82 / 10 | 832,780 | 12 |

- ナツメヤシ：[林縁](ce-tree-lod-arid-20261029/hotDesert-edge.png)、[俯瞰](ce-tree-lod-arid-20261029/hotDesert-overview.png)、[低視点](ce-tree-lod-arid-20261029/hotDesert-low.png)
- 混交林：[林縁](ce-tree-lod-arid-20261029/savanna-edge.png)、[俯瞰](ce-tree-lod-arid-20261029/savanna-overview.png)、[低視点](ce-tree-lod-arid-20261029/savanna-low.png)

品質切替3巡のgeometry数はhotDesertで15→15→15、savannaで17→17→17と安定した。WebGL・pageerror・BVエラーは0件。[描画記録JSON](ce-tree-lod-arid-20261029/results.json) の時間は単発のCPU更新／提出だけで、GPU完了時間・街全体のp95・33 ms目標の達成を示さない。影ありの外観・別GPU・高DPR・全バイオームの総合確認はF5に残る。

## 5. 検証・再現と次の作業

関連10ファイル86件のVitestが成功。品質ごとの三角形減少、接地・寸法・high／ultra木部一致、登録・作者・派生元、CE prototypeの法線／色と解放、傾いた房の形と入力半径の不変、森林内の樹形比、公園とCE更新を確認した。汎用LODの予算・退避・cache evictionの既存試験は、4品質化したナツメヤシに代えて未対応のカポックを使い、元の検証目的を維持した。

```sh
npx vitest run src/buildings/landscape/canopyLobes.test.ts src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/borealTrees.test.ts src/buildings/landscape/treeRegistration.test.ts src/city3d/adoption.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/cityViewRendering.test.ts
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-arid-after-20261029.json
node --import tsx scripts/verifyCeAridTreeLod.mts
```

変更前JSONは上書きしない。棚卸しJSONにはソースSHA-256、描画スクリプトには固定入力と比較条件を保存した。今回のJSON・画像は各ファイル2 MB未満。TypeScript全体検査は既存の `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗し、今回の変更ファイルには型エラーが報告されなかった。

次のモデル作製はF2-2のサクサウール・ギョリュウ・オリーブ。F1-1の既存モデル基準画像、F1-4の温帯・寒帯確認、F2-3の乾燥地での自然林／人工植栽の適用確認も残す。
