#!/bin/sh
# Town purses by step (docs/analytics/town-purse-20261109.md): 12 months of seed 2103 on the warm map
# of docs/analytics/barilla-20261108.md, at 8a3226417.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/town-purse-20261109
cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/town-purse-20261109/pursesteps.mts $M/world-2103.fmg $R/values-2103.json 12 \
  > $R/values-2103.log 2>&1
echo done
