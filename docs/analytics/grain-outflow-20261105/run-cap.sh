#!/bin/sh
# Purchase fix + granary outflow in the purchase cap (§10.12, item 19). Runs in a worktree frozen at that code.
cd /private/tmp/claude-501/-Users-h-yamaguchi-Projects-fmg-2/778b8824-b9e6-4e55-be53-a972977f518c/scratchpad/wt-cap
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/beer-shortfall-20261104/maps
O=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-outflow-20261105/cap
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
while pgrep -f "grain-outflow-20261105/fixed/" >/dev/null; do sleep 60; done
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $M/world-$1.fmg $O/beer-$1.json 60 > $O/beer-$1.log 2>&1; }
o() { env $E npx tsx docs/analytics/economy-start-20261102/economystart-raidsoff.mts $M/world-$1.fmg $O/obs-$1.json 0,12,36,60 > $O/obs-$1.log 2>&1; }
g() { env $E npx tsx docs/analytics/grain-outflow-20261105/grainflowprobe.mts $M/world-$1.fmg $O/flow-$1.json 24 > $O/flow-$1.log 2>&1; }
b 2101 & b 2103 & b 2104 & g 2101 & wait
o 2101 & o 2103 & o 2104 & g 2103 & wait
g 2104
