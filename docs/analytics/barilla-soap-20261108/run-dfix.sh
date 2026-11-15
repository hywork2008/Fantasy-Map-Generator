#!/bin/sh
# Barilla soap (docs/analytics/barilla-soap-20261108.md): the new code with the industrial demand that
# skips recipes of unknown ingredients (dfix), 24 months on both maps at once, as run.sh.
#   sh run-dfix.sh <dfix worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-soap-20261108
f() { (cd $1 && env CLAYFLOW_GOODS="Soap,Barilla,Oil,Olives,Tallow,Potash,Glass" FMG_CONFLICT_AUTONOMY=peace \
  FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $M/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
f $1 dfix 2102 & f $1 dfix 2103 & wait
echo done
