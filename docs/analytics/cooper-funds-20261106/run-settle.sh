#!/bin/sh
# Consignment and household payment (market-goods-settlement.md S2): P1 maps of start-stock-20261105,
# 48 months, raids off, peace. Run from a worktree frozen at HEAD (base/) and one with the change
# applied (settle/). Usage: run-settle.sh <base|settle> <seed>...
A=$1; shift
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/cooper-funds-20261106/$A
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/start-stock-20261105/maps
E="FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
mkdir -p $R
s() { env $E npx tsx docs/analytics/cooper-funds-20261106/sellprobe.mts $M/world-$1.fmg $R/sell-$1.json 48 > $R/sell-$1.log 2>&1; }
for seed in "$@"; do s $seed & done; wait
