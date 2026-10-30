# 複数の国家にまたがる市場の塩の在庫の測定（2026-10-31）

[計画](../plan/salt-supply-calibration.md)§3.11。固定入力`docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg`、`FMG_CONFLICT_AUTONOMY=peace`。比較の基準は[地図の生成の直後の備えの測定](start-provisioning-20261030.md)。

| ファイル | SHA-256 |
| --- | --- |
| salt-shared-market-stock-20261031/pop-84.json | cdd4bb6359e97be359167a7d2f1e63419bd4c3ea8cfdde75a0aa3cbc74abe656 |
| salt-shared-market-stock-20261031/salt-48.json | 20b82d985bde21a18b48ce79a293d719966af5afcf64b9be62e26ae744c0434b |
| salt-shared-market-stock-20261031/saltlimit-12.json | 8b32bcd92d7c1b2f944ca5ddfee29ae36f37928caa61c0353e78c4478a9feef8 |
| salt-shared-market-stock-20261031/saltlimit.mts | 9a7b529040315df97e8b125820a31374daccdd8ee1febe0800bb5a70e75912a7 |
| salt-shared-market-stock-20261031/saltshare.mts | 7345dcb0443a85693d8b0f63b7cc9d6d60e62f7542fd9d8b2c0d3f3cd917d824 |
| salt-shared-market-stock-20261031/saltstate-12.json | b426bcaa1d9b453b91ffce2d4f584c2969a6025433e262c091ac829fa712a357 |
| salt-shared-market-stock-20261031/saltstate.mts | 5844b906f635add62bf4bdbb99afcaafc15e909dac7d48436997e1355ef29277 |
| salt-shared-market-stock-20261031/works-48.log | 98feea07700478eaf605170b2d07da4cb27c002297ab528c50a918df80e40f21 |

`saltlimit`・`saltstate`は修正の前の調査。`saltlimit.mts`は一時的に`saltLogistics.ts`・`saltProduction.ts`へ入れた計測の呼び出し（`globalThis.__saltDiag`、今は外してある）を読む。

## 1. 調査

- 製塩所の注文を止めた上限（12か月）: ほとんどが「その製塩所の月の能力を使い切った」。それでも能力は月11〜21千袋が空いていた。
- 国家ごと（`saltstate-12.json`）: 11か月目に、13の国家で生産が0なのに需要が満たされていなかった。注文が来ていなかった。
- 市場ごと（`saltshare.mts`、修正の前の最後の12か月の値段）:

| 最大の国家の人口の割合 | 市場 | 値段÷基準 |
| --- | --- | --- |
| 0.93以上（ほぼ1か国） | 3・8・11・14・15・16 | 0.99〜1.18 |
| 0.61〜0.82 | 2・4・9・10・12・17 | 1.25〜2.45 |
| 0.30〜0.46 | 1・5・6・7・13 | 0.93〜3.02 |

## 2. 結果

| 項目 | 前 | 後 |
| --- | --- | --- |
| 値段÷基準（人口の重み、1302-1〜1304-1） | 1.71〜1.86 | 1.07〜1.14 |
| 値段が基準の1.2倍以下の人口の割合 | 13〜23% | 81〜87% |
| 生産（月、1302〜1304年） | 約52千袋 | 65〜66千袋（需要約61千） |
| 市場の在庫の合計 | 85〜94千 | 144〜153千 |
| 家畜の塩の不足（1301-1・1304-1） | 19.0千・3.3千 | 8.6千・0.8千 |
| 都市の主食の充足 1304／1305 | 91.73／95.41% | 92.24／95.76% |
| 都市の人口 1307-1 | 582,208 | 590,117 |

- 最後の12か月の値段が高いのは市場4（1.81倍、1303年7月に0.74倍まで下がった）と、途中で立った市場25・26（在庫0から始まり、1304年に1.0倍前後）。
- 市場1は0.25〜0.8倍まで下がった（在庫1.0〜1.6万）。在庫が多すぎないかは後続で見る。
