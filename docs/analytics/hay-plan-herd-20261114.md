# 干し草を冬を越す頭数のために作る（計測）

設計：[hay-plan-herd.md](../plan/hay-plan-herd.md)

## 1. 条件

- 地図2103（北緯30°）、36か月、戦争なし・隊商の略奪なし。HEAD 4f27d2bd5に今回の変更（`herdOfftakeSpread` toRenewal、`byproductFarmgate` payを含む）。
- `hayPlanHerd` wintered（既定）。比べる先は[herd-feed-20261114.md](herd-feed-20261114.md)のtoRenewal（`hayPlanHerd` currentと同じ）。
- [run.sh](hay-plan-herd-20261114/run.sh)。記録は[herdfeed.mts](herd-feed-20261114/herdfeed.mts)と[holdersteps.mts](herd-offtake-spread-20261114/holdersteps.mts)。

## 2. 餌の足りない量（要る量に対する割合・足りない土地の数 / 2,813、干し草の蓄え / 1か月の要る量）

| か月目（暦の月） | current | wintered |
| --- | --- | --- |
| 13（2月） | 2.43%・259、1.22 | 2.56%・266、1.63 |
| 14（3月） | 15.40%・1,051、1.08 | 11.62%・662、1.47 |
| 15（4月） | 0.79%・283、1.12 | 0.68%・195、1.51 |
| 25（2月） | 1.16%・155、1.25 | 1.22%・174、1.69 |
| 26（3月） | 10.51%・1,043、1.08 | 6.45%・615、1.48 |
| 27（4月） | 0.21%・104、1.12 | 0.23%・117、1.52 |

- 頭数は変わらない（36か月目の牛5.34 → 5.37百万頭）。

## 3. 過去の記録との関係

- [e1-hay-births-20261028.md](e1-hay-births-20261028.md)で、干し草の計画を出生後の頭数で立てる試しは効果が無かった。刈り取りは計画ではなく、干し草の月の人手で止まっていた（[e1-feed-shortage-20261026.md](e1-feed-shortage-20261026.md)）。
- 今回は効果が出た。[herd-offtake-spread.md](../plan/herd-offtake-spread.md)で1年の売り方を変え、夏の頭数が養える数の約6〜7割まで下がるようになったため、今の頭数での計画と冬の頭数の差が、前より大きくなったと見られる。

## 4. 読み取り

1. 干し草の蓄えは全体で約35%増え、3月の不足は約4割減った（足りない土地も約4割減）。
2. それでも3月に要る量の6〜12%が、約600の土地で足りない。全体の蓄えは1か月の要る量の約1.5倍あるので、残る不足は土地の間の偏りか、干し草の月の人手の上限（10月の結論）による。どちらかは確かめていない。
3. 2月と4月は変わらない。

## 5. 出力のSHA-256（docs/analytics/raw/hay-plan-herd-20261114/）

- d8cd9021bef5871cd5d2c944d7af1cf3c5c845c61b9029a896be51b852bfd558  herdfeed-wintered-2103.json
- b629fd6c71c013aa3134bef0a0893366292b1025cb6e02ed9bcabcf511128bcb  holders-wintered-2103.json
