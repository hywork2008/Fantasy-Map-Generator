# 寒い土地の粘土とガラスの砂

## 1. 背景

- 財`Clay`（465 kgの荷）の配置の条件は「年平均気温8℃以上で、海岸の陸のセルか川」（`minTemp(8) && (shore(1) || river())`）だった。
- 陶器（`Ceramics`）と煉瓦（`Brick`）は粘土から作る。粘土の無い市場では、どちらも輸入するしかない。
- 飲み物の器に陶器を加えたので（[returnable-drink-containers.md](returnable-drink-containers.md) §5の3）、樽の足りない寒い土地は、陶器にも頼れなかった。[honey-forage-lands.md](honey-forage-lands.md) §8の2でも未確定事項として挙げていた。

H = 25の地図4枚（シード2101〜2104）の初めの配置（[cold-clay-20261107.md](../analytics/cold-clay-20261107.md) §2.1）:

- 粘土のセルは4枚で55。すべて年平均気温8℃以上だった。
- 平均気温0〜4℃の市場は34で、そのうち32の市場に粘土が無い（人口は計約1,060万）。0℃未満の13の市場には、1つも無い。
- 1種類の財が置かれるセルの数の上限（陸と海のセルの4%）には、遠く及ばない。条件を広げると、暖かい土地の粘土を減らさずに、寒い土地の粘土が増える。

## 2. 史料

