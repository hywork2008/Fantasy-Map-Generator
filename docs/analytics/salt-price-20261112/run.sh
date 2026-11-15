#!/bin/sh
# Salt price (docs/analytics/salt-price-20261112.md): salt.mts on map 2102, 24 months.
#   sh run.sh <worktree>   (7826dddf5 with the working tree of docs/plan/byproduct-export.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/salt-price-20261112
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/salt-price-20261112/salt.mts $M/world-2102.fmg $R/salt-2102.json 24 free \
  > $R/salt-2102.log 2>&1)
echo done
