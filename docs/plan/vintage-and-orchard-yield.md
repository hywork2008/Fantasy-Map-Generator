# 葡萄の搾りと、葡萄畑・果樹園の収穫量

## 1. 背景

[container-supply-20261110.md](../analytics/container-supply-20261110.md)で、中世の飲み物の足りなさは器ではなく、果物から作る飲み物（ワイン1%、シードル19〜24%、ペリー0%）にあると分かった。葡萄畑と果樹園を調べた（[orchard-area-20261110.md](../analytics/orchard-area-20261110.md) §2）。

- 葡萄は、収穫できる量（2103で年2.0万t）の約3%しか使われていなかった。
  - セルの葡萄からワインを作る量は、チーズ・干し葡萄と同じ「少しの売り物」の上限（セルの人 × 0.1 × 値段の圧力、`getCellPreservedFoodExportDemand`）で決まっていた。
  - シードル・ペリーは、市場の飲み物の需要と在庫の上限（`getFoodProcessingProductionHeadroom`）で決まる。ワインだけが、この道に乗っていなかった。
  - セルで作ったワインは、樽を使わず、樽の循環にも記録されなかった。
- 林檎は、収穫できる量の約6割がシードルに搾られ、収穫の量そのものが上限だった。
- 収穫の量は、史料よりずっと少ない。

| | モデル（年） | 史料 |
| --- | ---: | --- |
| 葡萄 | 0.36 t/ha（ワイン約2.8 hL/ha） | 1800年ごろのフランスの平均12〜15 hL/ha |
| 林檎 | 0.48 t/ha | 1970年のヘレフォードシャーの昔ながらの果樹園6〜7.5 t/ha |

## 2. 史料

- フランスの葡萄畑の平均の収穫は、1800年ごろ12〜15 hL/ha、1924〜33年に36.7 hL/haだった（[abcduvin](https://www.abcduvin.com/index.php/term/2,13248.xhtml)）。
- ローマの葡萄畑は、コルメッラで1ユゲラ（約1/4 ha）に3クレウス（1つ約500 L）、約60 hL/ha（[Inrap](https://archeologie-vin.inrap.fr/Archeologie-du-vin/Histoire-du-vin/Antiquite-Techniques-et-production)）。12 hL/haの見積もりもある（[Wikipédia](https://fr.wikipedia.org/wiki/Histoire_de_la_vigne_et_du_vin)、出典の記載なし）。
- 19世紀半ばの葡萄畑は1 haに約2万本で、収穫は40 hL/ha以下だった（[wein.plus](https://glossary.wein.plus/yield-per-hectare)）。ブルゴーニュでは、ワイン1 hLに葡萄約145 kgを使う（[Robert Parker](https://winejournal.robertparker.com/what-is-a-yield)）。モデルは1 Lに1.3 kgとしている。
- 中世の葡萄畑の収穫を、ha・hLで示した史料は見つからなかった（Dion 1959、Saint-Germain-des-Présの所領明細帳は、当たれていない）。
- ヘレフォードシャーの昔ながらの果樹園（1エーカーに40本、1 haに約100本）は、1970年に1エーカー2.5〜3トン（6〜7.5 t/ha）で、よく育った果樹園で4トン（約10 t/ha）だった（[Archive of Cider Pomology](http://www.archiveofciderpomology.co.uk/Origins_of_cider.htm)）。
- ヘレフォード平野の果樹園は、1875〜79年に農地の7.73%だった（[Herefordshire Through Time](https://htt.herefordshire.gov.uk/herefordshires-past/the-post-medieval-period/agriculture-and-industry/agricultural-depression-1870-1900/)）。

## 3. 決めた仕組み

### 3.1 ワインを、シードル・ペリーと同じにセルで搾る

- セルの葡萄からワインを作る量は、市場のワインの需要と在庫の上限と、樽と空の樽の上限で決める（`isCellPressedDrink`、[foodLots.ts](../../src/extensions/economy/generators/foodLots.ts)）。少しの売り物の上限は使わない。
- 搾る時に、レシピの樽を市場から引き、空の樽を詰め直し、ワインの樽の記録（`recordWineCaskFilling`）に入れる。
- 葡萄の収穫は年1回なので、ワインの在庫の上限を3か月から12か月にした（`WINE_TARGETS.reserveMonths`）。シードル・ペリーと同じである。
- 生の葡萄・干し葡萄・ワインの順、セルの備蓄の先、加工の労働の上限（セルの人の15%）は、今までと同じ。

### 3.2 収穫の量

[perennialCrops.ts](../../src/data/perennialCrops.ts)の`yieldLotsPerHectarePerMonth`（1荷は1 t）。

| | 前 | 後 | 年 | 根拠 |
| --- | ---: | ---: | ---: | --- |
| 葡萄 | 0.03 | 0.13 | 1.56 t/ha（約12 hL/ha） | 1800年ごろのフランスの平均の下の端 |
| 林檎 | 0.04 | 0.25 | 3 t/ha | 1970年のヘレフォードシャーの6〜7.5 t/haの半分。中世の木は少なく、手入れも少ないとした |
| 梨 | 0.032 | 0.2 | 2.4 t/ha | 林檎との比（0.8）を保った |

- 1 haの労働の日数と、1人あたりの面積は変えていない。収穫できる分を全部は使わず、使わない分は作られない（`planCellFoodRescue`）。
- 保存した地図の財の一覧は、`migratePerennialFruitGoods`で毎回この値にそろう。

## 4. 計測

計測は[orchard-area-20261110.md](../analytics/orchard-area-20261110.md)（北緯30°の地図2枚、24か月、2年目）。

- ワインの需要を満たした割合は、1%から44〜52%になった。葡萄の加工は約15倍になった。
- シードルは18〜24%のまま。林檎の収穫できる量は6倍になったが、果樹園のある市場ではシードルの需要の上限まで搾っており、搾った量は変わらない。
- 残りの足りない分は、葡萄畑・果樹園の無い市場の需要である。果物の飲み物は、ほかの市場へほとんど送られない。

## 5. 未確定事項

1. 中世の葡萄畑と果樹園の収穫の史料（Dion 1959、Saint-Germain-des-Présの所領明細帳、中世イングランドの荘園の果樹園の記録）。
2. 収穫の量に合わせた、1 haの労働の日数（収穫と搾りの労働は、収穫の量につれて増える）。
3. 1人あたりの面積（葡萄0.04 ha、林檎0.02 ha）。ヘレフォードの7.7%のような、果樹園の多い土地との比べ。
4. 梨の果樹園は、地図にほとんど現れない（[orchard-drinks-and-fruit-prices.md](../analytics/orchard-drinks-and-fruit-prices.md)）。
5. 葡萄畑・果樹園の無い市場のワイン・シードルの需要。商人が運ぶか、需要をその土地の飲み物（エール・蜂蜜酒）に回すか。
6. 生の葡萄・干し葡萄の市場の需要は、生の葡萄がセルの中で食べられて市場に出ないため、満たされない。
