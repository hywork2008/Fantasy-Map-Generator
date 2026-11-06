#!/bin/sh
# Household demand in the trade reserve (treeless-trade-20261106.md): the P1 maps of
# start-stock-20261105, 48 months, raids off, peace. Run once from a worktree frozen at HEAD
# (base/) and once with the change applied (trade/).
# Usage: run.sh <base|trade>
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/treeless-trade-20261106/$1
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $M/world-$1.fmg $R/beer-$1.json 48 > $R/beer-$1.log 2>&1; }
b 2101 & b 2102 & b 2103 & b 2104 & wait
