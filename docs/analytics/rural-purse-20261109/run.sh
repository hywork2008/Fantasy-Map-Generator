#!/bin/sh
# The farm purse by step (docs/analytics/rural-purse-20261109.md): 24 months of seed 2103.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-purse-20261109
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/rural-purse-20261109/ruralsteps.mts $M/world-2103.fmg $R/rural-2103.json 24 > $R/rural-2103.log 2>&1)
echo done
