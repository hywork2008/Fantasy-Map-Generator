#!/bin/sh
# Saved Clay (base) against Clay added on the cold lands (add), 12 months, two runs at a time.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/cold-clay-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107/h25/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
f() { env $E npx tsx docs/analytics/cold-clay-20261107/clayflow.mts $M/world-$1.fmg $R/$2-$1.json 12 $3 > $R/$2-$1.log 2>&1; }
for s in 2102 2103; do
  f $s base & f $s add add & wait
done
echo done
