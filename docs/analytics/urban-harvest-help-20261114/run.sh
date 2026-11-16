#!/bin/sh
# Town harvest help (docs/analytics/urban-harvest-help-20261114.md): 36 months of 2102 and 2103 with
# urbanHarvestHelp legacy and cornAndHay, recorded by urbanhelp.mts. Two runs at a time.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/urban-harvest-help-20261114
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
run() { (cd $1 && FMG_SETTINGS="{\"urbanHarvestHelp\":\"$3\"}" $E npx tsx docs/analytics/urban-harvest-help-20261114/urbanhelp.mts $M/world-$2.fmg $R/$3-$2.json 36 > $R/$3-$2.log 2>&1); }
for map in 2103 2102; do
  run $1 $map legacy &
  run $1 $map cornAndHay &
  wait
done
echo done
