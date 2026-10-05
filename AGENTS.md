# 規約

## 本プロジェクトの構成

FMG / Fantasy Map Generator
src
src/app.ts起点

RE / Region Editor
src/region-editor
FMGのProvince相当の地図を描く

CE / City Editor
src/city-editor
FMGのBurg相当の地図を描く

DE / Dungeon Editor
src/dungeon-editor

CG / City Generator
src/city-generator
※廃止予定なのでCGのソースコードは見る必要も編集する必要も無い。

## 操作

FMGの都市の上や都市ラベルの上でマウスの右クリックをする事でCEを開くメニューがあり、Burg Editorを開かなくても、すぐにCEにアクセス出来る。
REにアクセスする為のメニューも同様に、Edit Provinceダイアログを経由しなくてもアクセスが可能。

## 原則

FMGとCEにおいて、河川を通過する橋は河川の進行方向と直角に交差させ、最短距離で通過させる。
直角に交差しない橋は絶対に描いてはならない。
