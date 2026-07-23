# 海流ゲームプレイ機能のための事前調査（セル構造・航路生成ロジック）

`docs/plan/searoute-current-direction-visualization.md`（海流の向きを装飾的に可視化するWebGLレイヤー、実装済み）の実装後の会話から派生した調査ログ。実装は行っていない。将来「航海士が新航路を開拓する」といったゲーム機能を検討する際の前提知識としてまとめる。

---

## 0. 発端

- ユーザーの気づき: 現在の `searoutes`（`pack.routes` の `group: "searoutes"`）は、地理的にすぐ近い港同士を繋いでいないケースが多い。海流が邪魔しているのではないか？という仮説。
- そこから派生した将来構想: 航海士（キャラクター/NPC）が既存航路の外に新しい航路を開拓していくゲーム機能。実現するなら航路上だけでなく**海全体**に海流（向き・強さ）の設定が必要になりそう。
- 懸念点: 現在の海洋セルはボロノイ分割の形が不揃い（外洋ほど巨大・歪）に見える。これが海流フィールドの実装の障害にならないか。
- → 上記3点を、憶測ではなくコードを読んで検証した結果が以下。

---

## 1. 結論サマリ

1. **地図は「海も陸もボロノイ分割」で合っているが、単一の均一分割ではない。** `grid`（生成初期、全域一様密度）→ `pack`（`reGraph` で再サンプリングした本番グラフ）の2段構成で、**`pack` 段階で外洋の点が意図的に間引かれる**ため、外洋セルほど巨大・不定形になる。これはコード内コメントでも自覚されている既知の仕様（バグではない）。
2. **「近い港同士に航路が無い」原因は海流ではない。** 現状のルート生成コードに海流・風・視線判定の概念は一切存在しない（確認済み）。原因は次の2つの幾何学的な仕組み:
   - 港は地理的近さではなく「連結水域（feature id）」でグルーピングされ、地峡や陸地で水域が切れていれば近くても別グループになり、そもそも候補にすら入らない。
   - 候補になったとしても、実際に辺を張るかどうかは Urquhart graph（Delaunay三角形分割から各三角形の最長辺を除去したもの）が決めており、これは「近い点同士を必ず全部繋ぐ」設計ではなく、意図的に疎な「それらしい最小限のネットワーク」を作るためのアルゴリズム。
3. **将来、海流をセル単位のフィールドとして持たせるなら、`pack` ではなく `grid` を土台にする方が筋が良さそう。** `grid` は間引かれる前のグラフなので外洋も含めマップ全域で均一密度を保っている。実際、降水量レイヤーも同じ理由で `pack` ではなく `grid` セルを使っている前例がある。

---

## 2. セル構造: `grid` と `pack` の二段構成

### 2.1 `grid`（初期・均一密度）

- `src/utils/graphUtils.ts:52-67` `getJitteredGrid` — 正方格子上に点を置き（`spacing` 間隔）、各点を `radius * 0.9` までジッターさせる。
- `src/utils/graphUtils.ts:86-104` `placePoints` — `points` オプション（2500〜10000セル）から単一の `spacing` を計算し、**マップ全域に一様適用**。陸か海かで密度を変える処理はここには無い。
- `src/utils/graphUtils.ts:163-179` `calculateVoronoi` — `Delaunator.from(allPoints)` からVoronoi構築。地域による特別扱いは無い。

### 2.2 `pack`（`reGraph`、海岸線バイアスの再サンプリング）

`src/main.ts:1411-1472` `reGraph()` が `grid` から間引き・密度追加を行って `pack.cells` を作る。核心部分（`main.ts:1417-1439`）:

