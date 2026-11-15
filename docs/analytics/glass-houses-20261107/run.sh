#!/bin/sh
# Forest glasshouses: base (glasshouse tick removed) and new worktrees, 12 months, two runs at a
# time. Clay and White sand are added on the cold lands in both (docs/analytics/cold-sand-20261107.md).
#   sh run.sh <base worktree> <new worktree>
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/glass-houses-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107/h25/maps
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  CLAYFLOW_GOODS="Glass,White sand,Potash,Ash,Wood,Lab Glassware" \
  npx tsx docs/analytics/cold-clay-20261107/clayflow.mts $M/world-$3.fmg $R/$2-$3.json 12 add "Clay,White sand" > $R/$2-$3.log 2>&1); }
for s in 2102 2103; do
  f $1 base $s & f $2 new $s & wait
done
echo done
