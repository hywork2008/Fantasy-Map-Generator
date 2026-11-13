#!/bin/sh
# Return goods by shortage (docs/analytics/salt-displacement-20261112.md §6): salt.mts (24 months)
# and goods.mts of byproduct-export-20261112 (36 months) on map 2102 with byproductReturnMonths 3.
#   sh run-short.sh <worktree>   (7826dddf5 with the working tree of docs/plan/byproduct-export.md §7.2)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/salt-displacement-20261112
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && $E npx tsx docs/analytics/salt-displacement-20261112/salt.mts $M/world-2102.fmg $R/short-2102.json 24 staple > $R/short-2102.log 2>&1) &
(cd $1 && $E npx tsx docs/analytics/byproduct-export-20261112/goods.mts $M/world-2102.fmg $R/short-goods-2102.json 36 free > $R/short-goods-2102.log 2>&1) &
wait
echo done
