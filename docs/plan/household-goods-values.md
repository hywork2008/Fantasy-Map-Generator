# 長靴・革の品・蝋燭の基の値

## 1. 背景

[rural-goods-budget-20261112.md](../analytics/rural-goods-budget-20261112.md)で、農村の人の分の長靴・革の品・蝋燭の代金は、値段が下限（基の値の約0.3倍）でも農村の家計の入りの約1.7倍、基の値で約12倍だった。品の基の値を、賃金と穀物の値に対して史料で確かめる。

## 2. 比べる物差し

お金の大きさは地図の人口の換算（populationRate）で変わるため、穀物の重さで比べる。

- モデル: 穀物（Grain）は1荷車（wain、465 kg）の基の値が1（[goodMeasureCatalog.ts](../../src/extensions/economy/generators/goodMeasureCatalog.ts)の`WAIN_KG`）。基の値1は穀物465 kgである。
- モデルの職人の賃金は、自分の食べる穀物の1.5倍（`WAGE_SUBSISTENCE_MULTIPLE`、[subsistenceWage.ts](../../src/extensions/economy/generators/subsistenceWage.ts)）で、1人年0.43荷車 × 1.5 = 穀物約300 kg、1日（月25日）約1 kgである。
- 史料: 14世紀初めのイングランドの小麦は1クォーター（約218 kg）約5〜6シリング（Clark, *The Price History of English Agriculture, 1209-1914*、[Agprice.pdf](https://faculty.econ.ucdavis.edu/faculty/gclark/papers/Agprice.pdf)、数は要確認）。1 kg約0.3ペンスとした。
- 史料の日雇いは1日1〜1.5ペンス（1307年ごろ）、1351年の法で草刈り1ペンス・刈り入れ2ペンス・大工4ペンス（[Medieval Prices and Wages](https://thehistoryofengland.co.uk/resource/medieval-prices-and-wages/)、[History Hit](https://www.historyhit.com/money-in-medieval-england/)）。1.5ペンスは穀物約5 kgである。

## 3. 史料の値段とモデル（穀物の重さ）

| 品 | 史料 | 史料の穀物 | モデルの基の値 | モデルの穀物 | モデル ÷ 史料 |
| --- | --- | ---: | --- | ---: | ---: |
| 靴1足 | 1313年、豊かな農民の靴6ペンス（Dyer, *Standards of Living* p.175、[C14 Price List](http://faculty.goucher.edu/eng211/c14_price_list.htm)）。1470年代の男の靴4ペンス | 約20 kg | 長靴 7 / 20足 | 163 kg | 約8 |
| 獣脂の蝋燭 1 kg | 1338年サマセット1ポンド1.5ペンス（[Medieval Prices](http://faculty.goucher.edu/eng240/medieval_prices.html)）。家の灯りは獣脂、教会は蜜蝋（Rogers I p.442、[Manchester Hive](https://www.manchesterhive.com/downloadpdf/view/journals/bjrl/21/1/article-p176.pdf)） | 約11 kg | 蝋燭 14 / 100 kg | 65 kg | 約6 |
| 蜜蝋 1 kg | 1374年1ポンド8ペンス、蝋燭に作る手間1ポンド1ペンス（Rogers I p.449） | 約59 kg（蝋燭 約66 kg） | 蜜蝋 9.7 / 100 kg | 45 kg | 約0.8 |
| 財布・帯・手袋 | 1470年代の男の財布1.5ペンス（Roddy、[Medieval Prices](https://www.yeoldetymenews.com/p/how-affordable-was-life-in-the-middle)） | 1点 約5 kg | 革の品 3.5 / 皮1枚 | 1,630 kg | 皮1枚から10〜20点として約15〜30 |
| 獣脂 1 kg | 13〜14世紀に12ポンドで約2シリング（Overton ほか、[ebrary](https://ebrary.net/303692/history/artificial_lighting)、OCRの読み取りは要確認） | 約15 kg | 獣脂 2 / 108 kg | 8.6 kg | 約0.6 |
| 日雇い1日 | 1〜1.5ペンス | 約3〜5 kg | | 約1 kg | 約0.2〜0.3 |

## 4. 読み取り

1. 材料（獣脂・蜜蝋・皮）の基の値は、史料と同じ桁である。
2. 作った品は高すぎる。長靴は約8倍、革の品は約15〜30倍。
3. 蝋燭の基の値14は、蜜蝋の蝋燭の値段（穀物約66 kg / kg）と合う。家の灯りの獣脂の蝋燭（約11 kg / kg）の約6倍である。蝋燭が一つの品で、作り方が油・蜜蝋・獣脂のどれでも同じ値になっている。
4. モデルの賃金は、穀物で史料の約1/4〜1/5である。品が高すぎることと合わせ、靴1足は史料で日雇いの約4日分、モデルで約160日分になる。
5. 基の値で、農村の人1人年の長靴・革の品・蝋燭の代金は0.665荷車（穀物約310 kg）で、モデルの賃金の1年分を超える。史料の値段では約35 kg（日雇いの年の入り約1.2 tの約3%）である。

## 5. 直す案（次の設計）

1. 長靴の基の値を7から約1（20足で穀物約400 kg）へ。
2. 革の品の基の値を3.5から約0.2（皮1枚の品で穀物約100 kg）へ。
3. 蝋燭を、家の灯りの獣脂の蝋燭（新しい品、100 kgで約2.4）と、蜜蝋の蝋燭（今の蝋燭、14のまま、教会と貴族）に分ける。家と農村の需要は獣脂の蝋燭に置く。
4. 基の値は、品の代わりの値段・交易・贅沢の需要にも使われるため、設定で今の値も選べるようにする。

### 5.1 実装（設定`householdGoodValues`）

- `historical`（既定）で長靴1・革の品0.2・蝋燭2.4、`legacy`で今の7・3.5・14（[householdGoodValues.ts](../../src/extensions/economy/generators/householdGoodValues.ts)）。毎月の値付けの初めに当て、品の値がもう一方の既定のままの時だけ替える。品の編集で変えた値は残る。
- 蝋燭を獣脂の蝋燭と蜜蝋の蝋燭に分けること（案の3）は、品の目録・交易・需要の割り当てに広く触れるため後に回した。それまでは蝋燭全体を獣脂の蝋燭の値とし、教会と貴族の蜜蝋の蝋燭も安くなる（§6の5）。
5. 賃金がモデルで約1/4〜1/5なのは別に調べる（農村の入り・家族の扶養の数え方）。

## 6. 未確定事項

1. 14世紀の小麦の値段（Clark）、獣脂の値段（OCRの読み取り）の確認。
2. 革の品の1点の値と、皮1枚から作る点数。
3. 賃金の穀物の量（1人年300 kg）と、史料の日雇いの年の入り（約1.2 t）の違いの扱い。
4. 基の値を下げた時の、作り手の利幅（材料の値と手間に対して）。革の品は皮0.16と手間で約0.17、0.2との差が小さい。
5. 蝋燭を獣脂の蝋燭と蜜蝋の蝋燭に分けること。

## 7. 結果

[household-goods-values-20261112.md](../analytics/household-goods-values-20261112.md)。長靴は見込みの需要の約96%、蝋燭は約100%、革の品は約79%を満たした（2102、3年目）。革の在庫の増えは年約90万から約14万になり、値段は下限から離れた。獣脂はまだ出た量の約6割が積み上がる。町の家計は約2倍になった。
