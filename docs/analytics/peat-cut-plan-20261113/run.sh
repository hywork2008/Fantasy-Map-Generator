#!/bin/sh
# Peat cut plan (docs/analytics/peat-cut-plan-20261113.md): goods.mts of fuel-price-share-20261113,
# 36 months of 2102 and 2103 with the default settings (fuelChoice priceShare, peatCutPlan yearlyAverage).
# The comparison is priceShare-<map>.json of fuel-price-share-20261113 (smoothedDraw).
#   sh run.sh <worktree>
#   python3 ../fuel-price-share-20261113/compare.py <old.json> <new.json>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/peat-cut-plan-20261113
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/peat-cut-plan-20261113/goods.mts $M/world-$2.fmg $R/new-$2.json 36 free \
  > $R/new-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
