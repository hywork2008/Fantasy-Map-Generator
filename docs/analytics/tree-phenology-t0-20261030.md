# T0 樹木の季節の姿：3地点の12か月表

作成日：2026-10-30。設計は [BV樹木の季節の姿と結実層の設計](../plan/bv-tree-seasonal-appearance.md) §5・§9。

## 入力と再現

- 実装：`src/buildings/landscape/treePhenology.ts`（32樹種のプロファイル、`resolveTreeAppearanceYear`／`resolveTreeAppearance`）。
- 再現：`npx tsx scripts/treePhenologyTable.mts`。下表はその出力そのもの。
- 気温は固定入力の代表値（概数）。temperate50N はフランクフルト付近、mediterranean38N はアテネ付近、tropical4N はドゥアラ付近の月平均気温。FMGのセルの実測ではない。
- 作物暦の列は経済拡張の `getSeasonalCropPlan` が同じ気温で返す収穫月（1始まり）。`none` は収穫なし、`-` は作物を持たない樹種。

略号：B＝bare、F＝bloom、L＝leaf、U＝unripe、R＝fruit、H＝harvested、A＝autumn。`*` は秋の配色。

## 所見

1. **落葉の判定は絶対温度だけでは成り立たない。** 設計時の案（展葉・落葉の絶対温度）では、冬の月平均が10°Cあるアテネで落葉樹が冬も葉を保つ。年較差の中の位置（寒い月0〜暑い月1）と絶対温度の下限を組み合わせる方式に変えた。温帯は11月〜3月、地中海は12月〜3月が落葉、熱帯（最寒月13°C以上）は通年葉。
2. **経済の作物暦の収穫月は、全月が生育可能な気候で季節と合わない。** 地中海では全果樹の収穫が5〜6月、熱帯でも同じ時期になる。`getSeasonalCropPlan` が最長の生育期を1月から始めるため。オリーブの5〜6月収穫やリンゴの冬の開花は描けないので、**気温の季節がある気候（年較差5°C以上）では、収穫の時期は樹種ごとの気温の目印（秋の始まり・最暖月・最寒月）から決め、作物暦からは収穫の長さだけを使う**。季節のない熱帯では作物暦に従う。経済の作物暦は本作業で変更していない（後続課題）。
3. 葉だけの姿を持たないヨーロッパグリ・ナツメヤシでは、春の葉の時期が `harvested` と表示される。葉あり・実なしで形は同じなので、姿を増やさずこのまま使う。
4. 熱帯（季節の判定ができない気候）では、ギョリュウは通年 `bloom`、ナナカマドは通年 `fruit`（既定の姿）になる。どちらも熱帯のバイオームには置かれない。
5. 寒くて栽培できない地点（温帯のレモン・ナツメヤシなど）でも姿は計算される。そこに植えるかどうかは配置側で決める。

## 表


### temperate50N

