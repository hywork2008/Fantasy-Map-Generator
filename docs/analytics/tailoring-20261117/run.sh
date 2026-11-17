#!/bin/sh
# Where tailoring stops (docs/analytics/tailoring-20261117.md): 36 months of 2103, defaults.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/tailoring-20261117
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/tailoring-2103.json 36 > $R/tailoring-2103.log 2>&1
echo done
