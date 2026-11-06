#!/bin/sh
# Ale and cask repricing (ale-cask-repricing.md §4): P1 maps of start-stock-20261105, raids off,
# peace. Run from a worktree with the change applied. First the four seeds with sellprobe (48 months),
# then town household income (incomeprobe, 24 months) and households paying for their goods
# (householdGoodsPayment "pay", 48 months) on 2101 and 2104.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/ale-cask-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
SELL=docs/analytics/cooper-funds-20261106/sellprobe.mts
INCOME=docs/analytics/household-income-20261106/incomeprobe.mts
mkdir -p $R/ale $R/ale-pay
for s in 2101 2102 2103 2104; do env $E npx tsx $SELL $M/world-$s.fmg $R/ale/sell-$s.json 48 > $R/ale/sell-$s.log 2>&1 & done; wait
for s in 2101 2104; do
  env $E npx tsx $INCOME $M/world-$s.fmg $R/ale/income-$s.json 24 > $R/ale/income-$s.log 2>&1 &
  env $E FMG_MARKET_SETTINGS='{"householdGoodsPayment":"pay"}' npx tsx $SELL $M/world-$s.fmg $R/ale-pay/sell-$s.json 48 > $R/ale-pay/sell-$s.log 2>&1 &
done; wait
echo done
