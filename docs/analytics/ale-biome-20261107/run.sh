#!/bin/sh
# Which markets cannot brew their ale demand, and their biomes (ale-biome-20261107.md): beerprobe on
# P1 2101/2102 and the grain2 maps 2103/2104 of start-stock-20261105 (the 2103/2104 P1 maps predate
# the harvest-month fix), 36 months, raids off, peace; then the biome table of each map.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/ale-biome-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
G=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/grain2/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R
b() { env $E npx tsx docs/analytics/beer-shortfall-20261104/beerprobe.mts $1 $R/beer-$2.json 36 > $R/beer-$2.log 2>&1; }
b $M/world-2101.fmg 2101 & b $M/world-2102.fmg 2102 & b $G/world-2103.fmg 2103 & b $G/world-2104.fmg 2104 & wait

p() { npx tsx docs/analytics/ale-biome-20261107/$1probe.mts $2 $R/$1-$3.json > $R/$1-$3.log 2>&1; }
for k in biome score; do
  p $k $M/world-2101.fmg 2101 & p $k $M/world-2102.fmg 2102 & p $k $G/world-2103.fmg 2103 & p $k $G/world-2104.fmg 2104 & wait
done
python3 -I docs/analytics/ale-biome-20261107/summarize.py $R 2101 2102 2103 2104 --from 13 --to 36 > docs/analytics/ale-biome-20261107/summary.txt
echo done
