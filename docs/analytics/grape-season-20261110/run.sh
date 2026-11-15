#!/bin/sh
# Grape season and wine country (docs/analytics/grape-season-20261110.md): 24 months of the two warm maps of
# docs/analytics/barilla-20261108.md.
#   sh run.sh <worktree> <label>   (base: commit 811ca2261; new: all-or-nothing wine country; share: the design)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grape-season-20261110
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/grape-season-20261110/orchardprobe.mts $M/world-$2.fmg $R/$3-$2.json 24 \
  > $R/$3-$2.log 2>&1); }
f $1 2102 $2 & f $1 2103 $2 & wait
echo done
