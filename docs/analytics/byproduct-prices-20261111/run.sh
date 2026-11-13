#!/bin/sh
# By-product prices by market (docs/analytics/byproduct-prices-20261111.md): 12 months of map 2102
# with the defaults of docs/plan/footwear-capacity.md.   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/byproduct-prices-20261111
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/byproduct-prices-20261111/markets.mts $M/world-2102.fmg $R/markets-2102.json 12 \
  > $R/markets-2102.log 2>&1)
echo done
