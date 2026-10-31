# 塩の値段の持ち主と新しい市場への穀物・塩の移転の測定（2026-10-31）

[塩の計画](../plan/salt-supply-calibration.md)§3.12、[地図の生成の直後の備えの計画](../plan/start-provisioning.md)§4.1。固定入力`docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg`、`FMG_CONFLICT_AUTONOMY=peace`。比較の基準は[複数の国家にまたがる市場の塩の在庫の測定](salt-shared-market-stock-20261031.md)と、穀物は[地図の生成の直後の備えの測定](start-provisioning-20261030.md)§3。

| ファイル | SHA-256 |
| --- | --- |
| salt-price-ownership-20261031/food-ledger-24.json | 0d25c41d0747e446bc68982b638b425176a960a3f87fbe2d51b52f2250e08df2 |
| salt-price-ownership-20261031/foodledger.mts | 3472b96ce793d55dedaf37a5ccb5735834c9c5b4a00554ca639882aecc77e178 |
| salt-price-ownership-20261031/m1orders.jsonl | 41d298921f85f60fd3e701b51a29e759dc04b6290419ac21609591c900aa721d |
| salt-price-ownership-20261031/m1orders.mts | f10cb832b15ff734c46b9b48c5b767effa3ca1d2e434063bb9ae4cf9e5191506 |
| salt-price-ownership-20261031/m1price.mts | 99e334858394703327b9bc3aeb5ad4946e1da0ddbdc54a43cd817f1a574804bc |
| salt-price-ownership-20261031/m1states.mts | 491da54f718e6d49aca10abe63ff0871eb37b4c8b18de56348df5f8eb88f1645 |
| salt-price-ownership-20261031/pop-84.json | e4dd84cfa33a53fd649eb6c0e4d3789278cf13545475173215c4149a68045022 |
| salt-price-ownership-20261031/salt-48.json | fc0eb06ca6e0cc4f12f5a24ae7920bfd8818e5026602693100494b7d1a5999b0 |
| salt-price-ownership-20261031/salt1-36.json | 10e01aba97b99e4367a2cd6831a8b7bb746f60fbe003b514d5149e8d6df572c2 |
| salt-price-ownership-20261031/salt1.mts | 4cc8dc431cda76df40c7410365b64ae3281115d33de1730f49fb889f3152fbf6 |

`salt1`・`m1states`・`m1orders`・`m1price`は修正の前の調査。`m1orders.mts`は一時的に`saltLogistics.ts`へ入れた計測の呼び出し（`globalThis.__saltDiag`、今は外してある）を読む。

## 1. 調査

- 市場に数えられない人と家畜（`salt1-36.json`の`outside`）: 36か月とも0。不足の数字は、実際の市場での不足である。
- 市場1（7か国）: 国家ごとの注文の計算は正しく、7か国の需要の合計は月約6.5千袋、在庫1.4〜1.8万は約2.7か月分で、多すぎない（`m1orders.jsonl`）。塩の値段の式では基準の約1.15倍になるはずだった。
- 値段を書いた処理（`m1price.mts`、4か月）: `priceSalt` 4回、職人の仕入れ（`marketPurchases.ts`の`buyMarketGoods`）120回、商人の市場の間の交易（`markets-generator.ts`の`emitGlobalTradeDealsForGood`）1回。交易の1回で0.32から0.11に下がった。交易は塩の値付けの後に動くので、月末の値段は交易の押し下げた値になり、次の月の`priceSalt`はその低い値から8割を引き継いでいた。

## 2. 結果（塩、48か月）

| 項目 | 前 | 後 |
| --- | --- | --- |
| 値段÷基準（人口の重み、1301-1〜1304-1） | 1.07〜1.27 | 1.03〜1.09 |
| 値段が基準の1.2倍以下の人口の割合 | 63〜87% | 87〜100% |
| 市場1の値段÷基準（最後の12か月） | 0.80 | 1.14 |
| 生産（月、1301〜1304年） | 52〜66千袋 | 65〜67千袋（需要約61千） |
| 家庭の不足（1301-1） | 3.4千袋 | 0 |
| 家畜の不足（1301-1・1304-1） | 8.6千・0.8千 | 1.8千・0.5千 |

最後の12か月で基準の1.2倍を超えるのは、途中で立った市場25（1.21）・26（1.43）だけ。

## 3. 結果（新しい市場の穀物、24か月）

| 月 | 都市の不足（在庫）前 | 後 | 取り置きを下回る市場 前 | 後 |
| --- | --- | --- | --- | --- |
| 12 | 3,106 | 0 | 5/22 | 1/22 |
| 24 | 49 | 7 | 16/24 | 15/24 |

24か月目の7は新しい市場23（移す元の市場の在庫が取り置きを下回っていた）。

## 4. 都市の主食の充足（84か月）

| 年 | 前 | 後 |
| --- | --- | --- |
| 1301-1 | 98.76% | 99.93% |
| 1303-1 | 98.70% | 99.03% |
| 1304-1 | 92.24% | 92.91% |
| 1305-1 | 95.76% | 94.70% |
| 1307-1 | 96.70% | 97.32% |

1304年の落ち込みは残る。新しい市場の最初の月の不足が原因ではない。
