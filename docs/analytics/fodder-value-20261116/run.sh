#!/bin/sh
# Hay value (docs/analytics/fodder-value-20261116.md): 27 months of 2102 with the default settings (fodderValue
# historical) and with fodderValue legacy, recorded by leanprobe.mts of livestock-lean-condition-20261116 (copied
# here unchanged).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/fodder-value-20261116
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
P=docs/analytics/fodder-value-20261116/leanprobe.mts
(cd $1 && FMG_SETTINGS="{}" $E npx tsx $P $M/world-2102.fmg $R/historical-2102.json 27 > $R/historical-2102.log 2>&1) &
(cd $1 && FMG_SETTINGS='{"fodderValue":"legacy"}' $E npx tsx $P $M/world-2102.fmg $R/legacy-2102.json 27 > $R/legacy-2102.log 2>&1) &
wait
echo done
