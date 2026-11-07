#!/bin/sh
# Step 2 of run.sh on its own (the A maps and their runs), for resuming after step 1.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107
S=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/site-bonus-20261107
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R/h25/maps $R/h1/maps
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $1 $2.json 36 > $2.log 2>&1; }
k() { npx tsx docs/analytics/ale-biome-20261107/biomeprobe.mts $1 $2.json > $2.log 2>&1; }
for h in 25 1; do
  for s in 2101 2102 2103 2104; do
    node scripts/generateSmallMaps.mjs $R/h$h/maps --scope world --seed $s --local-storage $S/storage-h$h.json --wait-extensions > $R/h$h/gen-$s.log 2>&1
  done
done
for h in 25 1; do
  for s in 2101 2102 2103 2104; do k $R/h$h/maps/world-$s.fmg $R/h$h/biome-$s & done; wait
  for s in 2101 2102 2103 2104; do b $R/h$h/maps/world-$s.fmg $R/h$h/beer-$s & done; wait
done
echo done
