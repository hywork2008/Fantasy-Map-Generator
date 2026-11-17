# セル内の起伏

| 項目 | 内容 |
| :--- | :--- |
| Status | 設計のみ（2026-11-17）。コードは変えない |
| Parent | なし |
| Related | [`war-campaign-mesh.md`](./war-campaign-mesh.md)、[`earth-geography-heightmaps.md`](./earth-geography-heightmaps.md)、[`land-route-elevation-cost.md`](./land-route-elevation-cost.md)、[`route-grade-movement.md`](./route-grade-movement.md)、[`ce-terrain-grading-layer.md`](./ce-terrain-grading-layer.md)、[`unite-data-and-map.md`](./unite-data-and-map.md) |
| Scope | 1セル（既定の地球スケールで約39km）の面の内側に、平地と山地の境のような起伏を持たせ、拡大した3Dと Region Editor で見えるようにする。シミュの排水標高 `cells.h` は変えない |

---

## 0. 結論

GeoJSON を地図の本体にはしない。排水標高は今の `cells.h` のまま、平地と山の境はセルをまたぐ少数の地形レコードとして持つ。近づいたときだけ、そのレコードをメートルの高さ関数 `sample()` で評価する。

既定の地球スケール（`mapSize` 12.9、点数4）ではハイトマップ格子の間隔が約39kmである（[`war-campaign-mesh.md`](./war-campaign-mesh.md)）。世界3Dの1頂点はその格子の1点で、`grid.cells.h` を読む（`ThreeDRenderer.getMeshHeight`）。面の内側は双線形であり、関東の低地と山地のような段は、頂点を増やしても入力が同じなら現れない。

セル内に足せるのは、隣り合う頂点がすでに持っている高低の間の立ち上がり方と、面の縁でゼロに戻る細かい起伏である。頂点そのものの標高は動かさない。1500mの独立峰を、四隅がすべて低地の面の中央に置くことは、この設計の範囲外である。その峰は格子の頂点を一つ要する。

## 1. いまの高さ

| 場所 | 何を読んでいるか |
| :--- | :--- |
| シミュ、河川、バイオーム、経路 | セルあたりの `h`（0–100）。メートルは `heightToMeters`（`h < 20` は 0、それ以外は `(h - 18) ** heightExponent`、既定指数 1.8） |
| 世界3D | 格子頂点ごとに `getMeshHeight`。細分割は中点を足すだけで、新しい尾根は足さない |
| 浸食ベイク | セル高さのテクスチャを双線形する。分割数を上げても段は増えない |
| キャンペーンメッシュ | 同じ双線形を `max(格子間隔/4, 2km)` で取り直す（`CAMPAIGN_MIN_STEP_KM`）。設計上、格子の間の尾根は作らない |
| Burg descriptor | 17×17（`HEIGHTFIELD_SIZE`）。各点は `findCell` したパックセルの `h`。窓が1セル内なら全点同じ標高 |
| Region Editor | `generateHeightfieldFromCells` がセル中心を逆距離加重する。間隔は 12 unit、既定 `metersPerUnit` 100 で約1.2km、辺は最大160。入力が40kmおきなので、結果は隣セルへの坂 |

`sampleEdgeGrade` と `landRouteSlopeModifier` は、隣セルまでの落差をその距離（約39km）で割る。面の内側が崖でも、経路には緩斜面に見える。

実在DEMのカタログ（[`earth-geography-heightmaps.md`](./earth-geography-heightmaps.md)）はセル中心へ落とした時点で、セル内の段を捨てる。本設計はそのローダを変えない。近景用に元のDEMを残す話は、そちらの後続である。

## 2. 高さの役割

二つの面を分ける。

**排水面**は今の `cells.h` である。河川、気候、バイオーム、経路、引いた世界3D、キャンペーンメッシュはこれを読み続ける。平地と山地が隣り合うときは、低い頂点が低地の出口、高い頂点が山地側の出口である。平均して一つの `h` にすると、両方消える。

**面の内側**は `sample(x, y)` である。地図ピクセルを受け、メートルを返す。遠いメッシュの頂点では、今の双線形（その頂点の `heightToMeters`）と一致する。面の内側では、山麓線の幅だけ立ち上がりを急にし、種から尾根を足す。尾根は格子頂点と、細分化するパッチの縁でゼロになる。

```text
cells.h                  排水面。頂点の標高。シミュと遠い3D
landforms[]              山麓線。セル境界で切らない
sample(x, y) → meters    面の内側。近い3DとREが呼ぶ
```

垂直スケールは世界メッシュと同じにする。指数100のメートル `heightToMeters(100)` が3Dスライダの `scale` に対応する（`meshHeightFromIndex`）。`sample()` のメートルを、そのままワールドYにしない。

## 3. 山麓線

初版の種類は `rangeFront` だけにする。扇状地や別の尾根グラフは、このレコードが固まってから種類を増やす。

地図ピクセルの折れ線を、セルごとにコピーしない。一本の線が複数セルを横切る。

```ts
interface RangeFront {
  id: number;
  kind: "rangeFront";
  /** Map pixels. Not split at cell borders. */
  polyline: [number, number][];
  /** Side that rises, relative to travel from the first vertex to the last. */
  mountainSide: "left" | "right";
  /** Meters added on the mountain side, outside the transition, before roughness. */
  reliefMeters: number;
  /** Transition width in meters. A fault scarp is narrow. A piedmont is wide. */
  widthMeters: number;
  roughnessSeed: string;
}
```

評価は次の順にする。

