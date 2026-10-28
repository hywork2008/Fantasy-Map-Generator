# 森林樹木LOD：F0とトウヒ・シラカバの作製記録

2026-10-29

[タスクリスト](../plan/ce-forest-biome-tree-lod-tasks.md) のF0を実施し、F1-2のトウヒ・シラカバを4品質化した。F1全体・全20樹種の総合受入は未完了。

## 1. 棚卸しと固定条件（F0）

標準29バイオーム、BV20樹種、既存2樹種の全採用段階を確認した。変更前は26モデル枠（18 default＋既存2種×4品質）、変更後は32枠（16 default＋4種×4品質）。バイオームとBV説明の関連付けは [基準JSON](ce-tree-lod-f0-baseline-20261029.json) に含め、現在の選択・温度分岐・fallbackとの差は計画§3を台帳とする。

特に `temperateConiferousForest` のシナノキへのfallback、`borealPeatland` のBV説明とCEの選択の差、海・ツンドラ・氷雪・溶岩面の立木方針は未解決項目として計画に残した。今回は樹種割当・森林領域・農地・保存形式を変更していない。

計測コマンド：

```sh
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-lod-boreal-inventory-20261029.json
node --import tsx scripts/verifyCeBorealTreeLod.mts
```

- CPU生成は各採用版1回で、ウォームアップや統計的なベンチマークではない。bufferBytesはsource geometryの属性・index配列の合計であり、GPU実メモリではない。
- 変更前の基準JSONは再実行で上書きせず保持する。ソースのSHA-256を両JSONへ記録した。基準JSONのhash対象は初期の主要5ファイル、変更後JSONはlandscape生成器全体・BV一覧・採用表・バイオーム定義。
- 比較は1200×800、DPR 1、同じ正投影カメラと照明で4品質を同じ実寸倍率にする。斜め・側面・俯瞰を固定し、視点によって品質ごとの自動フィットをしない。
- 森林入力はseed `ce-tree-lod-boreal-v1`、taiga、standard密度、256 m四方の平地、24×32 mの穴。俯瞰・林縁・低視点と、森林light／standard／highの9条件を固定した。再現値は検証スクリプト内に明記している。

### 変更前の詳細モデル

| 樹種 | 品質 | 三角形 | bufferBytes |
| --- | --- | --- | --- |
| `garden_parkland` | ultra | 84,098 | 8,696,808 |
| `norway_spruce` | default | 44,246 | 4,778,568 |
| `silver_birch` | default | 51,320 | 5,542,560 |
| `sacred_yew` | ultra | 33,428 | 2,989,176 |
| `date_palm` | default | 6,816 | 736,128 |
| `umbrella_thorn` | default | 14,660 | 1,583,280 |
| `saxaul` | default | 6,332 | 683,856 |
| `kapok` | default | 36,752 | 3,969,216 |
| `western_red_cedar` | default | 26,122 | 2,821,176 |
| `black_alder` | default | 23,600 | 2,548,800 |
| `olive` | default | 25,091 | 2,709,828 |
| `silver_fir` | default | 104,596 | 11,296,368 |
| `red_mangrove` | default | 24,848 | 2,683,584 |
| `tamarisk` | default | 8,020 | 866,160 |
| `rowan` | default | 26,140 | 2,823,120 |
| `canary_pine` | default | 35,214 | 3,803,112 |
| `mediterranean_cypress` | default | 9,092 | 981,936 |
| `oriental_evergreen` | default | 15,676 | 1,693,008 |
| `sacred_bodhi_and_fig` | default | 42,618 | 4,602,744 |
| `peaceful_willow` | default | 75,452 | 8,148,816 |

### 制作基準の確定

全既存モデルの計測を踏まえ、low≤500、medium≤3,000、high≤25,000、ultra≤120,000三角形を初期の制作目安とする。highのsource配列は3 MiB、ultraは13 MiBを目安とする。最大の既存モミは104,596三角形・11,296,368 bytesであり、詳細モデルを一律に新造せず評価して再利用する。この数値は森林全体の描画予算を書き換えるものではなく、超過時は理由と実測を記録して判断する。

4品質で原点・地表基準・主要寸法を揃え、high／ultraの木部は同一の骨格、low／mediumも樹種固有の輪郭を残す。今回の新2種は樹高の差を8%以内、水平寸法をultraの80〜120%に収める検査を追加した。これは描画上の差の許容範囲であり、植物の実寸の測量値ではない。

## 2. 作製したモデル（F1-2）

