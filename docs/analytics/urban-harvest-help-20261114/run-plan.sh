#!/bin/sh
# Hay plan of the April-short cells of 2102 (docs/analytics/urban-harvest-help-20261114.md §10): 12 months
# of 2102 with the default settings, recorded by planread.mts for the cells of cells-2102.json.
#   sh run-plan.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/urban-harvest-help-20261114
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/urban-harvest-help-20261114/planread.mts $M/world-2102.fmg $R/cells-2102.json $R/plan-2102.json 12 > $R/plan-2102.log 2>&1)
echo done
