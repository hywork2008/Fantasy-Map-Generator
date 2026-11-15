#!/bin/sh
# crop-acreage-shares S2-S4 (worktree frozen at that code): beerprobe 60, economystart 0,12,36,60, cropstock 24; raids off, peace.
cd /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/wt-crop
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $M/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/beer-$1.json 60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/beer-$1.log 2>&1; }
o() { env $E npx tsx docs/analytics/economy-start-20261102/economystart-raidsoff.mts $M/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/obs-$1.json 0,12,36,60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/obs-$1.log 2>&1; }
c() { env $E npx tsx docs/analytics/crop-regions-20261105/cropstockprobe.mts $M/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/stock-$1.json 24 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/stock-$1.log 2>&1; }
b 2101 & b 2103 & b 2104 & c 2101 & wait
o 2101 & o 2103 & o 2104 & c 2103 & wait
c 2104
