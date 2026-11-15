#!/bin/sh
# Glassmaker houses seeded from the founding months' glass use, 36 months: v4 from the mean draw of
# the first 3 months, v5 from the highest running draw of the first 12. Compared against the v3
# outputs of run-v3.sh, run on the same maps with the same script (caravan raids off, deterministic).
#   sh run-v4.sh <worktree> <v4|v5>
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/glass-houses-20261107
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/site-bonus-20261107/h25/maps
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  CLAYFLOW_GOODS="Glass,White sand,Potash,Wood" \
  npx tsx docs/analytics/cold-clay-20261107/clayflow.mts $M/world-$3.fmg $R/$2-$3.json 36 add "Clay,White sand" > $R/$2-$3.log 2>&1); }
f $1 $2 2102 & f $1 $2 2103 & wait
echo done
