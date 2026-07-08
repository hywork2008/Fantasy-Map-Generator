# Danger / bugs & specs

## 跡地

[danger-layer.md](file;file:///Users/h-yamaguchi/Projects/Fantasy-Map-Generator/docs/plan/danger-layer.md) 現在モンスターによる人口ゼロのセルは国家が無所属になってしまう。元々は設定されていたと思うが、モンスターによって滅んでも国家の領土としては維持したい。

人口ゼロで近くに災厄級のモンスターがいる近くを元々あったroutesが維持されているので、これも災害地域を避けるように再描画あるいは消滅させたい。
陸路も海路も。

描画の順番を調査し
docs/map-initialization-process.md
を更新して下さい。
dangersレイヤーとpopulationsレイヤーはcellsレイヤーより下に移動させています。

## 相談

相談です。コード編集はしないで下さい。
