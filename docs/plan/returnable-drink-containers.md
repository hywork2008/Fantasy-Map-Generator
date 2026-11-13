# 飲み物の器の再利用と、樽・陶器・ガラスの選択

## 1. 背景

- エール・シードル・ペリー・蜂蜜酒・ワインのレシピは、樽の「修理と取り替えの分」だけを使っていた（1,000 Lの樽に0.4樽、200 Lのワインの樽に0.08樽）。
- 飲まれた後に樽が戻ったことは帳簿（`returnableContainerLedger`）に数えるだけで、樽の在庫には戻らなかった。
  - 戻った樽が次に詰める樽にならないので、樽が何本あれば何樽詰められるかという制約が無かった。
  - 樽を船で他の市場へ送ると、その樽はどこにも残らなかった。
- 器は樽だけで、樽の無い土地でも樽を使うしかなかった。蒸留酒（Liquor）にだけ、樽・陶器・ガラスの3つのレシピがあった。

ユーザーの指示:

- 樽が無い所では陶器やガラスを使う。樽の輸入や製造の費用など、調達の費用で選ぶ。
- 戻った樽を、洗浄・修理などの低い費用で再利用し、在庫へ戻す処理を加える。

## 2. 史料

### 2.1 樽

- Pryor, "The industrialisation of the London brewing trade: Part II"（[Brewery History 163, 2015](https://breweryhistory.com/journal/archive/163/PryorP2.pdf)）。
  - 1743年、ロンドンの醸造業者は、居酒屋が樽を返さない・盗むと議会に訴えた。Trumanは、1つ22シリングの樽（butt、108ガロン = 491 L）を年に500ポンド分失うと述べた（年約455樽）。
  - Trumanは1760年に23,947樽（3万ポンド余り）を持ち、居酒屋の地下にある分が19,018ポンド、醸造所にある分が11,760ポンドで、資産の約1/4だった。
  - 醸造業者は200年以上、自分で樽を作ることを法で禁じられていたが、修理のために樽職人を雇った。broad-cooperが樽を洗い、居酒屋の地下へ運び、ビールを開けた。
  - ウィリアム3世の頃、茶色のエールは1樽（36ガロン）16シリング。樽1つ（22シリング）は、中身のエールの値の約0.46倍に当たる。
- Bass（[Brewery History 168](https://www.breweryhistory.com/journal/archive/168/1%20Bass.pdf)）: 国内向けの樽は「ほとんど限りなく」再利用した。輸出の樽は戻らず、年4万樽を作った。
- Truman 1855年（[East Endの醸造の遺産の案内](http://www.pigsear.org.uk/index_htm_files/BBB%20Guide%20Email%20Spreads%20P%2024.pdf)）: 樽職人60人（従業員の約25%）が約8万樽を作り、直した。生産は年20万バレル超。
- 今の醸造所の費用表（[beernouveau.co.uk](https://beernouveau.co.uk/costs-quality-again-and-that-elusive-profit/)）: 樽1つの洗浄は2ポンドで、新品の樽の約2%。

### 2.2 陶器

- アンフォラの重さ（[de Graauw, From Amphora to TEU](https://ancientportsantiques.com/wp-content/uploads/Documents/ETUDESarchivees/Containers/Containers2.pdf)、[Anticopédie](https://anticopedie.fr/dossiers/dossiers-gb/amphora.html)）: Dressel 1Bは空で24〜26 kg、容量24〜26 L（1 kg/L）。Gauloise 4は約10 kgで30〜38 L（0.3 kg/L）。
- 器の使用年数の民族考古学（[Arthur, Gamo](https://www.researchgate.net/publication/263445396_Pottery_Use-Alteration_as_an_Indicator_of_Socioeconomic_Status_An_Ethnoarchaeological_Study_of_the_Gamo_of_Ethiopia)、[Pottery Function and Use](https://www.researchgate.net/publication/360386105_Pottery_Function_and_Use_A_Diachronic_Perspective)）。
  - エチオピアのGamoで、壊れたビール用の器23個の平均の使用年数は2.3年（0.3〜11年）。
  - ペルーのShipibo-Coniboで、ビールの杯は1年もたず、大きな壺は5〜6年もった。
- 中世の町のエールは、王の升（パイント・クォート・ガロン）で量って売った（[Braciatrix 2017](https://braciatrix.com/2017/07/19/pitch-portion-how-medieval-brewsters-cheated-their-customers-and-defied-regulations/)、ダブリンの条例）。買い手は家から壺や杯を持ってきた（[12tomatoes](https://12tomatoes.com/tavern-inn-alehouse-history/)、一般向けの記事）。

### 2.3 ガラス

- 17〜18世紀のオニオン型の瓶（[Scottish Antiques](https://scottishantiques.com/georgian-table-glass/decanters-carafes/?product_id=36822)、[eBay](https://www.ebay.com/itm/287665783562)など、古物商の記載）: 1本0.54〜1 kg、容量は約0.75 L。陶器の瓶に代わったのは17世紀で、高温の炉を要した。
- 瓶の使用年数の史料は見つからなかった。

## 3. 決めた仕組み

### 3.1 器の量

| 器 | 1 Lあたりの重さ | 1単位 | 1回の往復で失われる割合 | 1,000 Lの樽1つの器 | 1回の往復の取り替え |
| --- | ---: | --- | ---: | ---: | ---: |
| 樽（Barrels） | 0.21 kg（120 Lで25 kg） | 120 Lの樽 | 4.8% | 8.33樽 | 0.4樽 |
| 陶器（Ceramics） | 0.5 kg（アンフォラ0.3〜1） | 465 kgの荷 | 6% | 1.075荷 | 0.0645荷 |
| ガラス（Glass） | 1 kg（瓶0.7〜1.3） | 465 kgの荷 | 6%（陶器と同じとした） | 2.15荷 | 0.129荷 |

- 樽の4.8%は、今のレシピの取り替えの分（0.4樽 / 8.33樽）で、変えていない。Trumanの記録では、ロンドンの樽の失われ方はこれより小さい。
- 陶器は、Gamoのビールの器の2.3年とShipiboの杯の1年未満の間で約1.5年もつとし、月1回の往復で約18回、1回あたり約6%とした。
- 200 Lのワインの樽では、器はこの1/5になる（樽1.67、陶器0.215荷、ガラス0.43荷）。

### 3.2 レシピ

- エール・シードル・ペリー・蜂蜜酒・ワインに、器ごとのレシピを置く。レシピが使うのは、1回の往復で失われる器（取り替え）だけである。
  - 値段と利幅の計算は、取り替えの費用で行う（樽なら今と同じ）。
- エールにはガラスのレシピを置かない。
  - 町のエールは、買い手の壺に注ぐか、樽で出した。
  - 瓶詰めのエールは遅く現れ、高価だった。樽1つ分の瓶の取り替え（0.129荷 × 6 = 0.77）に麦（0.9）を足すと、エールの値打ち（1.5）を超える。
- 保存した地図は、レシピを毎回そろえる既存の移行（`migrateFoodProcessingLotContracts`・`migratePerennialFruitGoods`・`migrateWineRecipe`・`migrateMeadGood`）で、その地図の器のidの3つのレシピにする。ワインの搾りかす（Pomace）は、レシピごとに1つずつ置く。

### 3.3 器の循環

市場ごとに、器の循環を記録する（`returnableContainerLedger.circulation`、[returnableContainers.ts](../../src/extensions/economy/generators/returnableContainers.ts)）。

1. 詰める時: 1樽分に器が1組要る。レシピが取り替えの分を市場から買い、残りを市場の空の器で詰める。空の器が足りなければ、足りない分の新品を市場から買う。
   - 空の器と、買える器の数が、詰められる量の上限になる。
   - 空の器を詰め直す時、洗浄と修理の費用（新品の値の5%、ワールドの設定`fmg-container-reuse-cost`）を町の家計に払う。
2. 飲まれた時: 器は空になって、その市場の空の器に戻る。1回の往復で失われる割合を除く。
3. 他の市場へ送った時: 器は飲み物と一緒に行き、飲んだ市場の空の器になる。
4. 空の器が、1か月の詰める量の2倍を超えたら、1か月分を残して、超えた分を市場の器の在庫に戻す（流れの種類`containerReturn`）。戻した器は、ほかの器と同じに売られる。
5. 器の循環を持たない市場（新しい地図・古い保存）は、すでに醸造していたものとして始める。空の樽を1か月分、飲み物の在庫を樽詰めとして持たせる。
6. 樽職人の生産の下限（`getMonthlyHouseholdContainerDemand`）は、飲み物が樽で出る割合をかけた取り替えの分と、空の樽の不足を3か月で埋める分にした。

### 3.4 器の選び方

- 醸造の決定は、レシピの利益（売る値 − 材料の費用）で選ぶ。器の費用は次の合計とした。
  - 取り替えの分の、市場の買い値。輸入した器は、市場の値段に入っている。
  - 詰め直す空の器の、洗浄と修理の費用。
  - 空の器で足りない新品の器の、買い値 × 1回の往復で失われる割合。器は戻り、以後の詰め直しに使えるため。
- 市場に器が無い時は、作る計画（樽なら木材から、陶器なら粘土から）も今までと同じに比べる。
- 空の樽があり、樽が買える市場では、樽が最も安い。樽が無い市場では、陶器、ガラスの順になる。
- 値段の元になる材料の費用（`getRecipeCostBasis`、`calculateAverageBaseCostByGood`）は、器だけが違うレシピを1つの選択として、最も安い器の費用を取る。
- ワインは保存食の扱いで、全てのレシピに入る材料が労働の配分で先に作られる。器は1つの枠として数え、枠の先の扱いは樽にだけ与える。陶器とガラスには、作る量を抑える下限が無いため。

## 4. 計測

結果は[drink-containers-20261107.md](../analytics/drink-containers-20261107.md)（シード2103・2102、12か月）。

- エールの需要を満たした割合は変わらない（92〜93%）。
- 樽は、失われる1つにつき約20回詰め直された。空の樽が足りずに新しく買った樽は、詰め直した数の0.04%。
- 2102では、余った空の樽6,547を在庫へ戻した。
- 陶器は、樽の足りない市場でエールに使われた（2102の12か月目にエールの約0.5%）。ガラスはどの飲み物にも使われなかった。

## 5. 未確定事項

1. 樽の失われる割合。Trumanの記録（年455樽、1760年に23,947樽）からは4.8%より小さいが、1年の往復の回数が分からない。
2. 瓶の使用年数。史料が無く、陶器と同じとした。
3. 寒い土地の粘土（honey-forage-lands.md §8の2）。→ [cold-land-clay.md](cold-land-clay.md)で扱った。
4. 戦争・襲撃で失われた積み荷の器は、送った記録に残り続ける。
