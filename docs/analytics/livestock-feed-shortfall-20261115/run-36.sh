#!/bin/sh
# Grain for short livestock feed (docs/analytics/livestock-feed-shortfall-20261115.md): 36 months of 2102 and 2103
# with the default settings (grainFeed fodderGrains), recorded by workyear.mts of rural-work-year-20261115. The
# comparison (off) is restdays/offfield-<map>.json of rural-work-year-20261115.
#   sh run-36.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-feed-shortfall-20261115
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for map in 2103 2102; do
  (cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-$map.fmg $R/grain-$map.json 36 > $R/grain-$map.log 2>&1) &
done
wait
echo done
