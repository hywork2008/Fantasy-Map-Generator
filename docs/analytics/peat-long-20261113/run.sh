#!/bin/sh
# Peat over six years (docs/analytics/peat-long-20261113.md): goods.mts of peat-cut-plan-20261113,
# 72 months of 2102 with the default settings (fuelChoice priceShare, peatCutPlan yearlyAverage).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/peat-long-20261113
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/peat-long-20261113/goods.mts $M/world-2102.fmg $R/new-2102.json 72 free \
  > $R/new-2102.log 2>&1)
echo done
