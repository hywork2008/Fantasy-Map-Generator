#!/bin/sh
# Feed ledger by cell (docs/analytics/herd-feed-20261114.md §5): 15 months of 2103 with herdOfftakeSpread toRenewal.
#   sh run-cells.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/herd-feed-20261114
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/herd-feed-20261114/cellfeed.mts $M/world-2103.fmg $R/cells-2103.json 15 > $R/cells-2103.log 2>&1)
echo done
