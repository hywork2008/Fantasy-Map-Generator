#!/bin/sh
# Parts of the market payout step (docs/analytics/market-payout-20261109.md): 24 months of seed 2103.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/market-payout-20261109
mkdir -p $R
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/market-payout-20261109/payoutsplit.mts $M/world-2103.fmg $R/payout-2103.json 24 > $R/payout-2103.log 2>&1)
echo done
