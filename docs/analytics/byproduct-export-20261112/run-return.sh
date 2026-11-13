#!/bin/sh
# By-product export (docs/analytics/byproduct-export-20261112.md §6, return goods): the goods probe of household-goods-pay-20261111
# with the defaults of docs/plan/byproduct-export.md, 36 months of the two warm maps of barilla-20261108.
#   sh run.sh <worktree>   (7826dddf5 with the working tree and docs/plan/byproduct-export.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/byproduct-export-20261112
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/byproduct-export-20261112/goods.mts $M/world-$2.fmg $R/return-$2.json 36 free \
  > $R/return-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
