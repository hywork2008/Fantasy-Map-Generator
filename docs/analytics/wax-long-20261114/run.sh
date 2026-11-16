#!/bin/sh
# Wax long run (docs/analytics/wax-long-20261114.md): goods.mts of wax-tithe-20261114 with characters' cash,
# 72 months of 2102 and 2103 with the default settings.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/wax-long-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/wax-long-20261114/goods.mts $M/world-$2.fmg $R/long-$2.json 72 free \
  > $R/long-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
