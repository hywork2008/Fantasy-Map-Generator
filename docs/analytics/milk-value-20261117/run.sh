#!/bin/sh
# Milk at its farm value in the cheese cost (docs/analytics/milk-value-20261117.md): 36 months of 2103,
# cellCheeseSale demandGap (default) and allMilk.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/milk-value-20261117
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
FMG_SETTINGS='{}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/gap-2103.json 36 > $R/gap-2103.log 2>&1 &
FMG_SETTINGS='{"cellCheeseSale":"allMilk"}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/all-2103.json 36 > $R/all-2103.log 2>&1 &
wait
echo done
