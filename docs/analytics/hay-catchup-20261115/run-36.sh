#!/bin/sh
# Late hay cut (docs/analytics/hay-catchup-20261115.md §3): 36 months of 2102 and 2103 with the default
# settings (hayCatchUp aftermath), recorded by urbanhelp.mts of urban-harvest-help-20261114. The comparison
# (legacy) is fixed-<map>.json of urban-harvest-help-20261114.
#   sh run-36.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/hay-catchup-20261115
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
for map in 2103 2102; do
  (cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/urban-harvest-help-20261114/urbanhelp.mts $M/world-$map.fmg $R/aftermath-$map.json 36 > $R/aftermath-$map.log 2>&1) &
done
wait
echo done
