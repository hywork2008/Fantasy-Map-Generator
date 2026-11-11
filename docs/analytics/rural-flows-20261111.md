# 農村の家計のお金の出入り（2026-11-11）

[money-holders-20261110.md](money-holders-20261110.md)で、農村の家計がお金の合計の約40%を持つようになった。その出入りを、払いの元ごとに測った。

## 1. 条件

- 地図は北緯30°の2枚（2102・2103、[barilla-20261108.md](barilla-20261108.md)）、24か月、戦争なし・隊商の略奪なし。
- コード: コミット0c0ca6927（money-holders-20261110と同じ）。凍結したworktreeで動かした。
- スクリプトは[flows.mts](rural-flows-20261111/flows.mts)、実行は[run.sh](rural-flows-20261111/run.sh)、集計は[sum.py](rural-flows-20261111/sum.py)。
  - 農村の家計の財布への入りと出（`creditRuralHouseholdWealth`・`debitRuralHouseholdWealth`、[householdWealth.ts](../../src/extensions/economy/generators/householdWealth.ts)）を、観測のフックで一つずつ取り、呼んだ関数ごとに月で足した。
  - 財布の月の増減から観測した分を引いた残り（フックを通らない書き込み）は、どの期間も入りの0.2%未満だった。

## 2. 入りと出（千）

財布は1〜9か月目に、2102で435から1,763、2103で180から988に増えた。2年目（13〜24か月）は、どちらもほぼ横ばいだった。

| | 2102 1〜9か月 | 2102 2年目 | 2103 1〜9か月 | 2103 2年目 |
| --- | ---: | ---: | ---: | ---: |
| 入り：国の公共の支出（`payStateHouseholds`、税の後） | 984 | 301 | 428 | 142 |
| 入り：国の行政の費用（`payStateHouseholds`、行政） | 48 | 65 | 24 | 32 |
| 入り：市場が農家に払う穀物の代金（`settleFarmgatePayment`） | 650 | 470 | 460 | 324 |
| 入り：市場が払う未払い分（`settleUrbanRevenue`） | 88 | 190 | 55 | 113 |
| 入り：市場の余りの払い出し（`payOutMarketSurplus`・`payMarketWages`） | 442 | 303 | 284 | 148 |
| 入り：肉（`sellMeat`） | 147 | 174 | 91 | 95 |
| 入り：薪（`settleMonthlyHeating`） | 55 | 79 | 35 | 49 |
| 入り：飼い葉を売った（`buyFeed`） | 223 | 551 | 123 | 367 |
| 入りの合計 | 2,641 | 2,140 | 1,501 | 1,274 |
| 出：町で使う（`spendRuralHouseholdsInTowns`） | 600 | 1,059 | 325 | 614 |
| 出：飼い葉を買った（`buyFeed`） | 224 | 554 | 123 | 369 |
| 出：塩（`saltLogistics`・`saltFinance`） | 153 | 214 | 69 | 99 |
| 出：布・織物（`textileDemand`・`textileCommissions`・`ruralTextileProduction`） | 242 | 184 | 128 | 107 |
| 出：税（`collectTaxes`） | 89 | 121 | 45 | 61 |
| 出：市場から買う食べ物（`settleMonthlyFoodConsumption`） | 0 | 82 | 0 | 44 |
| 出の合計 | 1,310 | 2,215 | 692 | 1,294 |

飼い葉は、農村の家計どうしの売り買いで、入りと出がほぼ同じである。

## 3. 読み取り

1. 1年目の財布の積み上がりの最も大きな元は、国の公共の支出である。
   - 国は、蓄えの目標を超えた国庫を払い出す（[taxes-generator.ts](../../src/extensions/economy/generators/taxes-generator.ts)の`payStateHouseholds(state.i, spend)`）。その多くは、農村の人口の割合で農村の家計に入る。
   - 1〜9か月目に、農村の家計が国に納めた税は、国から受け取った額の約1割だった（2102で89と1,032、2103で45と452）。
   - 国庫の1年目の約4割の減り（money-holders-20261110 §5の3）も、これで説明できる。
2. 次に大きいのは、市場からの入りである（穀物の代金、未払い分、余りの払い出し）。1年目の市場のお金の約8割の減りと重なる。
3. 主な出口は、町で使うお金（財布の毎月5%、`RURAL_HOUSEHOLD_TOWN_SPEND_SHARE`）である。
   - 割合で決まるため、財布は「毎月の入り ÷ 5%」、つまり約20か月分の入りの所で釣り合い、そこで止まる。2年目に横ばいになったのは、この釣り合いに着いたためである。
   - 町で使う量は、値段も、町に買う品があるかも見ない。
4. 塩・布・税・食べ物の出は、合わせても入りの2〜3割である。
5. このため、お金は消えていないが、合計の約4割が、毎月5%ずつしか使われない財布に溜まる。町と市場が回すお金は、その分少ない。

## 4. 次に調べること・直す候補

1. 農村の家計が町で使う量を、財布の固定の割合ではなく、買いたい品と値段で決める（町の品の需要として、市場の品を買う）。[drink-price-allocation.md](../plan/drink-price-allocation.md)の値段による配分と同じ形にできる。
2. 国の公共の支出の行き先。町と農村への分け方と、蓄えの目標（`reserveTarget`）が1年目に国庫の約4割を払い出す大きさで良いか。
3. 市場の3・6・9・12月の大きな出（money-holders-20261110 §5の2）。市場の余りの払い出しが四半期ごとなら、これが元である。

## 5. 出力のSHA-256

docs/analytics/raw/rural-flows-20261111/

| ファイル | SHA-256 |
| --- | --- |
| flows-2102.json | 83d58378508ca4d978b3c21ca621b4eeb9441dd63ef0fbcdec12f158d05c556a |
| flows-2103.json | 2cfdfeaf3da54cb7e61f0951da71c6267e0d830331b89afc2147f6a9cbfbcb77 |
