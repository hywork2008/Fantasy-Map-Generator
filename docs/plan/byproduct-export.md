# 皮と獣脂を地図の外へ

## 1. 背景

[currying-tallow-20261112.md](../analytics/currying-tallow-20261112.md)で、革の仕上げを入れた後も、獣脂は出た量の約半分（地図2102で年約24万樽）が積み上がり、値段は下限（基の値の0.25倍）のままだった。革も年約14万枚増える。[byproduct-history.md](byproduct-history.md) §4で、中世の北の国々では、皮と獣脂を地図の外（低地地方など）へ売ることが大きな出口だったと読んだ。

今のモデルで物が地図の外へ出るのは、国の海軍の船の交易（[navyTrade.ts](../../src/extensions/economy/generators/navyTrade.ts)、`navyExport`）だけで、獣脂は年約1.5万樽である。遠方諸国（[distant-realms-overseas-trade.md](distant-realms-overseas-trade.md)）の遠征は、国庫の定額の出入りで、物の量を運ばない。

## 2. 史料

- スコットランドは、羊毛・羊の毛皮・皮の輸出を指定の港（ステープル、低地地方）に通させ、毛織物・ワイン・作った品を入れた（[Scottish Staple](https://en.wikipedia.org/wiki/Scottish_Staple)、[The Flemish on the Firth of Forth](https://flemish.wp.st-andrews.ac.uk/2014/09/26/the-flemish-on-the-firth-of-forth-part-1/)）。ジェームズ4世のころ、輸出はほぼ羊毛・皮・毛皮・鮭だけだった（[Scotland in the Middle Ages](https://www.electricscotland.com/history//middleages/chapter8.htm)）。
- アイルランドは13世紀末に年40万〜45万枚の皮を輸出できた。ゴールウェイで皮をワイン・蜂蜜・塩と替えた（[Trade (Medieval Ireland)](http://what-when-how.com/medieval-ireland/trade-medieval-ireland/)）。
- 18世紀のコークは、皮（年6.4万ポンド）・獣脂（2万ポンド）を牛と並べて輸出した（Young）。
- 皮と獣脂は、物々の交易の荷であった。出す荷の値で、入れる荷が決まった。

## 3. 決める仕組み（案）

### 3.1 誰が、何を、どれだけ出すか

- 港のある市場（市場の町に港がある）が、毎月、副産物（革・獣脂、`SLAUGHTER_BYPRODUCTS`の凝乳酵素は除く）の在庫のうち、その市場の使い道（3年目の月の使った量の平均、作り方の材料・町の需要）の`byproductExportReserveMonths`か月分（既定6）を超えた分を、外の商人に売る。
- 1か月に出すのは、超えた分の`byproductExportShare`（既定0.2）まで。船の荷の枠（`MerchantTransportAssets`）の空きでも抑える。
- 港の無い市場の余りは、今の国内の交易で港の市場へ運ばれる分だけが出る（新しく運ぶ仕組みは置かない）。

### 3.2 代わりに入るもの

- お金は地図の外から入れない（海軍の交易と同じく、物と物を替える）。
- 出した荷の値（その市場の値段 × 量）の分、外の品を入れる。入れる品は、その市場で基の値より高く売られ、在庫が需要より少ない品（作った品と贅沢の品、食べ物は除く）から、値段の高い順に選ぶ。毛織物・ワインに当たる品が無い時は、遠方諸国の特産品から選ぶ（§6の2）。
- 入れた品は、その市場の在庫に入り、今の決まりで町と農村に売られる。市場のお金は、入れた品が売れた時に入る。

### 3.3 値段

- 出した分は、在庫が減るので、副産物の値付け（[byproduct-prices.md](byproduct-prices.md)）で値段が上がる。外の買い手の値段は置かず、その市場の値段で替える（下限の値段のままなら、入る品は少ない）。

## 4. 釣り合いの見込み（2102）

- 港の市場の数と在庫の分け方で決まるため、測ってから決める。地図の市場の約半分が港として、獣脂の積み上がり（年約24万樽）の多くは出せる見込み。
- 下限の値段（獣脂1樽0.5）で24万樽を出すと、入る品の値は年約12万（基の値の物差し）で、市場のお金（約100万）に比べて小さい。

## 5. 設定

| 設定 | 既定 | 意味 |
| --- | --- | --- |
| `byproductExport` | `staple` | `staple`（3）か`off`（今の決まり） |
| `byproductExportReserveMonths` | 6 | 市場に残す、使い道の月数 |
| `byproductExportShare` | 0.2 | 1か月に出す、超えた分の割合 |

## 6. 未確定事項

1. 港の無い市場の余り。国内の交易で港へ運ばれるかを測ってから、運ぶ仕組みを置くか決める。
2. 入れる品の選び方。毛織物・ワインに当たる品を地図の外の物として置くか、今の品から選ぶか。
3. 外の買い手の値段。中世の皮の値段（Thorold Rogers）が分かれば、下限より高い外の値段を置く。
4. 船の荷の枠を、地図の中の隊商と分け合うか。
5. 羊毛（Wool）など、他の輸出の品を同じ仕組みに入れるか。

## 7. 結果

[byproduct-export-20261112.md](../analytics/byproduct-export-20261112.md)。実装は[byproductExport.ts](../../src/extensions/economy/generators/byproductExport.ts)で、船の荷の枠で抑えることは入れていない。獣脂を年約27万樽（2102）外へ出し、在庫は2年目から減りに転じた。革は港の市場で在庫の増えが半分になったが、港の無い市場の分が残る（§6の1）。入った品に、時代に無いコーヒー・ココア・茶と、地図の中で作る蝋燭が入ったため、選び方を直す（§6の2）。お金の持ち手ごとの額は、差が1%以内だった。
