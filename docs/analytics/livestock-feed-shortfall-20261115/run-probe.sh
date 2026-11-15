#!/bin/sh
# Why little grain reached short stock (docs/analytics/livestock-feed-shortfall-20261115.md): 15 months of 2102 with
# the default settings, recorded by grainprobe.mts.
#   sh run-probe.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-feed-shortfall-20261115
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/livestock-feed-shortfall-20261115/grainprobe.mts $M/world-2102.fmg $R/probe-2102.json 15 > $R/probe-2102.log 2>&1)
echo done
