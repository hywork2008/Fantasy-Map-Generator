#!/bin/sh
# Household basket (docs/analytics/household-basket-20261116.md): 36 months of 2103, peace, raids off, basket.mts.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/household-basket-20261116
env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/basket-2103.json 36 > $R/basket-2103.log 2>&1
echo done
