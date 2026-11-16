#!/bin/sh
# Lean stock (docs/analytics/livestock-lean-condition-20261116.md): 27 months of 2102 with the default settings
# (leanCondition carcass) and with leanCondition off, recorded by leanprobe.mts.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-lean-condition-20261116
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
P=docs/analytics/livestock-lean-condition-20261116/leanprobe.mts
(cd $1 && FMG_SETTINGS="{}" $E npx tsx $P $M/world-2102.fmg $R/carcass-2102.json 27 > $R/carcass-2102.log 2>&1) &
(cd $1 && FMG_SETTINGS='{"leanCondition":"off"}' $E npx tsx $P $M/world-2102.fmg $R/off-2102.json 27 > $R/off-2102.log 2>&1) &
wait
echo done
