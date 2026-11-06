#!/bin/sh
# Purchase fix (§10.12): beerprobe 60, economystart 0,12,36,60, grainflow 24; raids off, peace.
cd /Users/h-yamaguchi/Projects/fmg-2
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/beer-$1.json 60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/beer-$1.log 2>&1; }
o() { env $E npx tsx docs/analytics/economy-start-20261102/economystart-raidsoff.mts /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/obs-$1.json 0,12,36,60 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/obs-$1.log 2>&1; }
g() { env $E npx tsx docs/analytics/grain-outflow-20261105/grainflowprobe.mts /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps/world-$1.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/flow-$1.json 24 > /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/fixed/flow-$1.log 2>&1; }
b 2101 & b 2103 & b 2104 & g 2101 & wait
o 2101 & o 2103 & o 2104 & g 2103 & wait
g 2104
rm -f docs/analytics/economy-start-20261102/economystart-raidsoff.mts
