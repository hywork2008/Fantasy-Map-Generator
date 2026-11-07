#!/bin/sh
# A+B (docs/plan/low-habitability-site-bonus.md): run from a frozen worktree of the change.
# 1. B alone: beerprobe on the ale-biome-20261107 maps (P1 2101/2102, grain2 2103/2104), 36 months.
# 2. A: new world maps 2101-2104 with the site bonus in full from habitability 25 (default) and 1
#    (upstream), then beerprobe 36 months and biomeprobe on each. Raids off, peace.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
G=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/grain2/maps
S=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/site-bonus-20261107
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R/b $R/h25/maps $R/h1/maps
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $1 $2.json 36 > $2.log 2>&1; }
k() { npx tsx docs/analytics/ale-biome-20261107/biomeprobe.mts $1 $2.json > $2.log 2>&1; }
b $M/world-2101.fmg $R/b/beer-2101 & b $M/world-2102.fmg $R/b/beer-2102 & b $G/world-2103.fmg $R/b/beer-2103 & b $G/world-2104.fmg $R/b/beer-2104 & wait
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
