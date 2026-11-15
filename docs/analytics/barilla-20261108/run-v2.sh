#!/bin/sh
# v2-v4 (docs/analytics/barilla-20261108.md §5): the new code with Glass priced from its stocked recipe,
# on the same maps and settings as run.sh. Both seeds at once.
#   sh run-v2.sh <new worktree> [new2|new3|new4]
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $R/maps/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
f $1 ${2:-new2} 2102 & f $1 ${2:-new2} 2103 & wait
echo done
