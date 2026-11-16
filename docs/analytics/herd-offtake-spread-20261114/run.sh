#!/bin/sh
# Herd offtake spread (docs/analytics/herd-offtake-spread-20261114.md): 36 months of 2102 and 2103 with herdOfftakeSpread toRenewal and legacy.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/herd-offtake-spread-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 FMG_SETTINGS="{\"herdOfftakeSpread\":\"$3\"}" \
  npx tsx docs/analytics/herd-offtake-spread-20261114/holdersteps.mts $M/world-$2.fmg $R/$3-$2.json 36 > $R/$3-$2.log 2>&1); }
f $1 2102 toRenewal & f $1 2103 toRenewal & wait
f $1 2102 legacy & f $1 2103 legacy & wait
echo done
