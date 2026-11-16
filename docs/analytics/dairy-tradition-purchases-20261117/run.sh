#!/bin/sh
# Dairy tradition from herds and purchases (docs/analytics/dairy-tradition-purchases-20261117.md): 36 months of 2103,
# dairyTraditionSource herdsAndPurchases (default) and herdsOnly.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/dairy-tradition-purchases-20261117
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
FMG_SETTINGS='{}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/purchases-2103.json 36 > $R/purchases-2103.log 2>&1 &
FMG_SETTINGS='{"dairyTraditionSource":"herdsOnly"}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/herds-2103.json 36 > $R/herds-2103.log 2>&1 &
wait
echo done
