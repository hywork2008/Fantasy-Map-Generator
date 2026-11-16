#!/bin/sh
# Selling unfed stock and starvation (docs/analytics/livestock-lean-condition-20261116.md §3): 30 months of 2102
# with the default settings (leanCull unfed, leanDeaths die) and with both off, recorded by leanprobe.mts.
#   sh run-cull.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-lean-condition-20261116/cull
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
P=docs/analytics/livestock-lean-condition-20261116/leanprobe.mts
(cd $1 && FMG_SETTINGS="{}" $E npx tsx $P $M/world-2102.fmg $R/cull-2102.json 30 > $R/cull-2102.log 2>&1) &
(cd $1 && FMG_SETTINGS='{"leanCull":"off","leanDeaths":"off"}' $E npx tsx $P $M/world-2102.fmg $R/keep-2102.json 30 > $R/keep-2102.log 2>&1) &
wait
echo done
