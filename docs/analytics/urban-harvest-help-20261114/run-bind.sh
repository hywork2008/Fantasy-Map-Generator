#!/bin/sh
# What stops each hay cut (docs/analytics/urban-harvest-help-20261114.md §6): 9 months of 2103 with the hay
# labor demand on the wintered herd, urbanHarvestHelp legacy and cornAndHay, recorded by haybind.mts.
#   sh run-bind.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/urban-harvest-help-20261114
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
run() { (cd $1 && FMG_SETTINGS="{\"urbanHarvestHelp\":\"$2\"}" $E npx tsx docs/analytics/urban-harvest-help-20261114/haybind.mts $M/world-2103.fmg $R/bind-$2-2103.json 9 > $R/bind-$2-2103.log 2>&1); }
run $1 legacy &
run $1 cornAndHay &
wait
echo done
