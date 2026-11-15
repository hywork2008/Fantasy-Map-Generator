#!/bin/sh
# Money by holder (docs/analytics/money-holders-20261110.md): 24 months of the two warm maps of
# docs/analytics/barilla-20261108.md.
#   sh run.sh <worktree>   (commit 7690c1f6e with the casks of docs/analytics/cask-stock-20261110.md §5)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/money-holders-20261110
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/money-holders-20261110/holders.mts $M/world-$2.fmg $R/holders-$2.json 24 \
  > $R/holders-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
