# 干し葡萄の売り物と、もつ期間

## 1. 背景

[grape-season-and-wine-country.md](grape-season-and-wine-country.md) §4の1。市場の干し葡萄の需要は、2年目に16〜20%しか満たされない（[grape-season-20261110.md](../analytics/grape-season-20261110.md)）。

- 今の需要は、市場の全ての人に1人年0.5 kg、1年中、同じに置く（`GRAPE_TARGETS.raisinsKilogramsPerPersonYear`）。
- 葡萄畑のセルは、干し葡萄をセルの蓄えにし、残りの葡萄をワインに回す（`getCellFoodCommercialPath`）。市場へ出る干し葡萄は、セルから送った生の葡萄を町が干した分だけである。
- 干し葡萄の運びやすさは干し鱈と同じ（`tradeProfile(3, 3, 2, 1, 0, 4, 2)`、もちは5のうち4）。腐り方の季節の違いは無い。

干し葡萄を売り物にする前に、どれだけ遠く、どれだけ長く運べたかを史料で調べた。

## 2. 史料

### 2.1 運んだ道と量

- 中世のイングランドの家は、干し葡萄（raisins of the sun）、小粒の干し葡萄（raisins of Corinth）、無花果、棗、干しすももを、地中海、とくにギリシャとスペインの南から買った。量はbarrel・frail（籠）・tope・topnettで数えた。値段は1ポンド1.5〜2ペンスで、中世を通じてあまり変わらなかった（O'Regan、[Medieval Spices and Spice Accounts](https://richardiii.net/wp-content/uploads/2021/08/05-68-Medieval-Spices-and-Spice-Accounts.pdf)）。
  - ある大きな家は、1年の蓄えとして小粒の干し葡萄180ポンドを買った（同）。
