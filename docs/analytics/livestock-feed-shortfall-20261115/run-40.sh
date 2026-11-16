#!/bin/sh
# The answer to a short year takes a hay season to show (docs/analytics/livestock-feed-shortfall-20261115.md): 40
# months of 2102 with feedShortfallResponse random (default) and legacy, recorded by workyear.mts.
#   sh run-40.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-feed-shortfall-20261115/m40
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-2102.fmg $R/random-2102.json 40 > $R/random-2102.log 2>&1) &
(cd $1 && FMG_SETTINGS='{"feedShortfallResponse":"legacy"}' $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-2102.fmg $R/legacy-2102.json 40 > $R/legacy-2102.log 2>&1) &
wait
echo done
