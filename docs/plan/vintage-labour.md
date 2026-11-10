# 葡萄と果物を搾り・干す労働

## 1. 背景

[fruit-reach-20261110.md](../analytics/fruit-reach-20261110.md)で、ワインの足りない分の81〜85%は葡萄畑のある市場の中にあると分かった。葡萄畑のセルは、加工の労働の上限で搾る量が止まっている（[grape-season-20261110.md](../analytics/grape-season-20261110.md) §3）。

- セルの加工の労働は、セルの人の15%（`CELL_FOOD_PRESERVATION_LABOR_SHARE`）までである。単位は人口の点（1点は`populationRate`、既定1,000人）。
- 葡萄の1荷（1,000 kg）を搾るか干すのに、0.06点（60人・月）を使っていた（`preservationLaborPerUnit`）。1 kgに約1.5人・日である。
  - 1,000人の葡萄畑のセルでは、上限は月に2.5 tになる。そのセルの年の収穫は約62 t（1人0.04 ha × 1.56 t/ha）で、収穫の月に搾れるのは一部だけだった。
- この値は、荷が抽象的な量だった時のもので、荷が1 tになった後もそのままだった。林檎（0.05）・梨（0.055）も同じである。

## 2. 史料

- ドウロでは、5 tの葡萄を入れた槽（lagar）を、7人が4時間踏んだ。踏む作業は、槽の端から端への行き来を3日ほど続けることもあった。踏み手は、昼に葡萄を摘んだ人が夜に務めた（[Alcohol Professor](https://www.alcoholprofessor.com/blog-posts/grape-crushing-by-foot-better-wine)）。
  - 1回で1 tに約5.6人・時、3回で約17人・時（約2人・日）になる。
- 熟練した摘み手は、1日に1〜2 tの葡萄を摘んだ（[Harvest (wine)](https://en.wikipedia.org/wiki/Harvest_(wine))）。摘む労働は、葡萄畑の1 haの労働の日数（`laborDaysPerHectare`）に入っている。
- 搾り機の1回の量は、シャンパーニュの昔の縦型の搾り機で約4,000 kgで、詰め・搾り・崩し・再び搾り・空け・洗いを夜通し繰り返した（[Pressing (wine)](https://en.wikipedia.org/wiki/Pressing_(wine))）。
- カトの100ユゲラ（約25 ha）の葡萄畑は、16人と、搾り機3台、5年分の収穫を入れる800クレウスの甕を備えた（『農業論』11、[Cato on Agriculture](https://soilandhealth.org/wp-content/uploads/01aglibrary/010121cato/catofarmtext.htm)）。収穫の時は人を雇った。
- 葡萄畑1 haの収穫には、25〜32人・日がかかった（Rathbone、[JRS](https://www.cambridge.org/core/journals/journal-of-roman-studies/article/abs/development-of-agriculture-in-the-ager-cosanus-during-the-roman-republic-problems-of-evidence-and-interpretation/3B057598AD7387D3025FA8BBCEF39C2A)、近代の値による）。
- マラガの干し葡萄は、干し場（pasero）で約2週間干し、房を返し、夜は露を避けて覆った。家族の労働で行った（[Diputación de Málaga](https://www.malaga.es/en/laprovincia/patrimonio/lis_cd-19688/grapes-drying-and-raisins-in-la-axaquia-industrial-heritage)、[FAO GIAHS](https://openknowledge.fao.org/server/api/core/bitstreams/6eddf7e5-b33d-41ca-9d1e-e4e8df7bebc7/content)）。1 tあたりの日数は見つからなかった。

## 3. 決めた仕組み

- 葡萄・林檎・梨の1荷（1,000 kg）を、セルで搾り・樽に詰め、または干すのに、大人3人・日とする（`CELL_FRUIT_PROCESSING_WORK_DAYS_PER_LOT`、[foodLots.ts](../../src/extensions/economy/generators/foodLots.ts)）。
  - ドウロの踏む作業（約2人・日）に、搾り・樽詰め・干し葡萄を返す作業を加えた。
- 人口の点に直すと、3日 ÷（大人1人の月の働ける日数 × `populationRate`）である（`getCellFoodProcessingLabourPerUnit`、[markets-generator.ts](../../src/extensions/economy/generators/markets-generator.ts)）。働ける日数は、畑と同じ年140日（月約11.7日、`WORKABLE_DAYS_PER_ADULT_PER_MONTH`）。
  - 1荷0.06点から約0.00026点になり、1,000人のセルの上限は月約580 tになる。
- セルの人の15%の上限は変えていない。ほかの果物（李・無花果・檸檬など）と、牛乳・魚・獣は、今までの値のままである。

## 4. 計測

計測は[vintage-labour-20261110.md](../analytics/vintage-labour-20261110.md)（北緯30°の地図2枚、24か月、2年目）。

- 葡萄の加工は2.2〜2.6倍、林檎の搾りは2.3〜2.4倍になった。ワインの満たした割合は43〜47%から71〜72%、シードルは19〜24%から41〜51%になった。
- エールを飲んだ量は23〜25%減り、足りない分は3〜5倍になった。
  - ワインの土地の度合いが上がり、町のエールの需要が下がった（収穫の前の月にも約17%少ない）。
  - 収穫の月に、セルの搾りが市場の樽を引き、エールの樽が足りなくなった。樽を作った量は変わらず（2103で約12万）、樽職人はワイン・シードルの樽の需要に応じて増えていない。

## 5. 未確定事項

1. 干し葡萄を干す労働の史料（1 tあたりの日数）。
2. 牛乳・魚・獣・ほかの果物の1荷の労働も、荷が物の量になる前の値である。
3. 収穫の月の働ける日数。収穫の時は日の出から日の入りまで働き、人を雇った。
4. 樽職人が、収穫の前にワイン・シードルの樽を作り置かない。収穫の月の樽の不足で、町のエールが減る（§4）。