- 14世紀には、海の道で北まで来ていた（[Modern Medieval Cuisine](https://modernmedievalcuisine.com/2025/09/14/shining-a-light-on-great-raisins/)、Gras『Early English Customs』とClose Rolls、Woolgar『The Culture of Food in England』による）。
  - 1303年、サンドイッチの港で、スペインの商人が干し葡萄18ポンドの税を払った。
  - 1380年、ジェノヴァで積んでフランドルへ向かう船が、干し葡萄13パイプを積んだまま、嵐でダンスターに打ち上げられた。
  - 1384年、嵐でプリマスに入ったスペインの大きな船が、干し葡萄378 frailを積んでいた。
  - 1388年、ポルトガルで積んだ無花果と干し葡萄の小樽200がロンドンに入り、ヨーク・キングストン・アポン・ハルへ送るよう命じられた。
  - 内陸のストラトフォード・アポン・エイヴォンの聖十字ギルドは、15世紀に毎年、2種の干し葡萄を買った。
- 15世紀のブルッヘ・スロイスでは、ジェノヴァの船乗りが干し葡萄・無花果・マルヴァジアの酒を売った。ポルトガルの商人は、15世紀初めの10年に、ワインと「四旬節の果物」（干し葡萄・無花果）を多く売った（Murray、Merchants on the Margins、[ResearchGate](https://www.researchgate.net/publication/296637793_Merchants_on_the_margins_fifteenth-century_Bruges_and_the_informal_market)）。ハンザの商人は、フランドルで毛織物とともに香辛料・無花果・干し葡萄を買い、バルト海へ運んだ（[WarHistory.org](https://warhistory.org/article/the-hanseatic-league)）。
- 17世紀のマラガ（Martínez Ruiz 2011、[Hispania 239](https://pdfs.semanticscholar.org/a40a/ac52b8f9fa288be9b2c79f22a48a04a307a3.pdf)）。
  - 干し葡萄は、スペインからイングランドへの輸出で、ワインに次ぐ2番目の品だった。
  - 1651年3月〜1654年2月の3年に、マラガの港から干し葡萄424,393アローバ（約4,800 t、年約1,600 t）が積み出された。少なくとも4割がイングランドの商人の分だった。
  - エリザベス朝のロンドンには、マラガの収穫の売り（vendeja）の後の船が約17隻来て、干し葡萄約825 tを運んだ。
  - vendejaは収穫の時の干し葡萄と果物の売りである。イングランドの船は10月からマラガに着き、ワインと干し葡萄をすぐ積んだ。

### 2.2 季節

- ザキントスの小粒の干し葡萄は、9月の初めに積み出せた。翌年の初めまで積み出され、その後の数か月は無かった。ロンドンには年約2,000 tが入った（[The London Wanderer](https://thelondonwanderer.co.uk/2022/11/random-observations-on-currants/)、二次の記事）。
  - 1607年、18隻のイングランドの船が、ザキントスで小粒の干し葡萄を満載し、イングランドへ直行した（Fusaro、Political Economies of Empire in the Early Modern Mediterranean）。
- 干し葡萄は、クリスマスから四旬節に食べた。四旬節の金曜日には、魚の代わりに干し葡萄・アーモンド・蜂蜜・米を出した家もあった（Paston Letters）。
- エリザベス・ド・バラの家（1339〜40年）は、12月22日と2月19日に小粒の干し葡萄、2月19日と3月23日にマラガの干し葡萄を買った。マラガの干し葡萄の1ポンドの値段は、2月の約3ペンスから3月の約6ペンスへ倍になった（Modern Medieval Cuisine）。春には残りが少なかったと読める。
- マーガレット・パストンは、棗を「新しければ」買うよう頼んだ（O'Regan）。乾いた果物にも、その年の新しいものと古いものの違いがあった。
- 冬の終わりには、残った果物は古く、しわが寄り、黴びていた（[Coquinaria](https://coquinaria.nl/en/fake-fish/)、四旬節の食べ物の記事）。

### 2.3 もつ期間と傷み方

- 干し葡萄は水分約15%（10〜15%）まで干し、ほとんどが糖である。水分が16%を超えないようにし、湿度70%を超える所では黴と酵母が育ち、水分20%を超えると食べられない（[ResearchGate、Grape drying practices](https://www.researchgate.net/publication/308073397_Grape_drying_practices_and_new_approaches_for_quality_raisins)）。
- 水分約14%の干し葡萄を11か月置いた試験では、20〜25 °Cで褐色が進んだが、どの温度でも食べられた（Cañellas et al. 1993、[Journal of Food Science](https://ift.onlinelibrary.wiley.com/doi/10.1111/j.1365-2621.1993.tb09363.x)）。
- 乾いた果物の虫には、1年以上置いた干し葡萄で多く増えるものがある。雨で傷み、黴びた干し葡萄を好む虫もいる（USDA ARS、[Insects on Dried Fruits](https://www.ars.usda.gov/is/np/insectsdriedfruits/insectsdriedfruits.pdf)）。
- 1628〜29年、関税の争いで荷揚げが止まり、1629年の新年に約1,300 tの小粒の干し葡萄が船と倉で腐っていた（[History of Parliament](https://historyofparliament.com/2018/06/28/currant-affairs-taxation-without-representation-in-early-stuart-england/)）。秋に着いた荷が、数か月積まれたままで腐った。
- 中世の干し葡萄がどれだけもったかを、月で示した史料は見つからなかった。

### 2.4 読み取り

- 運べる距離は長い。海の道で、マラガ・ザキントスからロンドン（約3,000〜5,000 km）、さらにヨーク・ハル・バルト海まで運んだ。内陸の町も毎年買った。距離より、季節と湿りが問題だった。
- もつのは、およそ次の収穫まで（約1年）。秋に着き、冬から四旬節（2〜3月）に食べ、春には残りが少なく値が上がった。暖かい季節を越えた古い干し葡萄は、褐色になり、虫と黴が増えた。
- 濡れたり、詰めたまま置いたりすると、数か月で腐った（1629年）。

## 3. 決めた仕組み

1. 葡萄畑のセルは、蓄えの後、ワインに搾る前に、市場の干し葡萄を干して市場へ出す（`marketDriedPath`、[cellFoodRescue.ts](../../src/extensions/economy/generators/cellFoodRescue.ts)）。量は、町の干し葡萄の需要の1年分から市場の在庫を引いた分（`GRAPE_TARGETS.raisinsReserveMonths`、12か月）で、加工の労働の上限の中で決まる。
2. 干し葡萄の傷みに、季節をつける。
   - 市場の干し葡萄は、毎月、温かくも寒くもない土地の蔵で1.5%（Simulation settingsの`fmg-raisin-storage-loss`）に、その月の気温と土地の湿りの倍率（穀物の`getStorageClimateLossMultiplier`、0.7〜2）をかけた分が傷む。
   - 町の需要の1年分を超えた在庫は、次の収穫を越えた古い干し葡萄として傷む（`spoilStoredRaisins`）。
   - 今のもち（5のうち4、干し鱈と同じ）は、遠くへ運べる点で史料と合う。
3. 市場の需要を、季節に合わせる。
   - 需要は町の人だけ（1人年0.5 kg）。10〜3月は年の平均の1.5倍、4〜9月は0.5倍（`GRAPE_TARGETS.raisinsWinterWeight`、南半球は逆）。
   - 農村の人は、今までどおりセルの蓄えから食べる。
   - 葡萄畑の無い市場の需要は、商人が運ぶ分で満たす。

## 4. 計測

計測は[raisin-trade-20261110.md](../analytics/raisin-trade-20261110.md)（北緯30°の地図2枚、24か月、2年目）。

- 干し葡萄の満たした割合は16〜20%から70〜72%になった。需要を町の人だけにして、年約4万荷から約4千荷になった。
- 傷んだのは食べた量の約8%で、4〜8月に多い。足りない分は2〜3月に多く、春に残りが少なかった史料と合う。
- 生の葡萄は11〜14%から46〜49%、ワインは8〜13%増えた。町が生の葡萄を干し葡萄にしなくなったためと見られる。

## 5. 未確定事項

1. 季節の傷みの率（1.5%/月）。月の率を示した史料が無い。
2. 町の人1人あたりの量（今は1人年0.5 kg）。大きな家の1年の蓄え（小粒の干し葡萄180ポンド）は、町の人の量の根拠にはならない。
3. 小粒の干し葡萄（raisins of Corinth）と大粒の干し葡萄を分けるか。
4. 葡萄畑の無い市場の町に、商人が干し葡萄をどれだけ運んでいるか（市場ごとの内訳）。
