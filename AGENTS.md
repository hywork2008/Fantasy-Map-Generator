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

FMG・RE・CEにおいて、河川を通過する橋は河川の進行方向と直角に交差させることを基本とし、最短距離で通過させる。
直角からのずれ（橋軸と河川法線のなす角）は10°以内を推奨し、時代と技術で決まる上限を超える橋は絶対に描いてはならない。
上限は古代・中世で石造15°・木造20°、近世で25°、斜めアーチ以降で30°。地図生成オプションのHistorical periodを開始時の下限とし、国家の技術習得で引き上がる。
川と平行に近い橋、川の上で折れ曲がる橋はどの時代でも禁止。上限を守れない地点には橋を架けず、道を曲げて直角に入るか別の地点・渡し船とする。
基準値と判定は src/utils/bridgeSkewPolicy.ts に一本化する（根拠: docs/plan/bridge-skew-policy.md）。
