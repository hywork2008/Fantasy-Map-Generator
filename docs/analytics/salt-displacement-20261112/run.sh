#!/bin/sh
# Salt displacement (docs/analytics/salt-displacement-20261112.md): salt.mts on map 2102, 24 months,
# with the hide and tallow export on (staple) and off.
#   sh run.sh <worktree>   (7826dddf5 with the working tree of docs/plan/byproduct-export.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/salt-displacement-20261112
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/salt-displacement-20261112/salt.mts $M/world-2102.fmg $R/$2-2102.json 24 $2 \
  > $R/$2-2102.log 2>&1); }
f $1 staple & f $1 off & wait
echo done
