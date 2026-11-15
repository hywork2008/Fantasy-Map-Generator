#!/bin/sh
# Farm families' town spending by need (docs/analytics/rural-town-spending-20261111.md): the holders
# probe of money-holders-20261110 and the flows probe of rural-flows-20261111, on the two warm maps
# of barilla-20261108, 24 months.   sh run.sh <worktree>   (0c0ca6927 with docs/plan/rural-town-spending.md)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/rural-town-spending-20261111
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/$2.mts $M/world-$3.fmg $R/$4-$3.json 24 > $R/$4-$3.log 2>&1); }
f $1 money-holders-20261110/holders 2102 holders & f $1 money-holders-20261110/holders 2103 holders & wait
f $1 rural-flows-20261111/flows 2102 flows & f $1 rural-flows-20261111/flows 2103 flows & wait
echo done
