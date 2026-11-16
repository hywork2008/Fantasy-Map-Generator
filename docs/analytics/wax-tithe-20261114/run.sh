#!/bin/sh
# Wax tithe (docs/analytics/wax-tithe-20261114.md): goods.mts of wax-pricing-20261114 with FMG_WAX_SURPLUS,
# 36 months of 2102 and 2103 with the default settings (waxSurplus tithe). The comparison is
# stockAndDemand-<map>.json of wax-pricing-20261114 (the same code without the wax rent).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/wax-tithe-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off FMG_WAX_SURPLUS=tithe NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/wax-tithe-20261114/goods.mts $M/world-$2.fmg $R/tithe-$2.json 36 free \
  > $R/tithe-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
