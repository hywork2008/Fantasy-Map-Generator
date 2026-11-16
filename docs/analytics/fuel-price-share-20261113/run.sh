#!/bin/sh
# Wood and peat by price share (docs/analytics/fuel-price-share-20261113.md): goods.mts of
# church-wax-pay-20261113 with FMG_FUEL_CHOICE overriding fuelChoice, 36 months.
#   sh run.sh <worktree>          priceShare on 2102 and 2103
#   sh run.sh <worktree> base     cheapest on 2103 (2102: church-wax-pay-20261113 wax0.05)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/fuel-price-share-20261113
mkdir -p $R
f() { (cd $1 && env FMG_FUEL_CHOICE=$2 FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/fuel-price-share-20261113/goods.mts $M/world-$3.fmg $R/$2-$3.json 36 free \
  > $R/$2-$3.log 2>&1); }
if [ "$2" = base ]; then f $1 cheapest 2103; else f $1 priceShare 2102 & f $1 priceShare 2103 & wait; fi
echo done
# Compare: python3 compare.py <old.json> <new.json>
