#!/bin/sh
# Market cash by step (docs/analytics/market-cash-20261109.md): 12 months of seed 2103 on the warm map
# of docs/analytics/barilla-20261108.md, at 931547a96 (book credit from the market).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/market-cash-20261109
cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/market-cash-20261109/cashsteps.mts $M/world-2103.fmg $R/cash-2103.json 12 > $R/cash-2103.log 2>&1
echo done
