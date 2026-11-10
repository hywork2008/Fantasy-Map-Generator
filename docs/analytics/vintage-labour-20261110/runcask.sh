#!/bin/sh
# Casks of the vintage (docs/analytics/vintage-labour-20261110.md §3): 24 months of map 2103.
#   sh runcask.sh <base worktree> <new worktree>   (base: commit 22c2967d8; new: docs/plan/vintage-labour.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/vintage-labour-20261110
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/vintage-labour-20261110/caskprobe.mts $M/world-2103.fmg $R/cask-$2-2103.json 24 \
  > $R/cask-$2-2103.log 2>&1); }
f $1 base & f $2 new & wait
echo done
