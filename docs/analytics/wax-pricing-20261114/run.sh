#!/bin/sh
# Wax pricing (docs/analytics/wax-pricing-20261114.md): goods.mts of wax-export-20261114 with FMG_WAX_PRICING
# and the beeswax of each market, 36 months of 2102 and 2103, legacy against stockAndDemand.
#   sh run.sh <worktree> <legacy|stockAndDemand>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/wax-pricing-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off FMG_WAX_PRICING=$3 NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/wax-pricing-20261114/goods.mts $M/world-$2.fmg $R/$3-$2.json 36 free \
  > $R/$3-$2.log 2>&1); }
f $1 2102 $2 & f $1 2103 $2 & wait
echo done
