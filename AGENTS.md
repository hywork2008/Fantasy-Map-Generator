# 規約

## 本プロジェクトの構成

FMG / Fantasy Map Generator
src
src/app.ts起点

CE / City Editor
src/city-editor

DE / Dungeon Editor
src/dungeon-editor

CG / City Generator
src/city-generator
※廃止予定なのでCGのソースコードは見る必要も編集する必要も無い。

## 原則

FMGとCEにおいて、河川を通過する橋は河川の進行方向と直角に交差させ、最短距離で通過させる。
直角に交差しない橋は絶対に描いてはならない。
