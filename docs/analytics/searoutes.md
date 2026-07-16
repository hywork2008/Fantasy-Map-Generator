調査結果：島間を結ぶのは `searoutes`（海路）で、道路・徒歩道は島を越えません。海路のセル経路自体は陸地を通過しないため、島を横切って見える場合は主に描画時の曲線補間によるものです。

- 港は「島」ではなく接続先の水域 feature ID（海・湖・流出先）で分類されます。同じ水域の港を候補にし、各島（land feature）から少なくとも1港を選ぶ設計です。港候補がない、凍結している、水域が小さすぎる等の場合は、その島に海路は生えません。[burgs-generator.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/burgs-generator.ts:79)

- 同じ水域にある港の座標から Delaunay 三角形分割を作り、各三角形の最長辺を除去する Urquhart graph を候補接続網にします。したがって「すべての港を相互直結」ではなく、疎なネットワークです。[routes-generator.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/routes-generator.ts:360)

- 各候補辺について、Voronoi の隣接セルをグラフとして優先度キュー探索します。海路では中間セルを `h < 20` の水域に限定し、`-4°C` 未満の海と陸地は通行不可です。コストは距離²に、水深カテゴリの係数（海岸 `1`、海 `1.8`、外洋 `4`、深海 `6`…）を掛けたものなので、最短距離だけでなく、概ね海岸寄りを好みます。既存海路を再利用する辺はコストが半分になります。[routes-generator.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/routes-generator.ts:404)

- 端点だけは港のある陸セルです。探索実装はゴール判定を通行可否判定より先に行うため、`港の陸セル → 水域…→ 港の陸セル` は成立しますが、中間で島の陸セルには入れません。[pathUtils.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/utils/pathUtils.ts:328)

- ただしこれは厳密な Dijkstra の最短路ではありません。ゴールセルをキューから取り出した時点ではなく「隣接セルとして発見した時点」で探索を終了するため、重み付きグラフで最適性が保証されない実装です。同じコード箇所がその挙動です。[pathUtils.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/utils/pathUtils.ts:346)

見た目については、SVG では海路を Catmull–Rom（`alpha=0.5`）で平滑化します。[routes-generator.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/routes-generator.ts:869) WebGL も同じ `alpha=0.5` でポリラインをサンプリングします。[deckDataAdapters.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/renderers/webgl/adapters/deckDataAdapters.ts:1039) この補間には「曲線が陸を避ける」制約がないため、狭い島・複雑な海岸線では、水セル列は島を迂回していても描画曲線だけが島を横断して見え得ます。

なお生成済み route は `cells` ではなく `points` の第3要素にセル ID を保持します。[models.ts](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/types/models.ts:273) 実際の通過判定を確認するなら、`route.points.map(([, , cell]) => pack.cells.h[cell])` を見るのが正確です。