| species | crop harvest | J | F | M | A | M | J | J | A | S | O | N | D |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| arabica_coffee | none | R | R | R | R | R | R | R | R | R | R | R | R |
| cacao | none | R | R | R | R | R | R | R | R | R | R | R | R |
| sweet_chestnut | 8,9 | B | B | B | H | H | H | F | U | U | R* | B | B |
| lemon | 6,7,8 | R | R | H | H | H | U | U | U | U | U | U | R |
| common_fig | 6,7,8 | B | B | B | L | L | L | L | R | R | R* | B | B |
| european_plum | 8,9 | B | B | B | F | L | L | L | R | R | H* | B | B |
| european_pear | 8,9 | B | B | B | F | L | L | L | R | R | H* | B | B |
| domestic_apple | 8,9 | B | B | B | F | L | L | L | L | R | R* | B | B |
| scots_pine | - | L | L | L | L | L | L | L | L | L | L | L | L |
| european_hornbeam | - | B | B | B | L | L | L | L | L | L | A* | B | B |
| pedunculate_oak | - | B | B | B | L | L | L | L | L | L | A* | B | B |
| european_beech | - | B | B | B | L | L | L | L | L | L | A* | B | B |
| garden_parkland | - | B | B | B | L | L | L | L | L | L | A* | B | B |
| norway_spruce | - | L | L | L | L | L | L | L | L | L | L | L | L |
| silver_birch | - | B | B | B | L | L | L | L | L | L | A* | B | B |
| sacred_yew | - | L | L | L | L | L | L | L | L | L | L | L | L |
| date_palm | 7,8,9 | H | H | F | U | U | U | U | R | R | R | H | H |
| umbrella_thorn | - | L | L | L | L | L | L | L | L | L | L | L | L |
| saxaul | - | L | L | L | L | L | L | L | L | L | L | L | L |
| kapok | - | L | L | L | L | L | L | L | L | L | L | L | L |
| western_red_cedar | - | L | L | L | L | L | L | L | L | L | L | L | L |
| black_alder | - | B | B | B | L | L | L | L | L | L | L | B | B |
| olive | 6,7,8 | R | L | L | L | L | L | L | U | U | U | R | R |
| silver_fir | - | L | L | L | L | L | L | L | L | L | L | L | L |
| red_mangrove | - | L | L | L | L | L | L | L | L | L | L | L | L |
| tamarisk | - | B | B | B | L | L | F | F | F | L | L | B | B |
| rowan | - | B | B | B | L | F | L | L | L | R | A* | B | B |
| canary_pine | - | L | L | L | L | L | L | L | L | L | L | L | L |
| mediterranean_cypress | - | L | L | L | L | L | L | L | L | L | L | L | L |
| oriental_evergreen | - | L | L | L | L | L | L | L | L | L | L | L | L |
| sacred_bodhi_and_fig | - | L | L | L | L | L | L | L | L | L | L | L | L |
| peaceful_willow | - | B | B | B | L | L | L | L | L | L | A* | B | B |

### mediterranean38N

| species | crop harvest | J | F | M | A | M | J | J | A | S | O | N | D |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| arabica_coffee | 6,7,8,9 | U | U | U | U | U | R | R | R | R | F | U | U |
| cacao | 6,7,8,9 | H | H | H | H | H | R | R | R | R | H | H | H |
| sweet_chestnut | 5,6 | B | B | B | H | H | H | F | U | U | R* | R* | B |
| lemon | 5,6 | R | H | H | H | H | U | U | U | U | U | U | R |
| common_fig | 5,6 | B | B | B | L | L | L | L | R | R | H* | H* | B |
| european_plum | 5,6 | B | B | B | F | L | L | L | R | R | H* | H* | B |
| european_pear | 5,6 | B | B | B | F | L | L | L | R | R | H* | H* | B |
| domestic_apple | 5,6 | B | B | B | F | L | L | L | L | R | R* | H* | B |
| scots_pine | - | L | L | L | L | L | L | L | L | L | L | L | L |
| european_hornbeam | - | B | B | B | L | L | L | L | L | L | A* | A* | B |
| pedunculate_oak | - | B | B | B | L | L | L | L | L | L | A* | A* | B |
| european_beech | - | B | B | B | L | L | L | L | L | L | A* | A* | B |
| garden_parkland | - | B | B | B | L | L | L | L | L | L | A* | A* | B |
| norway_spruce | - | L | L | L | L | L | L | L | L | L | L | L | L |
| silver_birch | - | B | B | B | L | L | L | L | L | L | A* | A* | B |
| sacred_yew | - | L | L | L | L | L | L | L | L | L | L | L | L |
| date_palm | 5,6 | H | H | F | U | U | U | U | R | R | H | H | H |
| umbrella_thorn | - | L | L | L | L | L | L | L | L | L | L | L | L |
| saxaul | - | L | L | L | L | L | L | L | L | L | L | L | L |
| kapok | - | L | L | L | L | L | L | L | L | L | L | L | L |
| western_red_cedar | - | L | L | L | L | L | L | L | L | L | L | L | L |
| black_alder | - | B | B | B | L | L | L | L | L | L | L | L | B |
| olive | 5,6 | L | L | L | L | L | L | L | U | U | U | R | R |
| silver_fir | - | L | L | L | L | L | L | L | L | L | L | L | L |
| red_mangrove | - | L | L | L | L | L | L | L | L | L | L | L | L |
| tamarisk | - | B | B | B | L | L | F | F | F | L | L | L | B |
| rowan | - | B | B | B | L | F | L | L | L | R | A* | A* | B |
| canary_pine | - | L | L | L | L | L | L | L | L | L | L | L | L |
| mediterranean_cypress | - | L | L | L | L | L | L | L | L | L | L | L | L |
| oriental_evergreen | - | L | L | L | L | L | L | L | L | L | L | L | L |
| sacred_bodhi_and_fig | - | L | L | L | L | L | L | L | L | L | L | L | L |
| peaceful_willow | - | B | B | B | L | L | L | L | L | L | A* | A* | B |

