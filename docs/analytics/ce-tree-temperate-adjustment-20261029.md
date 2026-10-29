# シナノキ・イチイのLOD外観調整と全20樹種の受入

2026-10-29。[計画](../plan/ce-forest-biome-tree-lod-tasks.md) の残りT01・T02を調整し、T04はユーザーの訂正に基づきCodex採用で受入とした。全20樹種80品質・標準29バイオームについて、これまでの確認範囲と条件付きの性能記録に基づく受入を完了する。追加の植物相・植生回復・季節・公園の全域予算等は引き続き別課題である。

## 修正

シナノキ・イチイのlowは、7房が上へ伸びる螺旋配置だったため、幅の広いhighから縦に積み重なる形へ変わっていた。5房を広がる下側の樹冠へ、2房を上部へ配置し直した。根の基準・幹・材質・房の法線／AOは維持する。元モデルの水平幅はhighの85〜115%内となり、CEの半径正規化後も固定視点で幅の差が小さくなった。

シナノキmediumはhighの葉群に沿う房を維持し、coverageを1.3→1.13へ下げた。イチイmediumはhighが描く4扇に対してultraの10扇を包んでいたため、highの4扇・4分割に当てはめ、水平の主軸方向を反映する。さらにcoverageを0.78→0.45へ下げた。省略する扇についても乱数を従来どおり消費し、枝配置は変えない。

mediumの作者とCE採用はOpusのままとし、今回のCodexによる調整をcreditsに追記した。比較用の旧Codex mediumは保持する。high／ultraは両種とも変更前HEADとのgeometry全属性・indexのSHA-256が一致した。根を含むnative下端は−0.35 m、CEではy=0地表基準を維持する。

| 樹種 | low 三角形 前→後 | medium 三角形 前→後 | high | ultra |
| --- | ---: | ---: | ---: | ---: |
| シナノキ | 153→141 | 1,888→2,043 | 21,626 | 84,098 |
| イチイ | 167→152 | 1,827→2,104 | 14,484 | 33,428 |

小さい房を使うと隣の房に埋もれて削除される面が減るため、mediumの三角形は少し増える。いずれも3,000未満で、lowは削減された。[調整後80品質の棚卸し](ce-tree-temperate-adjusted-inventory-20261029.json) に実寸・採用ID・作者・source bytesとソースSHA-256を記録した。

## 固定視点の比較

[変更前](ce-tree-temperate-transitions-before-20261029.json)と[変更後](ce-tree-temperate-transitions-after-20261029.json)は方位0°・仰角12／40／70°。BV実寸と、CE同様に水平最大半径4 m・地表より上の高さ10 mへ正規化したモデルを別々に比較する。同じhighの投影AABB高さ90 pxを共通のworld scaleとして使い、品質ごとの画面fitはしない。highの「樹冠の高さ90 px」という意味ではなく、全モデルの外接箱を投影した高さである。

下表は正規化後の値。area/highはalpha≥128の描画面積比、IoUはhighのマスクとの重なり。面積の縮小・幅の一致だけで知覚上の同一性を判定せず、目視も行った。

| 樹種 | 品質 | 仰角 | 幅px 前→後 | 面積/high 前→後 | IoU 前→後 |
| --- | --- | --- | --- | --- | --- |
| `garden_parkland` | low | 12° | 47→57（high 58） | 0.990→1.021 | 0.738→0.798 |
| `garden_parkland` | medium | 12° | 57→57（high 58） | 1.100→1.074 | 0.847→0.834 |
| `garden_parkland` | low | 40° | 43→52（high 52） | 0.961→1.092 | 0.726→0.809 |
| `garden_parkland` | medium | 40° | 51→52（high 52） | 1.145→1.113 | 0.832→0.814 |
| `garden_parkland` | low | 70° | 52→62（high 62） | 0.889→1.046 | 0.734→0.791 |
| `garden_parkland` | medium | 70° | 62→62（high 62） | 1.153→1.137 | 0.851→0.852 |
| `sacred_yew` | low | 12° | 47→55（high 58） | 1.282→1.199 | 0.647→0.606 |
| `sacred_yew` | medium | 12° | 57→54（high 58） | 1.309→0.964 | 0.702→0.613 |
| `sacred_yew` | low | 40° | 44→51（high 53） | 1.214→1.310 | 0.630→0.653 |
| `sacred_yew` | medium | 40° | 53→51（high 53） | 1.372→1.017 | 0.685→0.631 |
| `sacred_yew` | low | 70° | 54→63（high 67） | 1.227→1.298 | 0.621→0.612 |
| `sacred_yew` | medium | 70° | 65→62（high 67） | 1.445→1.040 | 0.639→0.574 |

