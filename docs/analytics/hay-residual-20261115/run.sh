#!/bin/sh
# What limits the hay of the cells still short in April (docs/analytics/hay-residual-20261115.md): 27 months of
# 2102 with the default settings (hayCatchUp aftermath), recorded by residual.mts for every livestock cell.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/hay-residual-20261115
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/hay-residual-20261115/residual.mts $M/world-2102.fmg $R/residual-2102.json 27 > $R/residual-2102.log 2>&1)
echo done
