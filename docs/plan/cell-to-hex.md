# Hexへの移行

シミュレーションゲーム化する場合の現行ボロノイから六角形への移行の検討。

## Q1

船の路が岬など陸地を貫通する事などから、ボロノイ分割している現行マップのセルから六角形のヘックスセル板の地図を用意した方が良いと考えていますが、ヘックスセルは現行のwindow.fmg.world.pack以下のデータの持ち方とは別の理想的な持ち方があるのでしょうか？

## A1

結論から言うと、ヘックス盤は「国家の拡張・開拓・移動・災害」にはかなり相性が良いですが、`pack` を丸ごと別形式に置き換えるのは勧めません。現行の `pack.cells` はすでに、セル単位シミュレーションに向く SoA（属性ごとの並列配列）です。理想は、**データの持ち方を `Voronoi` から `Hex` に差し替え可能に抽象化し、属性・エンティティ・既存 API は保つ**形です。

また、岬を海路が突っ切る問題は、ヘックス化の前に切り分ける価値があります。現行の海路探索自体は水セル、港の haven、航行可能河川だけを通るよう制限されています。一方、描画時には海路にも [`curveCatmullRom`](/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/generators/routes-generator.ts:1019) が使われています。水セルの中心を通る経路であっても、曲線補間が狭い岬の内側へ膨らんで陸地を横切る可能性があります。

つまり、まずは以下を確認すべきです。

```text
A. route.cells に陸地セルが混入している
   → 経路探索／海岸・haven 判定の問題

B. route.cells は全て正しい水路だが、描画 SVG が陸を横切る
   → Catmull-Rom 曲線描画の問題
```

B なら、海路だけ `curveLinear` にする、あるいはセル中心ではなく「共有する水域辺の中点」を経由させれば直せます。ヘックス化は不要です。

## ヘックスを導入する場合の考え方

現行の `pack.cells` は、概念的には次のような「地図トポロジー＋セル属性」です。

```text
pack.cells.c    隣接セル
pack.cells.p    セル中心座標
pack.cells.h    高度
pack.cells.state / province / culture
pack.cells.pop / capacity / demographics
pack.cells.r / fl / haven / harbor
```

ヘックスにしても、この役割は変わりません。変わるのは、セルの幾何と隣接関係です。

| 要素 | 現行 Voronoi | Hex |
| --- | --- | --- |
| セル形状 | 不規則な多角形 | 正六角形 |
| 隣接数 | 通常 5〜7、可変 | 原則 6、固定 |
| 隣接情報 | `cells.c: number[][]` | 6方向の固定配列または座標計算 |
| セル中心 | `cells.p` | axial 座標から決定可能 |
| 面積 | セルごとに異なる | 原則一定 |
| 国境 | 地形に沿って自然 | 階段状になりやすい |
| 経路安全性 | 海岸処理・曲線描画で注意 | エッジ通行判定を作りやすい |

開拓ゲームでは、Hex の「一歩ずつ隣接地へ進む」性質は非常に強みになります。前哨地、道路、補給、領有、災害の伝播、国境防衛を、すべて 6 方向隣接で共通化できます。

## 理想的な構造

`pack` とは別に `hexMap` を生やすより、`pack` の内部に「どのトポロジーであるか」を持たせる方がよいです。別の世界モデルを二重管理すると、人口・州・国家・経済・表示がずれます。

概念的には次の分離です。

```ts
interface CellTopology {
  readonly kind: "voronoi" | "hex";
  readonly count: number;

  // 地理
  readonly centerX: Float32Array;
  readonly centerY: Float32Array;
  readonly area: Float32Array;
  readonly neighbors: Int32Array; // hex なら count × 6、欠損は -1

  // Hex の場合のみ。Voronoi では不要
  readonly q?: Int16Array;
  readonly r?: Int16Array;
}

interface CellFields {
  // 静的世界
  height: Uint8Array;
  biome: Uint8Array;
  precipitation: Uint8Array;
  temperature: Int8Array;

  // 政治・社会
  state: Uint16Array;
  province: Uint16Array;
  culture: Uint16Array;
  settlement: Uint16Array;

  // 動的シミュレーション
  population: Float32Array;
  carryingCapacity: Float32Array;
}
```

この形なら、現在の `pack.cells.h`、`state`、`pop` のような並列 TypedArray の良さを維持できます。大規模マップでの走査や WebGL との相性もよいです。

移行期はこうするのが現実的です。

```text
world.pack
 ├─ topology       ← Voronoi または Hex の幾何・隣接
 ├─ cells          ← 共通の属性列。既存コードの互換窓口
 ├─ burgs / states / provinces / routes
 └─ features / rivers / markers
```

既存コードはしばらく `pack.cells.c`、`pack.cells.p` を使えるよう、Hex トポロジーを互換アダプタとして公開します。これなら `window.fmg.world.pack` を壊さず、レンダラ・経済拡張・セーブ形式を段階的に移せます。

## 海路には「セル」より「辺」の状態が必要

ヘックス化するなら、海路問題の本質である「どこを横切れるか」はセル属性ではなく、辺の属性として持つべきです。

```text
hex A ── 海上通行可 ── hex B
hex A ── 岬・浅瀬・氷で不可 ── hex C
hex A ── 港の航路入口 ── hex D
```

例えば `seaPassable[cellId * 6 + direction]` を持ち、海上 A* はこの辺だけを通るようにします。描画も、

```text
セル中心 → 共有辺の中点 → 隣接セル中心
```

を経由させれば、航路が陸地を切ることを構造的に防げます。港は「港のある陸 Hex」そのものではなく、隣接する特定の海 Hex／海側の辺を入口として持たせるのが安全です。

## 全面 Hex 化の難点

現行 `pack` は Voronoi 頂点 `cells.v`・`vertices` を使って河川、海岸線、面積、編集、SVG 多角形を扱っています。Hex 化すると、特に以下が作り直しになります。

- 海岸線と島の自然な輪郭
- 河川の蛇行・合流・流域
- 高さ編集とリサンプル
- 州境・国境の滑らかな表示
- 既存セーブデータの読み込み
- `pack.cells.c` を前提にした生成器・エディタ群

そのため、最初から地形・描画・シミュレーションの全てを Hex にするのは大規模です。

## おすすめの段階案

1. 現行 Voronoi の海路バグを、経路セルか描画曲線かに分けて修正する  
   海路は曲線をやめるだけで直る可能性があります。

2. Hex を「政治・開拓・経済シミュレーション専用グリッド」として試作する  
   地形表示・海岸線・河川は現行 Voronoi を維持し、Hex は人口、領有、道路、開拓、災害だけを担当します。

3. Voronoi → Hex の対応表を持つ  
   `voronoiCell → hexCell`、`hexCell → voronoiCells[]` を作り、地形・降水・気温は Hex 側へ集約して使います。

4. 開拓・国家拡張が十分に機能してから、必要なら Hex を主格子へ昇格させる  
   その時点で初めて、`pack.cells` のトポロジーを Hex 実装に差し替える判断をします。

私の感覚では、国家の成長シミュレーションを主目的にするなら「Hex を内部の政治・社会格子として先に導入し、地形の見た目は Voronoi のまま」という二層方式が最も安全です。地図としての自然さを守りながら、開拓・領有・災害のルールだけを盤面ゲームのように明快にできます。

## Q1-A1レビュー

`A. route.cells に陸地セルが混入している`は解決済みで、残る選択肢はBのみ。
