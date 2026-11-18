#!/bin/sh
# Staple price from stock against the need to the next harvest (docs/plan/staple-price-harvest-coverage.md):
# the regenerated 2103, 36 months, defaults. Compare with docs/analytics/raw/rural-income-20261118/wool-2103.json.
M=docs/analytics/raw/state-reserve-20261117/maps
R=docs/analytics/raw/staple-price-20261118
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/staple-2103.json 36 > $R/staple-2103.log 2>&1
echo done
# Per-market stock against the price's needed stock, 15 months.
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/staple-price-20261118/probe.mts $M/world-2103.fmg $R/probe-pushed-2103.json 15 > $R/probe-pushed-2103.log 2>&1
echo done-probe
# Purchase cap to the next harvest (staple-price-harvest-coverage.md §7), same map and months.
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/bridge-2103.json 36 > $R/bridge-2103.log 2>&1
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/staple-price-20261118/probe.mts $M/world-2103.fmg $R/probe-bridge-exports-2103.json 24 > $R/probe-bridge-exports-2103.log 2>&1
echo done-bridge
# Normal carry-over 2 and 3 months against the default 1 (bridge-2103.json): seasonal wave size.
for C in 2 3; do
FMG_SETTINGS="{\"stapleCarryoverMonths\":$C}" env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/household-basket-20261116/basket.mts $M/world-2103.fmg $R/carry$C-2103.json 36 > $R/carry$C-2103.log 2>&1
done
echo done-carry
# Why the price rises before harvest although towns are not short (§9): yeargap defaults, 24 months.
FMG_SETTINGS='{}' env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 npx tsx docs/analytics/staple-price-20261118/probe.mts $M/world-2103.fmg $R/probe-yeargap-2103.json 24 > $R/probe-yeargap-2103.log 2>&1
