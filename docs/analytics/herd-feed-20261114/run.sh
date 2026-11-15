#!/bin/sh
# Herd size and feed (docs/analytics/herd-feed-20261114.md): 36 months of 2103 with herdOfftakeSpread legacy and toRenewal.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/herd-feed-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 FMG_SETTINGS="{\"herdOfftakeSpread\":\"$2\"}" \
  npx tsx docs/analytics/herd-feed-20261114/herdfeed.mts $M/world-2103.fmg $R/$2-2103.json 36 > $R/$2-2103.log 2>&1); }
f $1 legacy & f $1 toRenewal & wait
echo done
