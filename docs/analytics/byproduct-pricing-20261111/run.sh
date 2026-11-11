#!/bin/sh
# By-product pricing (docs/analytics/byproduct-pricing-20261111.md): the goods probe of household-goods-pay-20261111
# with the defaults of docs/plan/byproduct-prices.md, 36 months of the two warm maps of barilla-20261108.
#   sh run.sh <worktree>   (aa5cf2a29 with docs/plan/byproduct-prices.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/byproduct-pricing-20261111
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/byproduct-pricing-20261111/goods.mts $M/world-$2.fmg $R/new-$2.json 36 free \
  > $R/new-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
