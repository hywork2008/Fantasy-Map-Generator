#!/bin/sh
# Town household money over three years (docs/analytics/town-money-drain-20261114.md): npm run sim on
# 2102, 36 months, a wealth sample and the money flows of every step each month.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/town-money-drain-20261114
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npm run sim -- $M/world-2102.fmg --months 36 --sample-every-months 1 --samples $R/samples-2102.ndjson \
  --sample-detail wealth --money-flows $R/flows-2102.ndjson > $R/sim-2102.log 2>&1)
echo done
