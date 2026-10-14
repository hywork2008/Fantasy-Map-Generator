# 骨格先行生成 Phase S2: 骨格に沿うメッシュ

実施日: 2026-10-14
対象: [設計書](../plan/skeleton-first-generation.md) Phase S2
前段: [S1記録](1014-skeleton-first-s1.md)

## 実装

`buildConformingMesh(inputs, skeleton, seed)` を `generators/generation/skeleton/conformingMesh.ts` に追加した。K5を通過した骨格から既存の `Mesh` 型を作る。現行の生成経路とUIには接続していない（S3）。

- 壁、硬い水域の境界、川の両岸、採用した道路を制約線にする。道路IDと川indexを対応表に残す。重複する道路も別々の対応表を持つ。
- 境界を標本化して法線方向の鏡像の種点を置く。細かく折れた線の各頂点へ種点を増やしすぎないよう、標本の間隔を確保する。
- evolutionと同じ `scatterSites`（可変半径Poisson-disc）を使い、骨格から離れた内部の種点を追加する。ここでは一定半径、間隔は既存の50mブロックに対する44.8mの較正と同じ0.896倍。既存の `grid.ts` は関数のexportだけを追加し、既存呼出しの乱数消費・処理は変えていない。
- `computeVoronoiCells` の隣接関係から、垂直二等分線の半平面で窓を切り取る。ほぼ共円の種点で不安定になる外心座標を直接使わない。
- 骨格が面の内部を通る箇所だけ、その面を線で分割する。交点と端点を隣接する面の辺にも挿入し、T字の未接続を防ぐ。骨格を持たない辺を通じて1㎡未満の断片を統合する。自己交差する統合は採用しない。
- 対応表は方向付きの `EdgeRef[]`。窓の外へ出て再入する線には、連続する区間ごとの `runs` も返す。窓の外の部分は対応表の対象外。
- 面の単純性、辺の両側の整合性、内部の亀裂がないこと、窓の面積を覆うこと、制約の全区間が対応する辺を持つことを検証する。失敗時は例外とし、不完全なメッシュを返さない。
- RNGは `${seed}:skeleton:${attempt}:mesh`。入力を変更せず、同じ入力から同じID・走査順の結果を作る。

トポロジーの組立ては `meshTopology.ts`、線分の切取りと距離計算は `meshSegments.ts`。S3がfeatureGroupを作るための対応表の型は `contracts.ts` に置いた。

## 設計からの変更

設計§4.6の「許容値を超えた領域の標本間隔を縮めて再計算」は、**その面だけを骨格の直線で分割する**方式にした。鏡像対だけでは有限線分の端点・鋭角・複数の交差を必ず通る保証がないためである。全体の再計算や頂点の押し動かしはしない。結果はボロノイを局所分割したメッシュであり、全ての面が単独の種点のボロノイ領域であるとは限らない。

同じ位置の頂点の数値的な統合許容値は `max(0.0001m, half × 1e-9)`。対応する辺の端点はこの2倍以内とする。ブロック寸法の5%という設計の許容値より十分小さい。骨格の入力座標は変更しない。

## 比較セットの結果

S0/S1と同じ単独12条件×12 seed、Triviersの層別96都市を実行した。

| 指標 | 単独生成 | FMG連携 |
| --- | ---: | ---: |
| 入力数 | 144 | 96 |
| K5成功（K6対象） | 138 | 95 |
| K6成功 | **138 / 138** | **95 / 95** |
| K6時間 中央値 / 最大 ms | 55.9 / 218.8 | 9.9 / 410.3 |
| 面数 / evolution面数（都市ごとの比の中央値） | 1.519 | 1.326 |
| 面積p10 / evolution面積p10（同） | 0.020 | 0.421 |
| 面積中央値 / evolution面積中央値（同） | 0.640 | 0.737 |
| 面積p90 / evolution面積p90（同） | 0.945 | 0.952 |
| 1㎡未満の面の総数 | 117 | 6 |
| 最小面積 ㎡ | 8.22e-8 | 8.12e-8 |
| 最短辺 m | 0.000105 | 0.000106 |

比較用evolutionは同じ窓・地形・ブロック寸法で `buildGrid` を実行した最終Lloyd段階。生成する種点は別の固定RNG streamを用いた。時間はローカルでの参考値であり、S3の完成都市の時間ではない。

内部の街区はevolutionと同じ粗いスケールに収まるが、**面積分布は一致しない**。骨格周辺の細長い面・交差に囲まれた小面によって面数が増え、特に単独生成のp10が小さくなる。各短い境界区間へ鏡像対を置く初期実装では面数比の中央値が約2倍だったため、境界標本の間隔を調整して上記へ下げた。

K5の不採用はS1と同じ単独6件、FMG1件で、K6の失敗に数えていない。川を貫く壁は単独生成と100 seedのテストで検証した。FMGのこのセットだけでは川を貫く壁を検証できないというS1の制約も変わらない。

## S3への引継ぎ

小面の面積・短い辺は診断として返し、黙って削除しない。制約で囲まれた面は、線を維持する限り統合できない場合がある。現行 `geom.isSimplePolygon` と文書の `validate` は「自己交差なし」に加えて「面積1㎡以上」を要求するため、そのまま接続するとこれらの面を却下する。S3では、骨格を維持した細小面の扱い（建築対象からの除外と検証の分離など）を明示してから後段につなぐ必要がある。今回の単純性検証は、正の面積と非隣接辺の非交差を直接確認する。

## 検証と再現

- 100 seed（5形状、内陸・川・海岸）で、面の単純性、窓の被覆、線と辺の距離・総延長、方向付き対応表の連続性を確認。
- 同seedの完全一致、入力不変、制約なし、重複道路、窓を出て再入する道路を確認。
- 型検査、CE依存方向・ブラウザー境界・実行時循環の検査を実行。
- 骨格の既存テスト、メッシュ変形、grid evolutionの回帰テストを実行。

```sh
node --import tsx scripts/city-editor/skeleton/skeletonLab.ts \
  --out temp/s2/standalone-verified.jsonl --seeds 12 --mesh --svg first
node --import tsx scripts/city-editor/skeleton/skeletonLab.ts \
  --out temp/s2/fmg-verified.jsonl --csv temp/s0/triviers-inputs.csv \
  --burg "$(cat temp/s0/sample-ids.txt)" --mesh --svg none
npx vitest run src/city-editor/generators/generation/skeleton \
  src/city-editor/generators/meshDeformation.test.ts \
  src/city-editor/generators/gridEvolution.test.ts --maxWorkers=1
npx tsc --noEmit
node --import tsx scripts/lint-architecture.ts
```

`--mesh` は追加オプションで、従来のS1計測は変更しない。JSONLにK6の時間・失敗・最小面積・最短辺・面数と面積分布を追加し、SVGにはメッシュを重ねる。出力は既存ファイルを上書きしない。
