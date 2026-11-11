#!/bin/sh
# Household goods payment free vs pay, and goods stocks (docs/analytics/household-goods-pay-20261111.md):
# 36 months of the two warm maps of docs/analytics/barilla-20261108.md.   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/household-goods-pay-20261111
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/household-goods-pay-20261111/goods.mts $M/world-$2.fmg $R/$3-$2.json 36 $3 \
  > $R/$3-$2.log 2>&1); }
f $1 2102 free & f $1 2103 free & wait
f $1 2102 pay & f $1 2103 pay & wait
echo done
