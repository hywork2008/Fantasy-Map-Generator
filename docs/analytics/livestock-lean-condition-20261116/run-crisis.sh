#!/bin/sh
# Feed for stock about to be sold (docs/plan/livestock-feed-shortfall.md §10, docs/analytics/livestock-lean-condition-20261116.md
# §4): 30 months of 2102 with the default settings (feedCrisisBudget nearCull), recorded by leanprobe.mts. The
# comparison is cull/cull-2102.json (the same code with feedCrisisBudget off).
#   sh run-crisis.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-lean-condition-20261116/crisis
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
P=docs/analytics/livestock-lean-condition-20261116/leanprobe.mts
(cd $1 && FMG_SETTINGS="{}" $E npx tsx $P $M/world-2102.fmg $R/crisis-2102.json 30 > $R/crisis-2102.log 2>&1)
echo done
