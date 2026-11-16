#!/bin/sh
# Peat growth (docs/analytics/peat-growth-20261113.md): the monthly peat potential of 2102 and 2103
# after one month on HEAD with docs/plan/fuel-price-share.md. The monthly series come from the
# outputs of fuel-price-share-20261113 (no new long run).
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
for m in 2102 2103; do
  (FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
    npx tsx docs/analytics/peat-growth-20261113/potential.mts $M/world-$m.fmg 2>/dev/null | tail -1 | sed "s/^/$m /") &
done
wait
