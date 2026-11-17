#!/bin/sh
# 1300 wage (docs/analytics/wage-chain-20261117.md): 36 months of the regenerated 2103, defaults
# (multiple 5, new labour and values). Compare with state-reserve-20261117 new-2103.json.
M=docs/analytics/raw/state-reserve-20261117/maps
R=docs/analytics/raw/wage-1300-20261117
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/wage-2103.json 36 > $R/wage-2103.log 2>&1
echo done
