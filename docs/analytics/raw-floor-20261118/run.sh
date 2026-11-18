#!/bin/sh
# docs/analytics/raw-floor-20261118.md: the regenerated 2103, 12 months, defaults.
M=docs/analytics/raw/state-reserve-20261117/maps
R=docs/analytics/raw/raw-floor-20261118
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/raw-floor-20261118/probe.mts $M/world-2103.fmg $R/floor-2103.json 12 > $R/floor-2103.log 2>&1
echo done
