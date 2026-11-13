# 穀物の掛けを四季の支払日に返す

## 1. 背景

[harvest-cash-reserve.md](harvest-cash-reserve.md) §4の続き。

- 町のお金は5〜9月に約35%減り、石鹸などの職人が材料を買えなかった（[soap-summer-20261109.md](../analytics/soap-summer-20261109.md)）。
- 市場は、収穫を現金と掛け（`ruralGrainPayable`）で買う。掛けは、穀物の売り上げ（`settleUrbanRevenue`）と毎月の払い出しの手順（`payOutMarketSurplus`）で、他の払いより先に農家へ返す。2年目は5月〜翌1月に約21万を返し、市場のお金は夏に尽きる（[market-payout-20261109.md](../analytics/market-payout-20261109.md)）。
- 市場は町の産物を、市場のお金の分だけ現金で買う（`allocateMarketProcurementBudgets`）。市場のお金が尽きると委託で預かり、町のお金は秋まで戻らない（[market-cash-20261109.md](../analytics/market-cash-20261109.md)）。
- 農家の財布は95万〜113万あり、毎月5%を町で使う。町へ戻るお金に季節の波は無い（[rural-purse-20261109.md](../analytics/rural-purse-20261109.md)）。

## 2. 史料

- 近世のイングランドでは、商いのほとんどが掛けで行われ、勘定は決まった日に合わせた（Muldrew, *The Economy of Obligation*, 1998、[craft-book-credit.md](craft-book-credit.md) §2）。
- 地代、奉公人の給金、多くの借りは四季の支払日（Quarter days）に払った。聖母受胎告知日（3月25日）、夏至の日（6月24日）、ミカエル祭（9月29日）、クリスマス（12月25日）である（[Wikipedia: Quarter days](https://en.wikipedia.org/wiki/Quarter_days)）。
- 穀物の商人が農家への代金を支払日にまとめて払ったと書いた史料は見つけていない。

## 3. 決めた仕組み

[marketSettings.ts](../../src/simulation/marketSettings.ts)の`grainRepayment`（Simulation settingsの「穀物の掛けの返済」）。

- `quarterDays`（既定）：市場は、穀物の掛けを3月・6月・9月・12月だけに返す（`isGrainRepaymentMonth`）。その月は、今と同じく穀物の売り上げと払い出しの手順で、他の払いより先に返す。
- `monthly`：今までの形。毎月、先に返す。
- 支払日の間は、穀物の売り上げが市場のお金に入り、町の産物を現金で買う分になる。
- 農家の財布に入るのが支払日まで遅れる。農家の財布は大きいので、農家の町での買い物はほとんど変わらないと見込む。
- 市場の掛け（[craft-book-credit.md](craft-book-credit.md)）と塩の買い（`saltMarketCash`）は、今と同じく穀物の掛けを除いた分で決める。

## 4. 計測

[grain-quarter-day-20261109.md](../analytics/grain-quarter-day-20261109.md)。北緯30°の地図2枚、24か月。

- 13〜24か月目の町の石鹸の需要を満たした割合は56.8%→60.7%（2102）、59.2%→63.4%（2103）。
- 2年目の町のお金の4〜9月の減りは37%から24%になった。支払日の間の月は市場のお金が5〜6万残り、町の産物を現金で買う。
- 穀物の掛けは返し切らずに一年中10万〜25万残る（2年目の1月で約9.9万、baseは1万未満）。
- 既定を`quarterDays`とした。

## 5. 未確定事項

1. 穀物の商人の払いの時期。支払日にまとめた史料は無い。
2. 支払日に市場のお金が足りない時。返せない分は掛けに残り、`FARMGATE_PAYABLE_YEARS`の上限で消える。計測では掛けが一年中残った。農家の財布と、上限で消えた額は計っていない。