- 年平均気温: ノヴゴロド約5℃、トゥルク約5.5℃、モスクワ約5.8℃、ヴェリーキー・ウスチュグ約2.5℃。どこも8℃に届かない。
- ノヴゴロド
  - 10〜15世紀の土器の大部分は地元で作られた（Orton編, [The Pottery from Medieval Novgorod and Its Region](https://books.google.com/books/about/The_Pottery_from_Medieval_Novgorod_and_I.html?id=uUQpAQAAMAAJ), UCL Press 2006）。
  - ノヴゴロドとリューリコヴォ・ゴロディシチェのすぐ近くに、焼き物に良い粘土が多くある（[Indicators of craft specialisation in medieval ceramics from north-west Russia](https://discovery.ucl.ac.uk/id/eprint/3357/1/3357.pdf)）。農村のMinino Iの3万1千片の器も、地元の粘土で作られていた（[The Archaeology of Medieval Novgorod in Context](https://dokumen.pub/the-archaeology-of-medieval-novgorod-in-context-studies-of-centre-periphery-relations-9781842172780-2011050182.html)）。
- フィンランド・スウェーデン
  - バルト氷湖の融け水が、細かい土を層にして積もらせた（年縞粘土、[Saimaa Geopark](https://saimaageopark.fi/en/geopark-info/geology-and-environment/https-saimaageopark-fi-en-geopark-info-geology-and-environment/)）。
  - バルトの煉瓦ゴシックの建物は、スウェーデン・フィンランドにもある（[List of Brick Gothic buildings](https://en.wikipedia.org/wiki/List_of_Gothic_brick_buildings)、[Medieval stone churches in Finland](https://en.wikipedia.org/wiki/Medieval_stone_churches_in_Finland)）。
  - トゥルクでは、地元の煉瓦と輸入の煉瓦が使われた。ストックホルム・ウプサラ・ヴァドステナ・ヴィスビューは煉瓦の町だった（[Fresh Approaches to Brick Production and Use in the Middle Ages](https://dokumen.pub/fresh-approaches-to-brick-production-and-use-in-the-middle-ages-proceedings-of-the-session-utilization-of-brick-in-the-medieval-period-production-construction-destruction-held-at-the-european-association-of-archaeologists-eaa-meeting-29-august-to-1-september-2012-in-helsinki-finland-9781407312422-9781407342115.html)）。
  - RatilainenとKinnunenのpXRFの分析では、最初の時期から地元で作っていた（[Academia: Medieval Brick and Tile](https://www.academia.edu/Documents/in/Medieval_Brick_and_Tile)）。
- アイスランド
  - 中世の焼き物はすべて輸入で、地元では作らなかった（[Mehler, Die mittelalterliche Importkeramik Islands](https://www.academia.edu/223938/Die_mittelalterliche_Importkeramik_Islands_medieval_pottery_imported_to_Iceland)）。
  - 理由は、適した粘土と燃料の不足とされる（[Viking age and medieval craft in Iceland](https://www.academia.edu/225194/Viking_age_and_medieval_craft_in_Iceland_Adaptation_to_extraordinary_living_conditions_on_the_edge_of_the_Old_World)）。ベントナイトの粘土を使ったという別の見方もある（[Hurstwic](http://www.hurstwic.org/history/articles/daily_living/text/food_and_diet.htm)）。
  - 同じ北大西洋でも、ヘブリディーズとフェロー諸島は地元の焼き物を作った（[Marttila 2016](https://www.eaglehill.us/JONAonline/articles/JONA-29/03-Marttila.shtml)）。

粘土を決めるのは気温ではなく、粘土の土と燃料である。氷河が残した粘土は、北の森の土地にむしろ多い。燃料の木が無い土地では焼けない。

## 3. 決めた仕組み

1. 粘土の条件を「海岸の陸のセルか川で、木の無い寒い土地を除く」にした（[goods-generator.ts](../../src/extensions/economy/generators/goods-generator.ts)の`SHORE_DEPOSIT_DISTRIBUTION`）。
   - `(shore(1) || river()) && !(biomeTag("cold") && !biomeTag("forest", "wetland", "desert"))`
   - 除くのは、`cold`のタグを持ち、`forest`・`wetland`・`desert`のどれも持たないバイオームで、ツンドラ・高山ツンドラ・氷河である。
   - タイガ（`forest`）、北方の泥炭地（`wetland`、泥炭の下に氷河の粘土がある）、寒い砂漠（`desert`、中央アジアのオアシスの日干し煉瓦と焼き物）は残す。
2. 当たる確率（`chance` 5）と、置くセルの数の上限は変えない。
3. 保存した地図
   - 移行`migrateColdLandShoreDeposits`が、カタログのClay（とガラスの砂、§5）の条件が元の既定のままの時だけ、新しい条件に替える。財の編集画面で変えた条件は残す。
   - 地図に置いた粘土は動かさない。財の編集画面の配置の作り直しで、新しい条件で置き直せる。
   - 新しく作る地図は、初めから新しい条件で置く。

## 4. 計測

結果は[cold-clay-20261107.md](../analytics/cold-clay-20261107.md)（シード2102・2103、12か月）。

- 保存した地図の粘土はそのままにして、新しい条件だけが許すセルに、その地図の作成で古い条件のセルに置かれた割合（約5%）で粘土を加えた（add）。
- 粘土のセルは、2102で25 → 113、2103で27 → 69。
- 寒い市場の陶器（12か月）: 2102の0℃未満は0 → 63荷、0〜4℃は0 → 113荷。2103の0〜4℃は43 → 283荷。
- 8℃以上の市場は、ほぼ変わらない（2103は同じ値）。
- 煉瓦は、どちらでもほとんど作られない（12か月で数荷）。

## 5. ガラスの砂

### 5.1 背景

- ガラスの砂（`White sand`、465 kgの荷）も、粘土と同じ「気温8℃以上で、海岸か川」の条件だった。
- ガラス（`Glass`）の初めのレシピは、ガラスの砂1荷と炭酸カリウム（`Potash`）0.5樽で、木の灰で溶かす森のガラスである。
- H = 25の地図4枚では、ガラスの砂のセルは計41だった。平均気温4℃未満の47の市場には、1つも無い。シード2104の地図は、粘土もガラスの砂も1つも無い（古い条件を満たすセルが2つしか無い）。

### 5.2 史料

- 森のガラス（Waldglas）は、1000〜1700年ごろの北西・中央ヨーロッパで、木の灰と砂から、森の中のガラス小屋で作られた（[Forest glass](https://en.wikipedia.org/wiki/Forest_glass)）。
  - 砂は、たいてい山の渓流と川から取った。
  - 砂で知られた土地に、オーストリアのヴァルトフィアテル（最古のガラス小屋は1371年）とテューリンゲンの森がある。どちらも年平均気温は8℃に届かない。
  - ガラス小屋は、炉の木と灰の木のある森に置かれ、木が尽きると移った（[Glaserwiese](https://archaeoregion.at/en/museum-waldglashuette-forest-glassworks-glaserwiese/)、[Early modern glass in England](https://en.wikipedia.org/wiki/Early_modern_glass_in_England)）。
- スウェーデンのスモーランドのガラス工業は、森（炉の燃料）と湖（砂）の上に立った（[Rick Steves](https://www.ricksteves.com/watch-read-listen/read/articles/rural-sweden-glass-castles-and-minnesotans)、一般向けの記事）。スウェーデンには1592年、フィンランドには1681年にガラス工場ができた（[Swedish glass overview](https://www.mothersweden.com/swedish-glass-overview.html)、[Glassmaking Tradition](https://wiki.aineetonkulttuuriperinto.fi/wiki/Glassmaking_Tradition)）。
- ロシアの最初のガラス工場は、モスクワの近くのドゥハニノにできた（1634〜1639年、[mos.ru](https://www.mos.ru/en/news/item/61939073/)）。古いロシアのガラスは、砂と洗った灰から作った（[Early Russian glasses](https://www.sciencedirect.com/science/article/pii/S0020169324001208)）。

森のガラスの砂は、寒い森の土地の川と湖にある。粘土と同じ条件にした。

### 5.3 決めた仕組み

- ガラスの砂の条件を、粘土と同じ`SHORE_DEPOSIT_DISTRIBUTION`にした。当たる確率（`chance` 4）は変えない。
- 保存した地図は、粘土と同じ移行`migrateColdLandShoreDeposits`で、条件だけを替える。

### 5.4 計測

結果は[cold-sand-20261107.md](../analytics/cold-sand-20261107.md)（シード2102・2103、12か月）。

- 粘土とガラスの砂を、§4と同じ方法で加えた。ガラスの砂のセルは、2102で14 → 59、2103で24 → 72。
- 寒い市場で、ガラスの砂を掘るようになった（2103の0〜4℃は12か月で12 → 391荷）。
- ガラスは、ほとんど増えない。0〜4℃の市場で作った量は、2102で0 → 4荷、2103で3 → 6荷。
  - ガラスの砂はほとんど使われず、在庫にたまる（2103の0〜4℃は20 → 388荷）。
  - もう1つの材料の炭酸カリウムが、0〜4℃の市場で年に約10樽しか作られないため。
- ガラスの値段は下がった（2103の0〜4℃は5.10 → 3.24）。

## 6. 未確定事項

1. ガラスの砂（`White sand`）も、粘土と同じ「気温8℃以上で、海岸か川」の条件だった。→ §5で扱った。
2. 保存した地図の粘土とガラスの砂は、作り直さないと増えない。移行で自動に足すかどうかは決めていない。
3. 寒い森の土地のガラスは、炭酸カリウム（木の灰）の少なさで止まる。灰と炭酸カリウムの量を、炭酸カリウムの輸出地とされるロシア・ポーランド・バルトの史料と比べる（まだ調べていない）。
