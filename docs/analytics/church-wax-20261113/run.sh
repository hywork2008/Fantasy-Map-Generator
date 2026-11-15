#!/bin/sh
# Church wax (docs/analytics/church-wax-20261113.md): goods.mts of byproduct-export-20261112,
# 36 months of the two warm maps of barilla-20261108.
#   sh run.sh <worktree>   (HEAD with docs/plan/church-wax.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/church-wax-20261113
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/church-wax-20261113/goods.mts $M/world-$2.fmg $R/new-$2.json 36 free \
  > $R/new-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