追加で[方位90°・90 px](ce-tree-temperate-transitions-side-20261029.json)、[方位0°・28 px](ce-tree-temperate-transitions-small-20261029.json)を確認した。変更後は3構成×native／CE正規化×2種×4品質×3仰角＝144比較。28 pxでも両種の横へ広がる輪郭を維持した。lowは遠景用の粗い面、mediumは不透明な房のため、highの個別葉・扇の細かい穴と完全には一致しない。

シナノキlowのwidthはhighとの差が小さくなり、3仰角すべてでIoUも改善。mediumは面積の過多が減る一方、シナノキの12／40°ではIoUがわずかに低下した。全指標が改善したとは記録しない。イチイmediumの面積比は1.309〜1.445から0.964〜1.040となったが、IoUは低下した。今回の受入は密度・幅の大きな飛びを緩和し、4品質がそれぞれの表現を保つことに対する条件付きの判断であり、全視点でhighと見分けがつかないという判断ではない。

## 林と実BV

[実BV・prototype確認JSON](ce-tree-lime-yew-adjusted-20261029/results.json) はCE材質へ統合した8品質を確認し、45／90 pxのhigh樹冠基準・3仰角のmedium／high比較と、260本の固定林（20列×13列・5.5／6 m間隔、仰角35°・距離130 m）を描画する。単木の輪郭と枝間の穴、林縁・林内の隙間を一時画像で目視した。林ではmediumがhighより連続した面として見える差は残る。透明材質やカメラに追従する面は導入していない。

実BVで全8品質の作者・採用表示と、比較用Codex mediumが非採用であることを確認した。prototypeの座標・法線・色は有限で、元モデルと三角形数が一致し、解放後geometry／textureは0／0。pageerror・WebGLエラー・BVエラーは0件。Apple M4／ANGLE Metal、DPR 1での表示確認であり、都市全体のCPU/GPU性能を再測定したものではない。

## 検証と再現

関連6ファイル64テスト成功。最終coverageの変更後は影響するtreeQuality／europeanYewを再確認した（重複分は64件へ加算しない）。lowの水平幅がhighの85%を下回る退行を防ぐ2ケースを追加した。変更したソース5ファイルのBiome検査成功。型検査は再実行していない。

```sh
npx vitest run src/buildings/landscape/treeQuality.test.ts src/buildings/landscape/smallLeavedLime.test.ts src/buildings/landscape/europeanYew.test.ts src/city3d/adoption.test.ts src/city3d/three/forestTreeDetails.test.ts src/city3d/three/openSpaceTreeLod.test.ts
node --import tsx scripts/measureCeTreeModels.mts docs/analytics/ce-tree-temperate-adjusted-inventory-20261029.json
node --import tsx scripts/verifyCeTemperateTreeTransitions.mts docs/analytics/ce-tree-temperate-transitions-after-20261029.json
CE_TREE_AZIMUTH=90 node --import tsx scripts/verifyCeTemperateTreeTransitions.mts docs/analytics/ce-tree-temperate-transitions-side-20261029.json
CE_TREE_PIXELS=28 node --import tsx scripts/verifyCeTemperateTreeTransitions.mts docs/analytics/ce-tree-temperate-transitions-small-20261029.json
node --import tsx scripts/verifyCeLimeYewBaseline.mts
```

描画スクリプトは既定でJSONだけを出力する。目視用にはOSのtmpdir配下に一時ディレクトリを作り、CE_TREE_PREVIEW_DIRで渡す。リポジトリ内を渡すと失敗する。今回の画像は目視後に全て削除し、保存・Git収録しない。変更前JSONは当時のソースSHA-256と共に保持し、再実行で上書きしない。

次の拡張候補は公園・墓地の有限な全域予算と非採用時の代替描画。[最終受入記録](ce-tree-final-acceptance-20261029.md) の別途実装する拡張に沿って扱う。
