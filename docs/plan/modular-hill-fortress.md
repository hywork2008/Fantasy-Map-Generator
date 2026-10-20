# 丘上の組み立て式城塞

- 日付: 2026-10-20
- 状態: Implemented（概形）

## 対象と描く時期

クラック・デ・シュヴァリエを原型とする、セル標高に接地した CE の城塞を実装する。
`building-record.md` の測量寸法による第1弾カタログとは別の、明示選択する概形モデルである。
城全体の測量復元や、セル辺を実物の平面に見立てることはしない。

- `hospitalier-1270`: 1270年頃の聖ヨハネ騎士団期を原型にする。
- `mamluk-1302`: 1285年のカラーウーンの方形塔と、14世紀初頭の入口改修を含む姿を原型にする。

内郭の平面・高さ・階段位置は概略である。大広間の公表寸法 27 × 7.5 m 以外は測量値として扱わない。
階は立体外形の水平断面であり、実際の全階・全室を復元したものではない。

## パーツと正本

| パーツ | 正本・配置 |
| --- | --- |
| 内郭の囲壁・建物群・南側三塔・礼拝堂・広間 | `src/buildings/catalogue/krak-inner-ward.json`。中庭を開け、相対配置を固定した一つの配置単位 |
| 内郭の造成面・石造斜面 | `src/buildings/fortresses/krak.ts` の上下輪郭から生成。東側に入口を空ける |
| 外郭の壁・壁上通路 | CE の城郭回路のセル辺列から生成。門幅を除き、短い水平な通路区間と地形に接する下部を組み合わせる |
| 円形塔・半円形張出塔 | 寸法と形式を共有する生成部品。鋭い曲がり角と辺の途中に、塔同士・門との間隔を確認して配置 |
| 門 | 既存の城門位置・開口幅を使い、門柱と上部を生成。通常の門塔を重ねない |
| 登城路 | 外郭門から内郭入口までの高低差を接続する石造の斜路。改修後は側壁と屋根を追加 |
| 厩舎・貯水池 | 南側の郭間に空間がある場合に配置。敷地外・内郭の石造斜面と重なる場合は省く |
| カラーウーン塔 | 改修後だけ南側外郭に配置。平面の比率には公表された約 17 × 20 m を使い、高さは概略 |

内郭 JSON と SVG は `node --import tsx scripts/build-krak-model.ts` で再生成する。
記録の検証・hash・SVG・押し出しには既存の BuildingRecord の経路を使う。
城塞の組み立ては `src/city3d/core/fortressMassing.ts` を CE / BV で共有する。
3D メッシュは既存の `createStructureMassing` に渡し、第二の描画器は作らない。

## CE の配置と保存

城または城郭セルを選び、検査欄の「城塞モデル」から時期を選択する。
都市文書には `CastlePlan.fortress = { modelId, phase }` だけを追加し、形式の version は変更しない。
派生した塔・壁・メッシュは保存しない。未知の model / phase は読み込み時に拒否する。
城のロック中はモデル・標高を変更できない。

内郭は実寸の一様スケール `[0.75, 1.35]` の範囲で、1以下の入る値のうち最大の値を使う。
回路を12 m縮めた凸核を使い、石造斜面までその中に収める。
東向きの内郭入口を既存の主門方向へ回転させる。非一様変形はしない。
敷地が狭い場合は選択肢を無効にして理由を表示する。
後の地形編集で平面が収まらなくなった場合は、既存の城描画へ戻す。

城塞が描ける回路について、通常の城内パーツ・外郭壁・隅塔・間隔塔・門の描画を2D/3Dとも抑制する。
描画不能な場合はこれらを抑制しない。堀・街の城壁・道路の文書データは維持する。

## セル標高と接地

CE の既存の `FaceProperties.elevation` を使用する。最も低い陸セルを都市の3D基準高にする。
セル間で共有する頂点には隣接陸セルの平均標高を与え、セル中心にはそのセルの標高を与える。
中心と辺の三角形から連続する丘を描く。中心から見通せない凹セルは通常の分割を使う。
全陸セルが同じ高さの場合は、従来通り平坦な地面になる。

内郭の造成面は足元の地形より上の共通高さにする。各建物は鉛直、床は水平のままにする。
石造斜面の下端と外郭壁の下端を地形へ接地させる。
壁の上端は短区間ごとに水平にし、区間間の高低差は段差として扱う。
一般の建物にも水平な接地面と基壇を付け、道路も地形標高へ持ち上げる。
地形・モデル・時期が変わったら、建物ファブリックが再利用されても3Dを更新する。

`StructureMassing.sections` は、対応する頂点を持つ輪郭と各頂点の高さから閉じた塊を作る。
石造斜面・地形に接する壁・斜路・覆道がこの経路を使う。

## BV と確認用サンプル

BV の `Fortress assemblies` に両時期の城塞全体を表示する。
`Download editable CE hill study` から、標高を設定した編集可能な CE JSON を保存できる。
CE では通常の読み込みボタンで開き、2D/3D、時期、セル標高を確認する。
内郭単体は通常の BuildingRecord 一覧でも閲覧できる。

## 出典

- [フランス文化省：最初の騎士団期の城](https://archeologie.culture.gouv.fr/crac-chevaliers/en/first-hospitaller-castle-12th-century)
- [13世紀の防備強化](https://archeologie.culture.gouv.fr/crac-chevaliers/en/strengthening-fortifications-13th-century)
- [最終建設段階](https://archeologie.culture.gouv.fr/crac-chevaliers/en/final-construction-phase)
- [大広間](https://archeologie.culture.gouv.fr/crac-chevaliers/en/great-gothic-hall)
- [カラーウーン塔](https://archeologie.culture.gouv.fr/crac-chevaliers/en/sultan-qalawuns-tower)
- [入口の改修](https://archeologie.culture.gouv.fr/crac-chevaliers/en/redesign-entrance-system)
