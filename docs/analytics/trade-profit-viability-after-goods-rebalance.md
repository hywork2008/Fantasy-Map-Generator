# Trade Profit Viability After Goods Value Rebalance

## Summary

`src/extensions/economy/generators/goods-generator.ts` の価値修正後、現在の交易利益は大商会・個人商会のどちらも支えられる水準に見える。

ただし、これは `value 1 = Grain 1 wain`、つまり「1人日」ではなく「荷車単位の会計価値」と読む前提である。`value 1 = 1人日` と読むと、個人商会は厳しく、大商会も市場支配率が高くないと不足する。

## Assumptions

- 修正済み `GOODS_DATA` 全品目を使用
- 8市場モデルで試算
- 現在の輸送費式を使用
- 商会交易距離は400km上限
- `Production.produce()` は現状おおむね30日ごとに再実行される
- `Deal.accountingPeriodDays` の週次・月次メタデータも別換算で確認

## Estimated Trade Profit

| Case | Deals | Cargo value | Profit per cycle | Current monthly execution / year | Weekly/monthly metadata / year |
|---|---:|---:|---:|---:|---:|
| Natural price spread | 710 | 21,432.65 | 13,611.88 | 163,342 | 413,207 |
| Flat prices with speculative fallback | 721 | 24,557.01 | 4,315.37 | 51,784 | 122,753 |

The most profitable goods after the value rebalance were:

- Perfume
- Artillery
- Coins
- Jewelry
- Elephants
- Gunpowder
- Spices
- Ships
- Gemstones
- Silk
- Books

The rebalance makes high-value, compact, rare, and military goods carry the upper end of trade profit, which is the intended behavior for medieval-style commerce.

## Major Merchant Company

A major merchant company appears viable.

If the whole 8-market economy produces roughly `51,784` to `163,342` value per year under current monthly execution, then a major company taking only `5%` to `15%` of that flow gets about:

| Market share | Low case / year | High case / year |
|---:|---:|---:|
| 5% | 2,589 | 8,167 |
| 10% | 5,178 | 16,334 |
| 15% | 7,768 | 24,501 |

That is enough for a regional major company if `value` is interpreted as wagon-scale accounting value. It can plausibly cover merchants, agents, scribes, guards, carts, warehouse costs, bribes, losses, and capital risk.

This should not be read as one company taking the entire trade profit. The expected model is that major, regional, local, and individual merchants split the economy's trade opportunities.

## Individual Merchant Company

An individual merchant company also appears viable, but only in a narrow route-focused form.

Average profit per deal:

| Case | Profit / deal |
|---|---:|
| Natural price spread | about 19.2 |
| Flat prices with speculative fallback | about 6.0 |

If one individual trader can reliably handle one average route per monthly production cycle, annual profit is roughly:

- Flat fallback case: `6.0 * 12 = 72`
- Natural spread case: `19.2 * 12 = 230`

That can support a small personal operation if maintenance is around `10` to `60` value per year. It is not enough for a large staffed organization, but it is enough for a single merchant, family shop, or small local partnership.

Low-value goods such as grain, stone, and bulky raw materials are weak as personal-company profit sources. Salt, honey, cloth, leather, drink, and compact luxury goods are more plausible.

## Conclusion

Population inflation or an additional global accounting multiplier is not required just to make merchant companies viable after the goods value rebalance.

The remaining design issue is not total profit. It is distribution:

- major companies should receive access to long-range and high-capital routes
- regional companies should receive normal city-to-city opportunities
- local and individual merchants should receive short-range, rural, and neglected routes
- tiny rural endpoints should remain less attractive to major companies

The next useful model would be explicit profit allocation by merchant organization scale rather than increasing population or raw trade volume.
