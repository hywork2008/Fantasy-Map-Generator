#!/bin/sh
# State budget income (docs/analytics/state-budget-income-20261114.md): goods.mts of heirless-estates-20261114,
# 36 months of 2102 and 2103 with the default settings (stateBudgetIncome allRevenue). The comparison is cash-<map>.json of heirless-estates-20261114 (pollTax).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/state-budget-income-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/state-budget-income-20261114/goods.mts $M/world-$2.fmg $R/cash-$2.json 36 free \
  > $R/cash-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
