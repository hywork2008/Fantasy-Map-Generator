#!/bin/sh
# Town harvest help with the hay labor demand on the wintered herd (docs/analytics/urban-harvest-help-20261114.md §7):
# 36 months of 2102 and 2103 with the default settings, recorded by urbanhelp.mts.
#   sh run-fixed.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/urban-harvest-help-20261114
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for map in 2103 2102; do
  (cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/urban-harvest-help-20261114/urbanhelp.mts $M/world-$map.fmg $R/fixed-$map.json 36 > $R/fixed-$map.log 2>&1) &
done
wait
echo done
