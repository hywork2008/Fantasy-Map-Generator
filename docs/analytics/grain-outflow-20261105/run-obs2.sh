#!/bin/sh
# Regenerate rural-ale after/obs-2101 at HEAD (overwritten by mistake), and economystart for the purchase fix alone.
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
o() { (cd /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/$1 && env $E npx tsx docs/analytics/economy-start-20261102/economystart-raidsoff.mts $M/world-$2.fmg $3 0,12,36,60 > $3.log 2>&1); }
o wt-head 2101 /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/regen/obs-2101.json &
o wt-fixed 2101 /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/obs-2101.json &
o wt-fixed 2103 /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/obs-2103.json &
o wt-fixed 2104 /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/obs-2104.json &
wait
