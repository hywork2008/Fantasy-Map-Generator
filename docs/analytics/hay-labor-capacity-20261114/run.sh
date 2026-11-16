#!/bin/sh
# Adult hands for haymaking (docs/analytics/hay-labor-capacity-20261114.md): one month of 2102 and 2103.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/hay-labor-capacity-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/hay-labor-capacity-20261114/haylabor.mts $M/world-$2.fmg $R/haylabor-$2.json > $R/haylabor-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
