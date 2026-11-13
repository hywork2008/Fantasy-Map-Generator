# 収穫の準備金（市場が収穫の買い取りのお金を残す）

## 1. 背景

[craft-book-credit.md](craft-book-credit.md) §5の5の続き。

- 町のお金は5〜9月に約35%減り、石鹸などの職人が材料を買えなかった（[soap-summer-20261109.md](../analytics/soap-summer-20261109.md)）。
- 市場のお金は2月の37万から7月の0.3万へ減った（[market-cash-20261109.md](../analytics/market-cash-20261109.md)）。
  - 市場は5〜7月に、農村の収穫を合わせて約35万で買い取る（`food:production`の`settleFarmgatePayment`）。
  - 市場は、町の人の数で決めた蓄え（`surplusReserveFactor` 0.25）を超えるお金を、毎月商人に払い出す（`payOutMarketSurplus`）。2〜4月にも月5.6〜7.1万を払い出していた。
  - お金が尽きた市場は、6月から町の産物を現金で買えず委託で預かり、町のお金は9〜1月の委託の払いまで戻らない。
- 市場の蓄えに、次の収穫の買い取りの見込みが入っていない。

## 2. 史料

- 18世紀のイングランドでは、小さな農家は収穫の直後に穀物を脱穀して売り、地代と借りを払った。そのため9月からクリスマスまで値段が安かった。中くらいの農家は春まで、富んだ農家は5〜8月まで持った（E. P. Thompson, "The Moral Economy of the English Crowd in the Eighteenth Century", *Past & Present* 50, 1971、[IAS](https://www.ias.edu/sites/default/files/sss/pdfs/Moral-Thompson.pdf)）。収穫の直後に売りが集まり、買い手はその時に現金が要った。
- 穀物の商人が収穫のために現金を蓄えた額や月数を書いた史料は見つけていない。

## 3. 決めた仕組み

[harvestCashReserve.ts](../../src/extensions/economy/generators/harvestCashReserve.ts)。

- 市場は、収穫を買い取るたびに、その月の買い取りの費用（現金と農家への借りの和）を暦の月ごとに覚える（`farmgateCostByMonth`）。
- 余りを払い出す前の蓄えに、これからの`harvestReserveMonths`か月（既定4、0〜12、0は使わない）の、1年前の同じ月の買い取りの費用を足す。Simulation settingsの市場の準備金の下にある。
  - 2〜4月の払い出しで、5〜7月の買い取りのお金が残る。収穫の後は、見込みが減り、残りを払い出す。
- 初めの1年は覚えた月が無いので、蓄えに入らない。

## 4. 計測

[harvest-reserve-20261109.md](../analytics/harvest-reserve-20261109.md)。北緯30°の地図2枚、24か月。

- 13〜24か月目の町の石鹸の需要を満たした割合は56.9%→56.8%（2102）、59.8%→59.2%（2103）で、変わらない。
- 1年目は覚えた月が無く、baseと同じ。2年目の2〜4月は、baseでも払い出しが月2〜4千で、準備金は4月の市場のお金を6千増やしただけだった。
- 春に市場のお金が大きく払い出されたのは1年目の初めの市場のお金（37万）だけで、2年目の市場のお金は収穫の買い取りと`marketPayout`（農家への掛けの返しを含む）で5〜8月に尽きる。
- 既定の4か月は残す。準備金は前の年の払いを見るだけで、初めの年と、掛けで買った年には効かない。

## 5. 未確定事項

1. 月数。収穫の前に現金を持った月数の史料が無い。
2. 初めの1年。覚えた月が無い間は、蓄えに入らない。作物の暦（`harvestProfile`）から見込むこともできる。
3. 市場の掛け（[craft-book-credit.md](craft-book-credit.md)）は、収穫の準備金からも貸す。
4. `marketPayout`の中身。穀物と干し草の掛けの返しと余りの払い出しの割合が分かっていない（計測§3）。
