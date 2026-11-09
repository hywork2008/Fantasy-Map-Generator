# 職人の掛け（町のお金の季節の差を均す）

## 1. 背景

[town-soap.md](town-soap.md) §5の7の続き。

- 石鹸の買い物は、町の石鹸の需要の約6割まで増えた後、夏から秋に下がった（[soap-potash-20261109.md](../analytics/soap-potash-20261109.md)）。
- 町のお金（`burg.treasury`）は、5〜9月に約35%減り、石鹸と炭酸カリウムの職人が材料を買えなかった（[soap-summer-20261109.md](../analytics/soap-summer-20261109.md)）。
- 町のお金を動かすのは町の生産（`burgLoop`）で、2〜4月は月2〜3万の入り、6〜9月は月1.4〜3万の出。1月の屠畜の獣脂と革の売りが年の後ろへ減り、夏に羊毛の材料の買いが重なる。夏に作った品は、秋から委託で売れて戻る（[town-purse-20261109.md](../analytics/town-purse-20261109.md)）。
- 町の生産は、町のお金で払える材料と賃金の分しか作らない（`executeManufacture`）。季節の入りと出の差を均す蓄えや掛けが無い。

## 2. 史料

- 近世のイングランドでは、商いのほとんどが現金でなく掛け（信用）で行われ、貧しい家から富んだ家まで掛けの網の中にあった（Muldrew, *The Economy of Obligation*, 1998、[EH.Net の書評](https://eh.net/book_reviews/the-economy-of-obligation-the-culture-of-credit-and-social-relations-in-early-modern-england/)、[CLS Blue Sky Blog](https://clsbluesky.law.columbia.edu/2015/10/22/what-kept-pre-modern-credit-networks-afloat/)）。
- 勘定は四季の支払日（3月25日、6月24日、9月29日、12月25日）に行い、記録した（[Quarter days](https://en.wikipedia.org/wiki/Quarter_days)）。中世末の勘定（`reckoning`）は、値打ちを決め、掛けを整理し、返しを先へ延ばすのに使われた（[Reckoning and Economic Life in Late Medieval England, Past & Present 272](https://academic.oup.com/past/article/272/1/52/8119003)）。
- 多くの掛けは長く返されず、借り手が死ぬまで残るものもあった（Muldrew）。
- 1459年、ロンドンの獣脂の蝋燭職人エリアス・ワイモンドへの40シリングの借りは、洗礼者ヨハネの祝日（6月24日）に払うと記録された（[The Wars of the Roses, Tallow Chandler](https://thewarsoftheroses.co.uk/tallow-chandler/)、一般向けの解説）。
- 職人が材料を掛けで買った月数を書いた史料は見つけていない。

## 3. 決めた仕組み

[craftCredit.ts](../../src/extensions/economy/generators/craftCredit.ts)、[craftCreditSettings.ts](../../src/simulation/craftCreditSettings.ts)。

### 3.1 貸し手

- 職人に材料を掛けで売るのは、市場の商人である。市場のお金（`marketTreasury.balance`）が町のお金に貸し、町のお金が市場に返す。お金は市場と町の間で動くだけで、新しく生まれない。
- 市場が貸すのは、農家（穀物・干し草）、塩の作り手、町の委託の品に払う分を除いたお金（`getMarketLendableCash`）だけ。
- v1は町の家計の蓄え（12か月）を超える分から貸したが、その分が小さく効かなかった（§4）。

### 3.2 借りる額と返す額

- 町のお金が職人の仕事に払った材料と賃金を、町ごとに毎月記録し、ならす（最新の月の重み1/6）。
- 生産の前に、町のお金がこの月の払いの1か月分より少なければ、その差を借りる。借りの合計は、月の払いの`fmg-craft-credit-months`か月分（既定3、0〜12、0は掛けを使わない）まで。3か月は四季の支払日の1季。
- 月の入り（家計の支出、農村の支出）の後に、町のお金が月の払いの2か月分を超えた分を市場に返す（`production:craftCredit`）。
- 借りに利息は付けない。

## 4. 計測

[craft-credit-20261109.md](../analytics/craft-credit-20261109.md)。北緯30°の地図2枚、24か月。

- 掛けはほとんど効かなかった。石鹸は需要の55.8%から56.1%（2102）、57.6%から58.2%（2103）。町のお金の夏から秋の下がりの形は変わらない。
- v1（町の家計が貸す）: 町の家計の蓄えを超える分が少なく、貸せるお金が無い。
- v2（市場が貸す）: 石鹸は2102で56.9%、2103で59.8%（1.1〜2.2ポイント増）。市場のお金も2月の37万から7月の3,355へ減り、夏には貸せない（[market-credit-20261109.md](../analytics/market-credit-20261109.md)）。町の生産の入りが夏に出に変わるのは、市場のお金が尽きて町の産物を委託で預かるためと見られる。

## 5. 未確定事項

1. 掛けの月数。職人が材料を掛けで買った月数の史料が無い。
2. 利息。掛けに利息を付けていない。
3. 借りた町のお金は、職人の仕事のほか、町の需要の買い物（`fillDemand`）にも使われる。
4. 貸し手。→ v2で市場にした。市場のお金も夏に尽きる（§4）。
5. 市場のお金の減り。2〜7月に市場のお金がどこへ行くか（§4）。
