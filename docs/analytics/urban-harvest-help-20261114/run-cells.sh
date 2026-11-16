#!/bin/sh
# Feed ledger by cell for the April shortage of 2102 (docs/analytics/urban-harvest-help-20261114.md §8):
# 16 months of 2102 with the default settings, recorded by cellfeed.mts of herd-feed-20261114.
#   sh run-cells.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/urban-harvest-help-20261114
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/herd-feed-20261114/cellfeed.mts $M/world-2102.fmg $R/cells-2102.json 16 > $R/cells-2102.log 2>&1)
echo done
