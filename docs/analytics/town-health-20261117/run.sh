#!/bin/sh
# Empty town treasuries and town staple (docs/analytics/town-health-20261117.md): the regenerated 2103,
# 36 months, at wage multiple 1.5 and 5 (the rest of the 1300 changes in both), one run at a time.
M=docs/analytics/raw/state-reserve-20261117/maps
R=docs/analytics/raw/town-health-20261117
for w in 1.5 5; do
  FMG_SETTINGS="{\"wageSubsistenceMultiple\":$w}" env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/wage$w-2103.json 36 > $R/wage$w-2103.log 2>&1
done
echo done
