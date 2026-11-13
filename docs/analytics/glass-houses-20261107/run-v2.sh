#!/bin/sh
# Forest glasshouses v2 (huts by standing forest, port towns keep Glass), 12 months, both seeds at
# once. Compared against the first run's new-*.json (v1).
#   sh run-v2.sh <v2 worktree>
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/glass-houses-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107/h25/maps
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  CLAYFLOW_GOODS="Glass,White sand,Potash,Ash,Wood,Lab Glassware" \
  npx tsx docs/analytics/cold-clay-20261107/clayflow.mts $M/world-$2.fmg $R/v2-$2.json 12 add "Clay,White sand" > $R/v2-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
