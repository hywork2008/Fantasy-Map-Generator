#!/bin/sh
# The new runs again after Ash lost its construction share (§2.1 of the analytics md); base is unchanged.
#   sh run-new.sh <new worktree>
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/wood-ash-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107/h25/maps
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  CLAYFLOW_GOODS="Ash,Potash,Glass,Soap,Cheese,Saltpeter,White sand" \
  npx tsx docs/analytics/cold-clay-20261107/clayflow.mts $M/world-$2.fmg $R/new-$2.json 12 add "Clay,White sand" > $R/new-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
