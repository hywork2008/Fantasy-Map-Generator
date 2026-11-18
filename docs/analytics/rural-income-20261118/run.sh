#!/bin/sh
# Rural product prices against value (docs/analytics/rural-income-20261118.md): the regenerated 2103,
# 36 months, defaults (wage multiple 5).
M=docs/analytics/raw/state-reserve-20261117/maps
R=docs/analytics/raw/rural-income-20261118
[ -f $R/prices-2103.json ] || FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/prices-2103.json 36 > $R/prices-2103.log 2>&1
echo done
# Raw goods priced with processing use (docs/plan/raw-good-processing-demand.md), same map and months.
[ -f $R/processing-2103.json ] || FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/processing-2103.json 36 > $R/processing-2103.log 2>&1
echo done-processing
# Wool added to the raw pricing (same setting), same map and months.
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/wool-2103.json 36 > $R/wool-2103.log 2>&1
echo done-wool
