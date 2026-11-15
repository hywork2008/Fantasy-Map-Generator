#!/bin/sh
# Town soap (docs/analytics/town-soap-20261108.md): 24 months on the warm maps of
# docs/analytics/barilla-20261108.md, the town soap need on its default (2 kg a town person a year).
# The base is the "new" run of docs/analytics/castile-soap-20261108.md (the same code without the need).
# barillaflow.mts watches the goods below; the two seeds run at once.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/town-soap-20261108
f() { (cd $1 && env CLAYFLOW_GOODS="Soap,Castile Soap,Barilla,Oil,Olives,Tallow,Potash,Glass,Ash" FMG_CONFLICT_AUTONOMY=peace \
  FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $M/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
f $1 soap 2102 & f $1 soap 2103 & wait
echo done
