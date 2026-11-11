#!/bin/sh
# Rural household cash flows (docs/analytics/rural-flows-20261111.md): 24 months of the two warm
# maps of docs/analytics/barilla-20261108.md.   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-flows-20261111
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/rural-flows-20261111/flows.mts $M/world-$2.fmg $R/flows-$2.json 24 \
  > $R/flows-$2.log 2>&1); }
f $1 2102 & f $1 2103 & wait
echo done
