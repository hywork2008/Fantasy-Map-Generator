#!/bin/sh
# Feed bought when worth it (docs/plan/livestock-feed-shortfall.md §10.2, docs/analytics/fodder-residual-20261116.md §3):
# 27 months of 2102 with the default settings (feedCrisisBudget worth, leanMilkLoss 0.5) and with feedCrisisBudget
# nearCull, recorded by leanprobe.mts of fodder-value-20261116 (copied here unchanged).
#   sh run-worth.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/fodder-residual-20261116/worth
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
P=docs/analytics/fodder-residual-20261116/leanprobe.mts
(cd $1 && FMG_SETTINGS="{}" $E npx tsx $P $M/world-2102.fmg $R/worth-2102.json 27 > $R/worth-2102.log 2>&1) &
(cd $1 && FMG_SETTINGS='{"feedCrisisBudget":"nearCull"}' $E npx tsx $P $M/world-2102.fmg $R/nearcull-2102.json 27 > $R/nearcull-2102.log 2>&1) &
wait
echo done