```ts
for (const i of gridCells.i) {
  const height = gridCells.h[i];
  const type = gridCells.t[i];

  if (height < 20 && type !== -1 && type !== -2) continue;
  if (type === -2 && (i % 4 === 0 || features[gridCells.f[i]].type === "lake")) continue;

  const [x, y] = points[i];
  addNewPoint(i, x, y, height);

  if (type === 1 || type === -1) {
    if (gridCells.b[i]) continue;
    gridCells.c[i].forEach((e: number) => {
      if (i > e) return;
      if (gridCells.t[e] === type) {
        const dist2 = (y - points[e][1]) ** 2 + (x - points[e][0]) ** 2;
        if (dist2 < spacing2) return;
        const x1 = rn((x + points[e][0]) / 2, 1);
        const y1 = rn((y + points[e][1]) / 2, 1);
        addNewPoint(i, x1, y1, height);
      }
    });
  }
}
```

- `type` は `src/generators/features.ts` の `markupGrid` が付ける海岸距離コード（陸岸=1、水岸=-1、そこから外側へ -2, -3, … と `DEEP_WATER_LIMIT = -10` まで、未到達は0）。
- 1行目のガード: 水セル（`height < 20`）で、かつ最も内側の水岸(`-1`)・その次(`-2`)以外は**丸ごと削除**。外洋のサンプル点はほぼ全滅する。
- 2行目: `-2` リングも4個に1個だけ残し、湖なら完全削除。
- 6-15行目: 海岸沿い（陸岸`1`／水岸`-1`）の同種隣接セル同士は、離れていれば中点を追加して**密度を上げる**。
- 陸セル（`height >= 20`）は無条件で元の密度のまま残る。

### 2.3 外洋セルが巨大・不定形になることは自覚済みの仕様

`src/generators/features.ts:37-43`:

```ts
/**
 * Water cells larger than the map's typical (median) cell area by this factor are skipped
 * by calculateEnclosure() and left at 0. reGraph() (main.ts) drops most sample points beyond
 * the immediate coastline, so open-ocean cells far from any shore balloon in size — a few BFS
 * hops through cells that large can span enough real distance to spuriously reach land.
 */
private ENCLOSURE_AREA_LIMIT_RATIO = 3;
```

このコメントの通り、`reGraph` が外洋の点を間引く副作用として外洋セルが肥大化することは既知で、既に別の場所（`calculateEnclosure`）で対処が入っている。**陸セルは常に均一密度、海岸セルはむしろ密度が上がる、外洋セルだけ疎で不定形** — というのが実態。

---

## 3. 航路生成: 「近い港が繋がらない」の実際の原因

### 3.1 港のグルーピングは地理的近さではなく連結水域（feature id）

`src/generators/routes-generator.ts:338-358` `sortBurgsByFeature`:

```ts
for (const burg of burgs) {
  if (burg.i && !burg.removed) {
    const { feature, capital, port } = burg;
    addBurg(burgsByFeature, feature as number, burg);
    if (capital) addBurg(capitalsByFeature, feature as number, burg);
    if (port) addBurg(portsByFeature, port as number, burg);
```

`burg.port`（`src/generators/burgs-generator.ts:154-155`）は隣接水セルの feature id（連結成分ID、`markupGrid`/`markupPack` のBFSフラッドフィルで決まる）。地峡・陸地で水域が物理的に繋がっていなければ、目と鼻の先でも別 feature id になり、`generateSeaRoutes`（`routes-generator.ts:559`、`for (const [featureId, featurePorts] of Object.entries(portsByFeature))`）は**同じグループ内でしか航路を検討しない**。つまり別グループの港同士はそもそも候補にすら入らない。

### 3.2 Urquhart graph は意図的に疎

`src/generators/routes-generator.ts:363-402`（`calculateUrquhartEdges`、コメント含め検証済み）:

```ts
// Urquhart graph is obtained by removing the longest edge from each triangle in the Delaunay triangulation
// this gives us an aproximation of a desired road network, i.e. connections between burgs
// code from https://observablehq.com/@mbostock/urquhart-graph
private calculateUrquhartEdges(points: Point[]) {
  ...
  for (let e = 0; e < n; e += 3) {
    const p0 = triangles[e], p1 = triangles[e + 1], p2 = triangles[e + 2];
    const p01 = score(p0, p1), p12 = score(p1, p2), p20 = score(p2, p0);
    removed[
      p20 > p01 && p20 > p12
        ? Math.max(e + 2, halfedges[e + 2])
        : p12 > p01 && p12 > p20
          ? Math.max(e + 1, halfedges[e + 1])
          : Math.max(e, halfedges[e])
    ] = 1;
  }
  ...
}
```

