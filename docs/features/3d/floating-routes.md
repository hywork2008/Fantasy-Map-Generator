# Floating Routes

git hash `34fe82dfebcf780398156260567c8e0124a1dcfd` で追加。
viewMeshの3D地図でroutesが浮いた状態で表示される。

## Nightscape

Nightscape 中は **Show glowing routes** を有効にすると、浮遊ルートを Burg Icon の都市灯りと同時に表示できる。通常の浮遊ルートとは別に、細い発光芯と加算合成の淡いハローを重ねるため、WebGL 実装ごとの線幅制限に影響されず暗い背景で視認できる。

- 初期値はオフ。Nightscape を都市灯りだけの表示として使う既存の演出を維持する
- 元の道路・小道・海路の色と破線パターンを引き継ぐ
- `toggleRoutes` レイヤーが有効な場合だけ描画する
