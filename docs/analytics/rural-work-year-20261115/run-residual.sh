#!/bin/sh
# Why 2102 stays short with off-field days (docs/analytics/rural-work-year-20261115.md): 27 months of 2102 with
# the default settings (ruralWorkYear offField), recorded by residual.mts of hay-residual-20261115.
#   sh run-residual.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-work-year-20261115
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/hay-residual-20261115/residual.mts $M/world-2102.fmg $R/residual-2102.json 27 > $R/residual-2102.log 2>&1)
echo done
