#!/bin/sh
# Hay plan herd (docs/analytics/hay-plan-herd-20261114.md): 36 months of 2103 with hayPlanHerd wintered, recorded by
# herdfeed.mts of herd-feed-20261114 and holdersteps.mts of herd-offtake-spread-20261114. The comparison (current)
# is toRenewal-2103.json of both.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/hay-plan-herd-20261114
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && $E npx tsx docs/analytics/herd-feed-20261114/herdfeed.mts $M/world-2103.fmg $R/herdfeed-wintered-2103.json 36 > $R/herdfeed.log 2>&1) &
(cd $1 && $E npx tsx docs/analytics/herd-offtake-spread-20261114/holdersteps.mts $M/world-2103.fmg $R/holders-wintered-2103.json 36 > $R/holders.log 2>&1) &
wait
echo done
