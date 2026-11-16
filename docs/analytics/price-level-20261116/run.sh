#!/bin/sh
# Price level (docs/analytics/price-level-20261116.md): 60 months of 2102 and 2103, peace, raids off.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/price-level-20261116
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for map in 2102 2103; do
  $E npx tsx docs/analytics/price-level-20261116/prices.mts $M/world-$map.fmg $R/prices-$map.json 60 > $R/prices-$map.log 2>&1 &
done
wait
echo done
