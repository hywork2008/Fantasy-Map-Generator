# 干し草（Fodder）の値（2026-11-16）

## 1. 問い

足りない月の飼料の予算を決める時（[livestock-feed-shortfall.md](livestock-feed-shortfall.md) §10.1）に、市場の干し草が、1 kgあたり穀物の約4.5倍の値だと分かった。歴史では干し草の方が安いはずで、値の付け方を調べた。

## 2. 理由

財の値（`goods-generator.ts`）の置き方による。値段の計算は、穀物も干し草も同じ「値×需給」なので、違いは値から来る。

| 財 | 単位 | 値 | 1 kgあたり |
| --- | --- | --- | --- |
| Fodder | 1俵 200 kg | 1 | 0.0050 |
| Oats | 1荷 465 kg | 0.85 | 0.0018 |
| Wheat | 1荷 465 kg | 1.2 | 0.0026 |

- 干し草の値1には、根拠の記録が無い。財の単位を俵（200 kg）にした時（goods-physical-units.md）に、値を直していない。
- 市場の値段は、干し草の売り値で1ロット0.45〜1.0だった（[hay-trade-modes-20261101.md](../analytics/hay-trade-modes-20261101.md) §5）。値段で比べても、干し草は乾物1 kgあたり燕麦の約1.5〜3倍である。

## 3. 歴史の値

Thorold Rogersの1259〜1400年の平均（Curtler, *A Short History of English Agriculture*, 付録の価格表）：

- 干し草1 load 3s 8d（44d）、燕麦1 quarter 2s 5¾d（29.75d）、小麦1 quarter 5s 10¾d（70.75d）。
- 1 loadを約915 kg（36 trusses×56 lb、後の時代の決まり。中世のloadはばらつく）、燕麦1 quarterを約140 kg（8 bushels×約38 lb）、小麦1 quarterを約218 kg（8×60 lb）とした。
- 1 kgあたり：干し草0.048d、燕麦0.21d、小麦0.32d。燕麦は干し草の約4.4倍、小麦は燕麦の約1.5倍である。

ゲームの穀物どうしの比（小麦は燕麦の1.41倍）は、歴史（1.5倍）とほぼ合う。干し草だけが外れていて、歴史の比に合わせると、干し草の値は1俵あたり約0.08（今の約12分の1）になる。

## 4. 案（まだ入れていない）

1. 設定で、干し草の値を「歴史の比（燕麦の4.4分の1、1俵約0.08）」と「前の値1」から選べるようにする。
2. 影響が広い。次を先に数える。
   - 干し草の売り買いの値段（`getFodderClearingPrice`）と、農家の飼料の月の予算（5%）で買える量。値が12分の1になると、同じ予算で約12倍買える。
   - 市場の干し草の買い上げで、市場の金庫から農村に入るお金（[hay-trade-modes-20261101.md](../analytics/hay-trade-modes-20261101.md) §5で、年に10万前後）。
   - 軍の飼い葉の代金（`militaryLogistics.ts`の`FODDER_GOOD_VALUE = 1`）。
   - 足りない月の予算の値打ちの比べ方（§10.1）。干し草が穀物より安くなるので、干し草を先に買う順にする。
3. 1 loadの重さは、中世の史料で確かめる。

## 5. 根拠

- Curtler, W. H. R., *A Short History of English Agriculture* (1909), Appendix（Thorold Rogersの平均価格）：https://www.gutenberg.org/files/16594/16594-h/16594-h.htm
- Thorold Rogers, *A History of Agriculture and Prices in England*, vol. 1（1259〜1400）。

## 6. 入れたもの（2026-11-16）

1. 設定`fodderValue`：`historical`（既定、1俵0.08）・`legacy`（1）。市場の値段の計算の始め（`initializeMarketPrices`）で、Fodderの値が他方の既定の値の時だけ切り替える。財の編集で変えた値は残す（`householdGoodValues`と同じ形）。
2. 騎兵の飼い葉の代金（`militaryLogistics.ts`）は、この設定の値を使う。
3. 売る手前の家畜の餌（[livestock-feed-shortfall.md](livestock-feed-shortfall.md) §10.1）は、その市場で干し草の乾物1 kgが、最も安い飼料の穀物の干し草換算より安ければ、干し草を先に買う。

見込み：干し草の値段は約12分の1になる。月の予算（5%）で買える干し草が増え、在庫がありながら予算で止まっていた市場（2102の市場24・32）の不足が埋まる。4月の不足は0.10%より下がる。干し草の売り買いのお金は約12分の1になり、農村と市場のお金は数%動きうる。

結果（[記録](../analytics/fodder-value-20261116.md)）：値段は6〜14分の1、農家の買う干し草は5〜10倍。2102の2年目4月の不足は6.43→2.13百万kg（0.05%）、3年目4月の売る土地は2→0。持ち手のお金の差は0.9%以内。
