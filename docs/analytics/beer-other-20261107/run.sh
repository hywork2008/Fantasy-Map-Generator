#!/bin/sh
# Town hauls counted twice on arrival (beer-other-20261107.md): a Beer flow check on the grain2 map
# 2104 (8 months), then the four P1 maps of start-stock-20261105 with sellprobe (48 months). Raids
# off, peace. Run from a worktree with the fix applied; the run without it is ale-cask-20261107/ale.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-other-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
G=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/grain2/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
SELL=docs/analytics/cooper-funds-20261106/sellprobe.mts
mkdir -p $R/haul
# Before the fix (66cb3c571), run first: beerprobe on P1 2101/2104 (12 months) and grain2 2103/2104
# (24 months), and the Beer flows on grain2 2104 (4 months).
#   env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $M/world-2104.fmg $R/beer-2104.json 12
#   env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $G/world-2104.fmg $R/beer-grain2-2104.json 24
#   env $E npx tsx docs/analytics/beer-other-20261107/flowprobe.mts $G/world-2104.fmg $R/flow-2104.json 4
env $E npx tsx docs/analytics/beer-other-20261107/flowprobe.mts $G/world-2104.fmg $R/haul/flow-2104.json 8 > $R/haul/flow-2104.log 2>&1 &
for s in 2101 2102 2103; do env $E npx tsx $SELL $M/world-$s.fmg $R/haul/sell-$s.json 48 > $R/haul/sell-$s.log 2>&1 & done; wait
env $E npx tsx $SELL $M/world-2104.fmg $R/haul/sell-2104.json 48 > $R/haul/sell-2104.log 2>&1
echo done
