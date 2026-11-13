# 余った皮と獣脂の傷み

## 1. 背景

皮と獣脂の使い道（[leather-uses.md](leather-uses.md)・[candle-demand.md](candle-demand.md)・[currying-tallow.md](currying-tallow.md)）と、地図の外へ出す出口（[byproduct-export.md](byproduct-export.md) §7.3・§7.4）を置いた後も、獣脂は地図2102で年約18万樽、革は年約10万枚積み上がる（[salt-displacement-20261112.md](../analytics/salt-displacement-20261112.md) §8）。物と物を替える限り、地図で作れない品の需要が出せる量の上限になる。値段は下限（基の値の0.25倍）に張り付き、市場の在庫は限りなく増える。

## 2. 史料

- 中世の皮革職人は、夏に多くの皮や毛皮が傷み、それを肥料や膠に使った（竹之内一昭、[leather-uses.md](leather-uses.md) §3）。
- 獣脂は樽に詰めて持ったが、空気と温みで酸っぱく（腐敗臭が出て）なり、蝋燭や石鹸に向かなくなった。量の史料はまだ無い（§6の1）。

## 3. 決める仕組み

- 毎月、全ての市場で、革と獣脂の在庫のうち、その市場の使い道（[byproductExport.ts](../../src/extensions/economy/generators/byproductExport.ts)の`byproductUse`、月の使った量の均した値）の`byproductKeepMonths`か月分（既定12）を超えた分の`byproductExcessSpoil`（既定0.1）が傷み、`spoilage`として在庫から出る。
- 傷んだ分は使い道に数えない（均した使い道の式で、出した量と同じに引く）。
- 地図の外へ出す出口の後ではなく前に当てる。港の市場は、残った在庫から出す。
- 夏の皮の傷み（`summerHideLoss`）はそのまま残す。
- 肥料と膠の品は今は無いので作らない（[leather-uses.md](leather-uses.md) §8の3）。

在庫が使い道の12か月分を超えると、超えた分は月10%で減り、使い道の約12か月分 + 月の積み上がりの約10か月分のあたりで止まる。

## 4. 設定

| 設定 | 既定 | 意味 |
| --- | --- | --- |
| `byproductKeepMonths` | 12 | 市場が持つ、使い道の月数 |
| `byproductExcessSpoil` | 0.1 | 超えた分の月の傷み。0で傷まない（今の決まり） |

## 5. 計測の計画

北緯30°の地図2枚、36か月。[salt-displacement-20261112.md](../analytics/salt-displacement-20261112.md) §8のluxury（2102）と比べる。革・獣脂の在庫と傷み、値段、長靴・革の品・蝋燭の作った量。

## 6. 未確定事項

1. 獣脂がもつ月数の史料。
2. 肥料と膠の品。
3. 値段が下限に張り付いたままのこと。在庫が止まれば、値付け（[byproduct-prices.md](byproduct-prices.md)）で値段が戻るかを見る。

## 7. 結果

[byproduct-disposal-20261113.md](../analytics/byproduct-disposal-20261113.md)。獣脂の在庫は2年目から止まり、出た獣脂の約5割が余って傷む（2102で年約23万樽）。革は使い道が大きく、在庫が12か月分に届かないため傷まない。獣脂の値段は下限のままである。長靴・蝋燭の作った量とお金は、差が1%以内だった。
