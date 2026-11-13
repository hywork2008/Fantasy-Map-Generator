#!/bin/sh
# Start grain to the first harvest (start-provisioning.md §6.5) with the cask floor: new maps from
# the measured code, 60 months, raids off, peace. Run from a worktree frozen at that code.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/grain
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R/maps
for s in 2101 2102 2103 2104; do
  node scripts/generateSmallMaps.mjs $R/maps --scope world --seed $s --local-storage docs/analytics/economy-start-20261102/storage.json --wait-extensions
done
p() { env $E npx tsx docs/analytics/start-stock-20261105/stockprobe.mts $R/maps/world-$1.fmg $R/stock-$1.json 60 > $R/stock-$1.log 2>&1; }
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $R/maps/world-$1.fmg $R/beer-$1.json 60 > $R/beer-$1.log 2>&1; }
b 2101 & b 2102 & b 2103 & b 2104 & wait
p 2101 & p 2102 & p 2103 & p 2104 & wait
