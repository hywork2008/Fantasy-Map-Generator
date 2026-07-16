# 同様の問題を持つ他候補の調査結果

circle(頂点)ドラッグで編集する機能を一通り確認しました:

ファイル	状態

religions-editor.ts / cultures-editor.ts (中心点ドラッグ)	既に対応済み — debounceで全体再描画している元ネタ実装
routes-editor.ts / rivers-editor.ts (制御点ドラッグ)	対象外 — land fillに影響しないため問題なし
labels-editor.ts (ラベル曲線の制御点)	対象外 — 同上
regiment-editor.ts (回転ハンドル) / ice-editor.ts (氷山アイコン移動)	対象外 — 同上
states-editor.ts / provinces-editor.ts / zones-editor.ts / biomes-editor.ts のブラシ系	対象外 — "end"ハンドラ自体が無く、ドラッグ中に直接SVGへ塗っているため既に生きた更新

次の修正候補: src/controllers/heightmapBrushes.ts:51 — ブラシ(circleそのものではなくブラシ範囲)による高さ変更で、changeHeightForSelection はドラッグ中に毎回呼ばれてグリッドの高さデータは更新されますが、実際の地形(heightmap)の見た目の再描画 localCallbacks.updateHeightmap() は .on("end", ...) でのみ呼ばれています(103, 136, 296, 322, 329, 336, 356行目にも同名呼び出しあり)。circleそのものではなくブラシ半径での塗り込みですが、「ドラッグ中は反映されず、離した瞬間にまとめて反映される」という点で今回と全く同じ構造の問題です。修正するなら同じdebounceパターンが適用できます。
