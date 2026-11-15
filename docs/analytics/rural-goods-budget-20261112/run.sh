#!/bin/sh
# Rural goods budget (docs/analytics/rural-goods-budget-20261112.md): budget.mts on map 2102, 24 months.
#   sh run.sh <worktree>   (7826dddf5 with docs/plan/candle-demand.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-goods-budget-20261112
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/rural-goods-budget-20261112/budget.mts $M/world-2102.fmg $R/budget-2102.json 24 free \
  > $R/budget-2102.log 2>&1)
echo done
