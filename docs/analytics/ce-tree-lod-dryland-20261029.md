# CE森林LOD：サクサウール・ギョリュウ・オリーブの4品質化

2026-10-29。[全樹種のタスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) F2-2の作業記録。

## 1. 実装と作者

`saxaul`、`tamarisk`、`olive` をlow／medium／high／ultraとしてBVとCEの共通登録へ接続した。既存のClaude Opus 5.5製defaultは形状を変えずultraとし、新作3品質はCodex GPT-6.1 Solとして作者・派生元を登録した。highはOpus ultra、low／mediumは同樹種highを元にする。CEの採用表は編集していない。

変更前HEADの生成器とのgeometry全属性・index配列の完全一致を16条件で確認した。対象は新3樹種のultra、同じ生成器を使うナツメヤシ／アンブレラソーン／モミの各4品質と、未着手のオオバヒルギである。

| 樹種 | 品質 | 三角形 | source bufferBytes | 作者 |
| --- | --- | --- | --- | --- |
| `saxaul` | low | 392 | 42,336 | Codex GPT-6.1 Sol |
| `saxaul` | medium | 1,582 | 170,856 | Codex GPT-6.1 Sol |
| `saxaul` | high | 4,220 | 455,760 | Codex GPT-6.1 Sol |
| `saxaul` | ultra | 6,332 | 683,856 | Claude Opus 5.5 |
| `tamarisk` | low | 475 | 51,300 | Codex GPT-6.1 Sol |
| `tamarisk` | medium | 2,689 | 290,412 | Codex GPT-6.1 Sol |
| `tamarisk` | high | 6,340 | 684,720 | Codex GPT-6.1 Sol |
| `tamarisk` | ultra | 8,020 | 866,160 | Claude Opus 5.5 |
| `olive` | low | 253 | 27,324 | Codex GPT-6.1 Sol |
| `olive` | medium | 1,337 | 144,396 | Codex GPT-6.1 Sol |
| `olive` | high | 9,149 | 988,092 | Codex GPT-6.1 Sol |
| `olive` | ultra | 25,091 | 2,709,828 | Claude Opus 5.5 |

[変更前の棚卸し](ce-tree-lod-dryland-before-20261029.json) は44モデル枠、[変更後](ce-tree-lod-dryland-after-20261029.json) は53枠。20樹種のうち11樹種・44品質枠が実装済みとなり、残る9樹種・36枠を継続する。bufferBytesはsource geometryの属性・index配列の合計であり、GPU実メモリではない。

## 2. mediumの当てはめと調整

[tree-medium-canopy-lobes.md](../plan/tree-medium-canopy-lobes.md) に従った。全品質で元の乱数消費を保ち、highは同じ枝構造上の葉・緑枝を間引く。mediumはそのhighが出力する頂点分布へ房を当てはめる。共通の法線・上向きの補正・頂点AO・色むら・頂点の揺らぎ・埋もれた面の除去を使い、生成後に法線を再計算しない。

| 樹種 | high | mediumの単位とcoverage | low |
| --- | --- | --- | --- |
| サクサウール | 9本の緑枝のうち5本を残し幅1.8倍 | 房ごとの緑枝の頂点、0.65 | 主幹ごとの下部／上部の分布を12房へ、0.75 |
| ギョリュウ | 11本の小枝のうち8本を残し幅1.375倍 | 羽毛状の枝葉を緑葉0.6／桃色の花0.4へ分けて当てはめる | 8本の主幹単位に緑葉0.72／花0.5 |
| オリーブ | 葉の3分の1を残し幅3倍 | 高品質の葉群ごと、0.85 | 3本のねじれた幹の下部／上部を6房へ、1 |

初回のmediumは、サクサウール0.8、ギョリュウ緑葉0.85／花0.7、オリーブ1.1だった。群生比較ではhighより密で、とくにギョリュウの花が大きな塊になった。coverageを下げて再比較し、疎らな緑枝と花の量を調整した。ギョリュウlowはcoverage 0.7で樹冠幅が元の80%をわずかに下回ったため、0.72で幅を確保した。

lowの幹は6分割、残す枝は3分割の側面とし、mediumは4分割の側面を使う。小枝を省いても、その先の葉群と乱数消費は残す。high／ultraの木部は一致する。

森林の寸法には、前段階で追加した任意の `forestHeightToRadius` を使った。元ultraの樹高／水平最大半径からサクサウール1.38、ギョリュウ1.228、オリーブ1.14を登録した。低木状／横広がりの樹形を保ち、配置候補・位置・seed・樹冠半径・保護範囲は維持する。バイオームの樹種選択規則・保存形式は変更していない。

## 3. 比較条件と画像

CEと同じ `createBvPrototypeCache().acquire()`、DoubleSideの頂点カラー材質、HemisphereLight（0xf4f0e6／0x6d7a62、0.9）、DirectionalLight（1.15、`sunDirection(DEFAULT_SUN)`）を使った。背景0xc5c5bf、SRGB、DPR 1、比較画像1200×1200。

- [4品質・斜め](ce-tree-lod-dryland-20261029/models-front.png)、[側面](ce-tree-lod-dryland-20261029/models-side.png)、[俯瞰](ce-tree-lod-dryland-20261029/models-top.png)
- 単木medium／high：high樹冠bounds基準の45／90 px相当で倍率を揃え、[12°](ce-tree-lod-dryland-20261029/single-medium-high-12.png)、[40°](ce-tree-lod-dryland-20261029/single-medium-high-40.png)、[70°](ce-tree-lod-dryland-20261029/single-medium-high-70.png)を比較。
- [各260本の林、35°／130 m](ce-tree-lod-dryland-20261029/stand-medium-high.png)：同じ位置・回転・寸法で比較。
- 実BV：[サクサウール](ce-tree-lod-dryland-20261029/bv-saxaul-medium.png)、[ギョリュウ](ce-tree-lod-dryland-20261029/bv-tamarisk-medium.png)、[オリーブ](ce-tree-lod-dryland-20261029/bv-olive-medium.png)。各4品質の選択と描画を確認した。

