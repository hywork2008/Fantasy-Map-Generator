#!/bin/sh
# Comparison for the textile workers and population (docs/analytics/rural-work-year-20261115.md): the same
# 36 months with ruralWorkYear legacy, recorded by workyear.mts.
#   sh run-legacy.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-work-year-20261115/regrowth
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for map in 2103 2102; do
  (cd $1 && FMG_SETTINGS='{"ruralWorkYear":"legacy"}' $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-$map.fmg $R/legacy-$map.json 36 > $R/legacy-$map.log 2>&1) &
done
wait
echo done
