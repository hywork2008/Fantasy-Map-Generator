#!/bin/sh
cd /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/wt-crop
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $M/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/newmaps/beer-$1.json 60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/newmaps/beer-$1.log 2>&1; }
o() { env $E npx tsx docs/analytics/economy-start-20261102/economystart-raidsoff.mts $M/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/newmaps/obs-$1.json 0,12,36,60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/crop-shares-20261105/newmaps/obs-$1.log 2>&1; }
o 2101 & o 2103 & o 2104 & b 2101 & wait
b 2103 & b 2104 & wait