Delaunay三角形分割から各三角形の最長辺を1本ずつ除去したグラフ（教科書通りのUrquhart graph）。同じアルゴリズムが `generateMainRoads`・`generateTrails` にも使われている。**「近い点同士を必ず繋ぐ」保証は無く**、疎な「それらしい」ネットワークを作ることが目的のアルゴリズムなので、近距離でも辺が選ばれないことは普通に起こる。

### 3.3 現状のルート生成に海流・風・視線判定は存在しない

`routes-generator.ts` 全体を確認した限り、"current" という文字列はパス探索コスト関数のループ変数 `current` としてのみ出現し、海流概念とは無関係。距離に類する唯一の要素は `getWaterPathCost`（`routes-generator.ts:404-433`）内の沿岸距離コスト（`ROUTE_TYPE_MODIFIERS`、沿岸=1〜遠洋=8倍）と最低気温カットオフ（`MIN_PASSABLE_SEA_TEMP = -4`）だが、これは**辺として選ばれた港ペア間の実セル経路を決める**段階の話であり、そもそもどの港ペアを検討するか（3.1・3.2）には一切関与しない。

---

## 4. 将来の海流ゲームプレイ機能への示唆（未実装・検討メモ）

- 外洋の `pack` セルは間引かれた結果の巨大・不定形なセルなので、海流フィールドを `pack` セル単位で持たせると、そのまま見た目・判定の粗さを引き継ぐ。
- `grid` はマップ全域で均一密度を保ったまま残っている（`reGraph` が間引くのは `pack` を作る時だけで、`grid` 自体は元のまま）。降水量レイヤーが同じ理由で `pack` ではなく `grid` セルを使っている前例がある（`buildDeckLayers.ts` のコメント参照）。海流フィールドも `grid` 側に持たせる方が、外洋での解像度・形状の均一性を確保しやすい。
- 「航海士が新航路を開拓する」機能を実装するなら、現状の Urquhart graph ベースの航路生成（3.2）とは別の仕組み（海流に沿ったコスト関数でのパス探索、あるいは海流ベクトル場上のシミュレーション）が必要になりそうで、既存の `generateSeaRoutes` の置き換えというより追加のレイヤーになる可能性が高い。
- 「近い港が繋がっていない」こと自体は、海流を導入しなくても3.1（feature id グルーピング）・3.2（Urquhart graph の疎さ）を見直すだけでも改善できる余地がある（例: 同一海洋大陸棚内なら feature id を跨いでも近傍港を候補に含める、Urquhart以外の密なグラフを併用する、など）。海流機能とは独立に着手可能な改善ポイント。

---

## 5. 関連ドキュメント

- `docs/plan/searoute-current-direction-visualization.md` — 海流の向きを示す装飾的なWebGLアニメーション(案A)。実装済み（`src/renderers/webgl/adapters/deckDataAdapters.ts` の `buildSeaCurrentCellPolygons`/`getSeaCurrentColor`、`buildDeckLayers.ts` の `toggleSeaCurrents` レイヤー、`src/controllers/seaCurrentsAnimation.ts` の自己判定型アニメーションループ）。湖セルは `pack.features[pack.cells.f[cellId]].type === "ocean"` 判定で除外済み（実際の湖横断ケースで検証済み）。今回の調査で判明した「海洋セルが不揃い」「近い港が繋がらない」という問題は、この可視化機能自体には影響しない（既存の `searoutes` ルートが通るセルをそのまま使っているだけのため）。
- `docs/plan/naval-sea-lanes.md` — 艦隊の移動・到達判定を既存の `searoutes` 航路グラフに拘束する設計。既存の航路生成ロジック（3.1・3.2）をそのまま前提にしており、本ドキュメントで指摘した「疎さ・グルーピングの荒さ」は、この設計にとっても「艦隊が到達できる範囲が思ったより狭い」という形で影響し得る。
