#!/bin/sh
# Animal-protein cap (docs/analytics/dairy-cap-20261117.md): 36 months of 2103, defaults (cap 30 g/day).
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/dairy-cap-20261117
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/cap-2103.json 36 > $R/cap-2103.log 2>&1
echo done
