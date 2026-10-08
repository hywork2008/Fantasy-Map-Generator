# CEの固定地図枠

CEの表示・SVG出力は `document.frame.extentMeters` を一辺とする原点中心の正方形を地図枠とする。カメラの `viewBox` はこの枠とは独立し、パン・ズームで枠外が見えても地形を推測して埋めない。

- `renderEditorSvg` の `.ce-map-scene` に全地図レイヤーと地面用の `.ce-background` を置き、`userSpaceOnUse` の共通 `clipPath` で切り抜く。
- SVG全体にはバイオーム背景色を設定しない。枠外はキャンバスの余白となり、出力では透明となる。
- FMGから来た水域や道路の元座標は切り捨てない。枠を超える形状・線幅・樹冠は描画時に切り抜く。クリップは水域レイヤーの南北反転より外側に置く。
- 編集時に追加するプレビューや強調表示も `.ce-map-scene` に置く。
- 単体SVGも同じ描画処理と地面矩形を使う。

水域の `coverageBounds` は地図枠全体を含まなければならない。生成時の既存検査に加え、描画時もschema 3・4の両方を検査する。クリップは枠内の収録不足を補うものではない。範囲拡張を実装する際は、FMGから新しい枠を覆うデータを取得してから枠を広げる必要がある。

回帰テスト: `src/city-editor/render/mapFrame.test.ts`。カメラ変更、編集モード、枠を大きく超える水域、単体SVG、収録範囲不足を確認する。

## 表示枠は町メッシュ＋余白に絞る

FMGの窓（最小1500m）は町メッシュの2〜3倍あり、外側の大半は街道・河川・海・橋の取り合い以外に要らない領域だった。広い窓の地形を推測して埋めるより、描く範囲を絞る。

- 広域ハンドオフ（`regionalContext` あり）の表示枠は `regionalDisplayExtent`（`io/incomingCity.ts`）で決める。町メッシュ幅×1.3と、`requiredBounds`（橋・河岸の必須範囲）＋両側80mの大きい方を10m単位に切り上げる。元の窓より小さい場合だけ縮める。
- 町の窓が既にメッシュと同じ大きい都市は変わらない。FMGのデータは切り捨てず、描画の `clipPath` が枠で切る。
- 枠が小さくなるので、街道が町に接続する角度、河川・海がメッシュと重なる様子、橋の角度が一画面で読める。

## メッシュと枠の間の海

メッシュと枠の間の帯（約0.15×メッシュ幅）では、海が途切れて草原に戻らないようにする。FMGが渡す海岸線（`waterbody.shoreline`）は元の窓を覆っているので、これを使う。メッシュ外周から直線で延ばす推測方式は採らない。

- つなぎ元は町メッシュの海セルと陸セルの境界（`meshShoreChain`、メッシュ外周から外周まで）。歩いた海岸線は川口などで端が外周から離れ、段差になるため使わない。
- `regionalShoreline` が、この境界から約160mかけてFMGの線へ滑らかに寄せ、枠までは町の海岸線で実測した凹凸と同程度のノイズを乗せる。FMGの粗い海岸線が直線でも直線にならない。ノイズはシード固定。
- FMGの線は元の窓で切られているので、`clipPolylineToFrame` で新しい枠に切り直し、`regionalSeaPolygon` が枠で閉じる。海側はメッシュ内の海セルの重心で決める。
- 閉じた多角形は `CityDocument.regionalWaterAreas` に保存する（ocean のみ。湖は対象外）。`regionalCoastalWaterPolygons` はこれから町メッシュ外周を引いた領域を返し、水域判定（樹木・道路・建物・水車の除外）と描画（`.ce-regional-coastal-water`）で使う。
- `regionalWaterAreas` が無い既存の保存データには郊外の海が無い。再生成で付く。

回帰テスト: `src/city-editor/core/regionalCoast.test.ts`、`src/city-editor/render/mapFrame.test.ts`。