| 樹種 | 品質 | 三角形 | bufferBytes |
| --- | --- | --- | --- |
| `norway_spruce` | low | 220 | 7,672 |
| `norway_spruce` | medium | 1,470 | 158,760 |
| `norway_spruce` | high | 18,314 | 1,977,912 |
| `norway_spruce` | ultra | 44,246 | 4,778,568 |
| `silver_birch` | low | 424 | 31,320 |
| `silver_birch` | medium | 1,248 | 134,784 |
| `silver_birch` | high | 13,160 | 1,421,280 |
| `silver_birch` | ultra | 51,320 | 5,542,560 |

- ultraは既存defaultの形状を維持した。変更前HEADの生成器と、両樹種の全geometry属性配列・index配列が完全一致することも確認した。highは同じ乱数列を消費して枝骨格を維持し、トウヒの針葉面は3区間へ縮約、シラカバの葉は5枚ごとに残し葉面積を補う。
- トウヒmediumは輪生する元の枝に沿う薄い8面の枝葉の房。lowは段のある細い円錐状の輪郭と頂芽を残す。
- シラカバmediumは主枝ごとに垂れた葉群を2つの房へ近似する。lowは白い幹と複数の疎な葉群を残す。最初のlowは横幅が不足したため、輪郭の検査と比較画像を使って修正した。
- 全段階を `TREE_DEFINITIONS` とBVの品質別variantへ登録した。下位3段階の `basedOn` は同樹種ultraを指し、作者は既存と同じCodex GPT-6.1 Sol。競合版がないためCE採用は単独版の暗黙採用とした。
- LODは距離選択＋bounded。全域の詳細モデル化や品質優先の予算迂回は追加していない。

形の確認には、既存BVが挙げる一次資料を参照した。トウヒの円錐形の樹冠・輪生枝と枝の上下方向は [JRC European Atlas](https://forest.jrc.ec.europa.eu/media/atlas/Picea_abies.pdf)、シラカバの白い幹・開いた樹冠・垂れた枝は [Forestry England](https://www.forestryengland.uk/tree-species/silver-birch) を確認した。今回の樹高12 m／11 mは既存モデルを継承した表示用の寸法で、最大樹高を表すものではない。

比較画像：

- [全8モデル・斜め](ce-tree-lod-boreal-20261029/models-front.png)
- [側面](ce-tree-lod-boreal-20261029/models-side.png)、[俯瞰](ce-tree-lod-boreal-20261029/models-top.png)
- [実BV・トウヒmedium](ce-tree-lod-boreal-20261029/bv-norway-spruce-medium.png)、[実BV・シラカバmedium](ce-tree-lod-boreal-20261029/bv-silver-birch-medium.png)
- [CE森林レイヤー・林縁](ce-tree-lod-boreal-20261029/forest-edge.png)、[低視点](ce-tree-lod-boreal-20261029/forest-low.png)、[俯瞰](ce-tree-lod-boreal-20261029/forest-overview.png)

## 3. 確認結果と限界

- 関連Vitest 8ファイル・64件が成功。4品質の登録・三角形の段階的減少、high／ultraの木部一致、寸法、有限の座標と法線、資源の解放、森林LOD・公園・CE更新・採用表との互換を確認した。失敗したシラカバのlowの寸法を修正後、影響するborealTrees.test.tsの20件を再実行して成功した。
- 実BVでは2樹種それぞれのlow／medium／high／ultraを選択し、pageerrorは0件。
- Chromium、ANGLE Metal Renderer／Apple M4で森林レイヤーの9条件を確認。全条件で森林面積64,768 m²を維持し、本数・三角形・calls・影三角形は各森林品質の予算内。林縁と低視点で2樹種の採用モデルを確認した。
- light→standard→highの切替3巡で常駐geometry数は34→34→34、WebGLエラーなし。詳細は [描画記録JSON](ce-tree-lod-boreal-20261029/results.json)。
- これは森林レイヤー単体の有限な確認であり、街全体の操作p95・GPU完了時間・33 ms目標の達成を測ったものではない。影の描画・別GPU・高DPR・全バイオームの総合受入はF5に残る。
- boundedの遠景は既存の集合林冠／簡略立木も使う。林縁画像のすべての木がBVモデルになったわけではない。森林品質による近景予算を守り、残る候補は簡略表現を維持する。
- TypeScript全体検査は、既存の `src/city-editor/renderers/fogControls.ts:45` のstring／EditorMessageKey不一致1件で失敗。今回の変更ファイルに新しい型エラーは報告されなかった。変更ソースのBiomeと差分チェックは成功。

## 4. 次の作業

既存シナノキ・イチイの基準画像確認（F1-1）と、ベイスギ・モミの4品質化（F1-3）へ進む。全バイオームの割当・無立木方針・混交林の判定方式は後続段階のまま維持する。
