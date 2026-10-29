# 都市と農村の世帯のお金の流れ（2026-10-29）

[unsold-harvest-household-store.md](../plan/unsold-harvest-household-store.md) §4の調べ。市場9・10などで都市の世帯の財布が尽きる原因を、「輸出の強い市場にお金が集まり、弱い市場の手持ちが尽きる」という仮説（利用者）で確かめた。

固定入力 `docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg` を、f3241c832に計測用の観測フック（`setHouseholdWealthFlowObserver`・`setRuralHouseholdWealthFlowObserver`、通常の実行では何もしない）を加えたコードで84か月進めた。都市（町ごと）と農村（市場ごと）の世帯の財布への入金と出金を、払った処理（モジュール・関数）ごとに市場・年で合計した（`scripts/auditUrbanMoneyFlows.mts`）。

    NODE_OPTIONS=--max-old-space-size=6144 node --import tsx scripts/auditUrbanMoneyFlows.mts docs/analytics/inputs/wet-pastoral-birth-20261029/world-102.fmg <output.json> 84

都市の財布が減る市場（9・10・1・2・11、都市の人14.2万）と、増える市場（6・5・4・21、12.6万）を比べた。値は1305年の12か月、都市の人1,000人あたり。

## 都市の世帯

| 経路 | 減る市場 | 増える市場 |
| --- | ---: | ---: |
| 食料を買う（`settleMonthlyFoodConsumption`） | −284 | −329 |
| **農村の世帯が町で使う（`spendRuralHouseholdsInTowns`）** | **+154** | **+389** |
| 町の中の支出の循環（`spendInBurg`） | +106 | +104 |
| 余りを使う（`spendUrbanHouseholdSurplus`） | −25 | −145 |
| 燃料（`heating`） | −45 | −63 |
| 手工業の賃金（`executeManufacture`） | +25 | +38 |
| 国の支払い（`payStateHouseholds`） | +35 | +28 |
| 隊商の運賃（`payFreight`） | 小 | +11 |

- **差を生むのは、交易でなく、後背地の農村が町で使うお金である。** 1,000人あたり154と389。手工業の賃金や運賃の差は10〜15にとどまる。

## 農村の世帯（同じ単位）

| 経路 | 減る市場 | 増える市場 |
| --- | ---: | ---: |
| 町で使う | −205 | −519 |
| **飼い葉・干し草を売る（`harvestLivestockForage`）** | **+64** | **+325** |
| 飼い葉を買う（`buyFeed`） | −126 | −166 |
| **塩を買う（`saltFinance`・`saltLogistics`）** | **−172** | **−37** |
| 都市の食料の代金の後払い（`settleUrbanRevenue`） | +175 | +221 |
| 市場の余りの分配（`payOutMarketSurplus`） | +130 | +182 |
| 収穫の代金（`settleFarmgatePayment`） | +106 | +121 |
| 燃料を町へ売る（`settleMonthlyHeating`） | 小 | +63 |

年ごとの推移（農村、都市の人1,000人あたり）:

| 年 | 飼い葉を売る 減る・増える | 飼い葉を買う 減る・増える | 塩を買う 減る・増える |
| --- | --- | --- | --- |
| 1301 | 228・370 | −123・−171 | −487・−426 |
| 1303 | 96・295 | −135・−182 | −248・−235 |
| 1305 | 64・325 | −126・−166 | −172・−37 |

- **仮説はおおむね当たっている。** 増える市場の農村は、飼い葉・干し草と燃料を売って外からお金を得る。減る市場の農村は、売れる余りが少なく（飼い葉の売りは228→64に減った）、塩と飼い葉を買う支払いが続く。外へ出たお金が戻らないので、農村が町で使えるお金が細り、都市の財布が尽きる。
- 増える市場は、塩の支払いが−426→−37に減った。塩を自分で賄えるようになったか、在庫を持ったためとみられる（未確認）。
- 「輸出の強いところは他から買う必要が無い」も、塩の支払いの減りに表れている。ただし、増える市場の農村も飼い葉を買っている（−166）ので、何も買わないわけではない。
- 隊商による商人の取引（商人の資本）は、世帯の財布の外にあり、今回は見ていない。

## 出力SHA-256

    99e584253d4383617408de60f09a89477d569aa2ab3687b44a6bca98f5d8678b  urban-money-flows-20261029/flows-84.json
