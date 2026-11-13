#!/bin/sh
# Start line stock (start-provisioning.md §6.6): the P1 maps re-provisioned at version 3, 60 months,
# raids off, peace. Run from a worktree frozen at the measured code; compare with cask/.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R/line
p() { env $E npx tsx docs/analytics/start-stock-20261105/stockprobe.mts $R/maps/world-$1.fmg $R/line/stock-$1.json 60 > $R/line/stock-$1.log 2>&1; }
p 2101 & p 2102 & p 2103 & p 2104 & wait
