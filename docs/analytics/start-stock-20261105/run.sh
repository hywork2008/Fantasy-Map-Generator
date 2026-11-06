#!/bin/sh
# P1 (start-provisioning.md §6.3): 4 new world maps at 7e21fec, 60 months, raids off, peace.
# Run from a worktree frozen at the measured commit; $R is the git-ignored raw folder.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for s in 2101 2102 2103 2104; do
  node scripts/generateSmallMaps.mjs $R/maps --scope world --seed $s --local-storage docs/analytics/economy-start-20261102/storage.json --wait-extensions
done
p() { env $E npx tsx docs/analytics/start-stock-20261105/stockprobe.mts $R/maps/world-$1.fmg $R/stock-$1.json 60 > $R/stock-$1.log 2>&1; }
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $R/maps/world-$1.fmg $R/beer-$1.json 60 > $R/beer-$1.log 2>&1; }
p 2101 & p 2102 & p 2103 & p 2104 & wait
b 2101 & b 2102 & b 2103 & b 2104 & wait
