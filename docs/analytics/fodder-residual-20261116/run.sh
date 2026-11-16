#!/bin/sh
# Feed still short with hay at its historical value (docs/analytics/fodder-residual-20261116.md): 15 months of 2102
# with the default settings, recorded by residualprobe.mts.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/fodder-residual-20261116
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/fodder-residual-20261116/residualprobe.mts $M/world-2102.fmg $R/residual-2102.json 15 > $R/residual-2102.log 2>&1)
echo done
