#!/bin/sh
# Dairy demand (docs/analytics/dairy-demand-20261116.md): 36 months of 2103, dairyDemand tradition (default) and
# fixedTargets, recorded by household-basket-20261116/basket.mts.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/dairy-demand-20261116
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
FMG_SETTINGS='{}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/tradition-2103.json 36 > $R/tradition-2103.log 2>&1 &
FMG_SETTINGS='{"dairyDemand":"fixedTargets"}' $E npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/fixed-2103.json 36 > $R/fixed-2103.log 2>&1 &
wait
echo done
