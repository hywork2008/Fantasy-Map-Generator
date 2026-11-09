#!/bin/sh
# Grain credit repaid on quarter days (docs/analytics/grain-quarter-day-20261109.md): 24 months of the two warm maps of
# docs/analytics/barilla-20261108.md with the soap flows (barillaflow.mts), and 24 months of seed 2103
# with the market cash, town purses and payout parts by step (market-payout-20261109/payoutsplit.mts). The base is
# docs/analytics/harvest-reserve-20261109.md (fbabb9c8a).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/grain-quarter-day-20261109
mkdir -p $R
f() { (cd $1 && env CLAYFLOW_GOODS="Soap,Castile Soap,Barilla,Oil,Olives,Tallow,Potash,Glass,Ash" FMG_CONFLICT_AUTONOMY=peace \
  FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $M/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
f $1 quarter 2102 & f $1 quarter 2103 & wait
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/market-payout-20261109/payoutsplit.mts $M/world-2103.fmg $R/cash-2103.json 24 > $R/cash-2103.log 2>&1)
echo done
