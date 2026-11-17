#!/bin/sh
# Income-only State reserve (docs/analytics/state-reserve-20261117.md): 36 months of 2103, defaults.
M=docs/analytics/raw/barilla-20261108/maps
R=docs/analytics/raw/state-reserve-20261117
[ -f $R/reserve-2103.json ] || FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/reserve-2103.json 36 > $R/reserve-2103.log 2>&1
echo done
# New map: generated with the income-only start (state-reserve-scale.md), state income recorded.
#   node scripts/generateSmallMaps.mjs $R/maps --scope world --seed 2103 \
#     --local-storage docs/analytics/barilla-20261108/storage-warm.json --wait-extensions
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $R/maps/world-2103.fmg $R/new-2103.json 36 > $R/new-2103.log 2>&1
echo done-new
