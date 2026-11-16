#!/bin/sh
# Cheese reference price from production cost (docs/analytics/dairy-cost-20261117.md): 36 months of 2103 with
# the default cheeseReferencePrice productionCost. The goodValue comparison is dairy-demand-20261116 tradition-2103.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/dairy-cost-20261117
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/cost-2103.json 36 > $R/cost-2103.log 2>&1
echo done