1. 底面は、今の格子の双線形メートルである。
2. 折れ線からの符号付き距離が `widthMeters` より山側なら、底面に `reliefMeters` を足す方向へ底面を寄せる。ただし寄せた結果が、その面の四つの格子頂点の双線形から外れないこと。頂点は固定なので、`reliefMeters` は「この面の高い頂点と低い頂点の差を、39kmの坂ではなく `widthMeters` の中に集める」量である。頂点間の差を超える分は捨てる。
3. 距離が幅の中なら、その幅で立ち上がる。幅の外の平野側は底面のまま。
4. 粗さは種から決め、振幅は `reliefMeters` の15%以下。格子頂点とパッチ縁では 0。
5. `h < 20` の水面は 0m のまま。山麓線は海を持ち上げない。
6. 山側の結果が `heightToMeters(100)` を超える分は切る。世界メッシュの頂上より高くしない。
7. 折れ線が河川セル（`cells.r`）を横切るところでは、川の廊下だけ底面の排水標高へ戻す。川を崖の上に掛けない。

関東の低地と山地の境は、低い頂点と高い頂点の間の面に折れ線を置く。比高1200m、幅8kmなら、39kmにわたる坂が、幅8kmの山麓になる。四隅がすべて低地のセル一つに、この比高は入らない。

保存はレコードの配列だけにする。500m格子を全世界に焼くと、1セル80×80、約1万セルで数百MBになる。カメラの近くと、開いている地域図だけをその場で評価する。

## 4. GeoJSON

GeoJSON は山麓線の交換に使う。ランタイムの高さも、`cells.h` の代わりも、GeoJSON にはしない。密な更新とセル隣接は Typed Array 側である（[`unite-data-and-map.md`](./unite-data-and-map.md)）。

交換する Feature は `LineString` 一つと、次のプロパティである。

| プロパティ | 内容 |
| :--- | :--- |
| `kind` | `"rangeFront"` |
| `mountainSide` | `"left"` または `"right"` |
| `reliefMeters` | 数 |
| `widthMeters` | 数 |
| `roughnessSeed` | 文字列 |

座標は地図ピクセル。読み込んだら `RangeFront` の配列へ入れる。セル高さへは焼かない。書き出しは同じ Feature の `FeatureCollection` で足りる。

## 5. どの画面に出すか

| 画面 | 出し方 |
| :--- | :--- |
| 世界3D（引いた表示） | 今の格子メッシュ。頂点は `cells.h` |
| キャンペーンメッシュ | 変えない。双線形のまま。本設計の尾根は出さない |
| 近い3D | 視錐の中だけ 250–500m で `sample()` する。パッチの縁は双線形と一致させる。キャンペーン窓の実装には足さない |
| Region Editor | 山麓線がある地域では、`generateHeightfieldFromCells` の内側を `sample()` に替える。線が無い地域は今の逆距離加重のまま。約1.2km格子で山麓の段は見える。それより細かい尾根は近い3D側 |
| City Editor | 都市の窓を横切る評価だけを、burg descriptor の 17×17 のマクロ制約として渡す。40kmの山並みを建物セルには入れない。連続する高さ場と、建物のあるセルを平らにする elevation preset は同時に選ばない（[`ce-terrain-grading-layer.md`](./ce-terrain-grading-layer.md) §7.18） |

近い3Dの入り方（カメラ高度のしきい値、操作）は、`sample()` と縁の一致がテストできてから決める。

## 6. 経路

初版は `getLandPathCost` も `sampleEdgeGrade` も変えない。見た目が崖でも、経路は隣セル間の緩斜面のままである。

後続で経路を変えるときは、折れ線を横切る辺に、`reliefMeters / widthMeters` から出した勾配パーセントを足す。定義は `sampleEdgeGrade` に揃える。峠しか無い接続を `Infinity` で封じない（[`land-route-elevation-cost.md`](./land-route-elevation-cost.md) の決定）。川の廊下と同じく、折れ線に鞍部を開けて道を通す。

## 7. 実装順

コードは未着手。順は次のとおり。

1. `RangeFront` と `sample()`。テストは、格子頂点で双線形と一致すること、パッチ縁が問い合わせセルに依らないこと、水面が 0 のままであること、`heightToMeters(100)` で頭打ちになること、粗さが頂点で 0 かつ振幅上限内であること、河川廊下が底面へ戻ること。
2. Region Editor の高さ場。山麓線があるときだけ `sample()` を使う。
3. 近い3Dの視錐メッシュ。キャンペーンメッシュとは別の入り方。
4. Burg descriptor の 17×17 を、窓内の `sample()` に替える。
5. 折れ線を横切る陸路の勾配。`Infinity` にはしない。

## 8. やらないこと

- 全世界のセルを1kmにして、セル数で起伏を足さない。間隔を40分の1にするとセル数は約1600倍になり、河川と経路の単位が変わる。
- 面の内側の高さを `cells.h` へ平均して書き戻さない。
- キャンペーンメッシュに尾根を足さない。`CAMPAIGN_MIN_STEP_KM` と「格子の間の尾根は作らない」は維持する。
- 世界3Dの Loop 細分割や、浸食ベイクの分割数だけで山麓が出るとは扱わない。
- 四隅が低地の面の中央に、頂点標高を超える独立峰を置かない。
- 実在DEMローダ（`fromPrecreated` とセル中心サンプル）を、この設計の実装で変えない。
- CEの約50mセルへ、40kmの山並みを建物の地盤として展開しない。
- 標高の配列を GeoJSON に入れない。

## 9. 次の作業

実装に入るときは §7 の1から始める。`sample()` と頂点一致のテストが通るまで、レンダラと経路には触れない。
