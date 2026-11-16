#!/bin/sh
# Why the worth rule bought little (docs/analytics/fodder-residual-20261116.md §4): 15 months of 2102 with the
# default settings, recorded by valueprobe.mts.
#   sh run-value.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/fodder-residual-20261116
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/fodder-residual-20261116/valueprobe.mts $M/world-2102.fmg $R/value-2102.json 15 > $R/value-2102.log 2>&1)
echo done
