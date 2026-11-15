#!/bin/sh
# Container supply (docs/analytics/container-supply-20261110.md): 24 months of the two warm maps of
# docs/analytics/barilla-20261108.md with the drinks, containers and their inputs by flow.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/container-supply-20261110
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/container-supply-20261110/containerflow.mts $M/world-$2.fmg $R/flow-$2.json 24 \
  > $R/flow-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