### tropical4N

| species | crop harvest | J | F | M | A | M | J | J | A | S | O | N | D |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| arabica_coffee | 4,5,6 | U | U | U | R | R | R | H | F | U | U | U | U |
| cacao | 4,5,6 | H | H | H | R | R | R | H | H | H | H | H | H |
| sweet_chestnut | 5,6 | H | F | U | U | R | R | H | H | H | H | H | H |
| lemon | 5,6 | U | U | U | U | R | R | H | H | H | H | U | U |
| common_fig | 5,6 | L | L | L | L | R | R | H | H | H | H | H | H |
| european_plum | 5,6 | F | L | L | L | R | R | H | H | H | H | H | H |
| european_pear | 5,6 | F | L | L | L | R | R | H | H | H | H | H | H |
| domestic_apple | 5,6 | L | L | L | L | R | R | H | H | H | H | H | F |
| scots_pine | - | L | L | L | L | L | L | L | L | L | L | L | L |
| european_hornbeam | - | L | L | L | L | L | L | L | L | L | L | L | L |
| pedunculate_oak | - | L | L | L | L | L | L | L | L | L | L | L | L |
| european_beech | - | L | L | L | L | L | L | L | L | L | L | L | L |
| garden_parkland | - | L | L | L | L | L | L | L | L | L | L | L | L |
| norway_spruce | - | L | L | L | L | L | L | L | L | L | L | L | L |
| silver_birch | - | L | L | L | L | L | L | L | L | L | L | L | L |
| sacred_yew | - | L | L | L | L | L | L | L | L | L | L | L | L |
| date_palm | 5,6 | U | U | U | U | R | R | H | H | H | H | H | F |
| umbrella_thorn | - | L | L | L | L | L | L | L | L | L | L | L | L |
| saxaul | - | L | L | L | L | L | L | L | L | L | L | L | L |
| kapok | - | L | L | L | L | L | L | L | L | L | L | L | L |
| western_red_cedar | - | L | L | L | L | L | L | L | L | L | L | L | L |
| black_alder | - | L | L | L | L | L | L | L | L | L | L | L | L |
| olive | 5,6 | L | U | U | U | R | R | L | L | L | L | L | L |
| silver_fir | - | L | L | L | L | L | L | L | L | L | L | L | L |
| red_mangrove | - | L | L | L | L | L | L | L | L | L | L | L | L |
| tamarisk | - | F | F | F | F | F | F | F | F | F | F | F | F |
| rowan | - | R | R | R | R | R | R | R | R | R | R | R | R |
| canary_pine | - | L | L | L | L | L | L | L | L | L | L | L | L |
| mediterranean_cypress | - | L | L | L | L | L | L | L | L | L | L | L | L |
| oriental_evergreen | - | L | L | L | L | L | L | L | L | L | L | L | L |
| sacred_bodhi_and_fig | - | L | L | L | L | L | L | L | L | L | L | L | L |
| peaceful_willow | - | L | L | L | L | L | L | L | L | L | L | L | L |