mediumは個別の枝葉を不透明な房へ縮約しており、highの透け方や細い枝の連続性とは差がある。特に拡大時のオリーブは面の量が目立つ。画像はその差を含む比較資料であり、全条件の最終受入はF5に残す。

## 4. CE森林とGPU確認

既存のライム・タイガ等と同じ距離40／120／400 mの `quality-first` を使う。全表示樹木に採用BVモデルを使い、森全体の三角形・本数の予算による汎用形状への退避は行わない。影の提出予算は維持する。boundedの数量上限達成とは区別する。

固定seed `ce-tree-lod-dryland-v1`、standard密度、256 m四方から24×32 mの穴を除いた平坦な森林（64,768 m²）。`coldDesert`／`xericShrubland`／`mediterraneanWoodlandScrub` × 俯瞰・林縁・低視点 × light／standard／highの27条件を、Apple M4・ANGLE Metal・Chromium・DPR 1で描いた。面積を維持し、全条件で表示樹木数とBV品質別本数合計が一致した。森林用viewportは1200×1200なので、前段階の1200×800の数量と直接比較しない。

森林standardの数量：

| バイオーム | 視点 | 表示樹木 | low / medium / high / ultra | 三角形 | calls |
| --- | --- | --- | --- | --- | --- |
| `coldDesert` | overview | 773 | 773 / 0 / 0 / 0 | 303,740 | 6 |
| `coldDesert` | edge | 288 | 0 / 223 / 61 / 4 | 636,258 | 9 |
| `coldDesert` | low | 169 | 0 / 98 / 62 / 9 | 474,388 | 9 |
| `xericShrubland` | overview | 773 | 773 / 0 / 0 / 0 | 362,471 | 8 |
| `xericShrubland` | edge | 290 | 0 / 224 / 62 / 4 | 958,400 | 13 |
| `xericShrubland` | low | 170 | 0 / 98 / 63 / 9 | 669,227 | 14 |
| `mediterraneanWoodlandScrub` | overview | 773 | 773 / 0 / 0 / 0 | 196,293 | 6 |
| `mediterraneanWoodlandScrub` | edge | 288 | 0 / 223 / 61 / 4 | 957,328 | 10 |
| `mediterraneanWoodlandScrub` | low | 169 | 0 / 98 / 62 / 9 | 924,807 | 10 |

- サクサウール：[林縁](ce-tree-lod-dryland-20261029/coldDesert-edge.png)、[俯瞰](ce-tree-lod-dryland-20261029/coldDesert-overview.png)、[低視点](ce-tree-lod-dryland-20261029/coldDesert-low.png)
- ギョリュウを含む疎林：[林縁](ce-tree-lod-dryland-20261029/xericShrubland-edge.png)、[俯瞰](ce-tree-lod-dryland-20261029/xericShrubland-overview.png)、[低視点](ce-tree-lod-dryland-20261029/xericShrubland-low.png)
- オリーブ：[林縁](ce-tree-lod-dryland-20261029/mediterraneanWoodlandScrub-edge.png)、[俯瞰](ce-tree-lod-dryland-20261029/mediterraneanWoodlandScrub-overview.png)、[低視点](ce-tree-lod-dryland-20261029/mediterraneanWoodlandScrub-low.png)

品質切替3巡のgeometry数はそれぞれ19→19→19、21→21→21、19→19→19で安定し、WebGL・pageerror・BVエラーは0件。[描画記録JSON](ce-tree-lod-dryland-20261029/results.json) の時間は単発のCPU更新／提出のみで、GPU完了時間・街全体の操作p95・33 ms目標の達成を示さない。

固定の森林レイヤーに対する描画試験であり、砂漠・草原の自然林と人工植栽の適用や密度を決めるものではない。F2-3の適用確認と、F5の影あり外観・別GPU・高DPR・全バイオーム総合確認は未完了。

## 5. 検証と再現

関連8ファイル74件のVitestが成功（重複実行は数えない）。4品質の登録・採用・作者、三角形の単調増加と制作目安、接地・寸法・有限値、high／ultra木部一致、CE prototypeの法線／色、資源解放、森林・公園・CE更新を確認した。低木の高さは登録した樹高を基準とし、全樹種に6.5 m超を求めていた既存の検査を修正した。boundedの同時4樹種制限を検証する試験は、4品質化したオリーブ／サクサウールを未対応のオオバヒルギ／カナリアマツへ置き換えた。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/coniferTreeLod.test.ts src/buildings/landscape/treeRegistration.test.ts src/city3d/adoption.test.ts src/city3d/three/forestMeshes.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts src/city-editor/renderers/cityViewRendering.test.ts
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-dryland-after-20261029.json
node --import tsx scripts/verifyCeDrylandTreeLod.mts
```

変更前JSONは上書きせず保持する。棚卸しJSONにはソースSHA-256、描画スクリプトには固定入力と比較条件を保存した。TypeScript全体検査は既存の `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗し、今回の変更ファイルには型エラーが報告されなかった。

次のモデル作製はF3-1のカポック・オオバヒルギ。F1の既存モデル基準画像・温帯寒帯の割当と、F2-3の乾燥地の適用確認も残作業とする。
