#!/bin/sh
# Sales of town output to the market (cooper-funds-20261106.md): P1 maps 2101 and 2104 of
# start-stock-20261105, 30 months, raids off, peace, at 147986dab.
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/cooper-funds-20261106
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R
s() { env $E npx tsx docs/analytics/cooper-funds-20261106/sellprobe.mts $M/world-$1.fmg $R/sell2-$1.json 30 > $R/sell2-$1.log 2>&1; }
s 2101 & s 2104 & wait
