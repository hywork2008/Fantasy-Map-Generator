#!/bin/sh
# Cask floor from household drinks (urban-craft-staffing.md §12 item 20): the P1 maps, 60 months,
# raids off, peace. Run from a worktree frozen at the measured code.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
p() { env $E npx tsx docs/analytics/start-stock-20261105/stockprobe.mts $R/maps/world-$1.fmg $R/cask/stock-$1.json 60 > $R/cask/stock-$1.log 2>&1; }
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $R/maps/world-$1.fmg $R/cask/beer-$1.json 60 > $R/cask/beer-$1.log 2>&1; }
b 2101 & b 2102 & b 2103 & b 2104 & wait
p 2101 & p 2102 & p 2103 & p 2104 & wait
