#!/bin/sh
# 24-month base of cashsteps for seed 2103 at 931547a96 (docs/analytics/harvest-reserve-20261109.md §1).
#   sh base.sh <base-worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/harvest-reserve-20261109
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/market-cash-20261109/cashsteps.mts $M/world-2103.fmg $R/base-cash-2103.json 24 > $R/base-cash-2103.log 2>&1)
echo done
