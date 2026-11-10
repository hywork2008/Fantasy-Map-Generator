#!/bin/sh
# Casks in stock against the coopers' shortfall (docs/analytics/cask-stock-20261110.md): 24 months of the two warm maps of
# docs/analytics/barilla-20261108.md, then the casks of map 2103.
#   sh run.sh <worktree> <label>   (base: vintage-casks-20261110 new; new: casks in stock counted; stockonly: that without the vintage reserve)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/cask-stock-20261110
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/cask-stock-20261110/$4.mts $M/world-$2.fmg $R/$5$3-$2.json 24 \
  > $R/$5$3-$2.log 2>&1); }
f $1 2102 $2 orchardprobe & f $1 2103 $2 orchardprobe & wait
f $1 2103 $2 caskprobe cask-
echo done
