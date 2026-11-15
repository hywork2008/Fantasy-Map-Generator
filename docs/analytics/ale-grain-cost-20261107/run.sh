#!/bin/sh
# Ale priced from the cheapest grain a market holds (ale-grain-cost-20261107.md): beerprobe on the
# grain2 map 2104 (24 months), then sellprobe on the four P1 maps of start-stock-20261105 (48 months).
# Raids off, peace. Run from a worktree with the change applied; the run without it (the town-haul
# fix only) is beer-other-20261107/haul.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/ale-grain-cost-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
G=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/grain2/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
SELL=docs/analytics/cooper-funds-20261106/sellprobe.mts
mkdir -p $R
env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $G/world-2104.fmg $R/beer-grain2-2104.json 24 > $R/beer-grain2-2104.log 2>&1 &
for s in 2101 2102 2103; do env $E npx tsx $SELL $M/world-$s.fmg $R/sell-$s.json 48 > $R/sell-$s.log 2>&1 & done; wait
env $E npx tsx $SELL $M/world-2104.fmg $R/sell-2104.json 48 > $R/sell-2104.log 2>&1
echo done
