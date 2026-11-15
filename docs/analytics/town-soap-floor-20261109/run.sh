#!/bin/sh
# Town soap floor (docs/analytics/town-soap-floor-20261109.md): 24 months on the warm maps of
# docs/analytics/barilla-20261108.md, the town soap need on its default (2 kg a town person a year).
# The base is the soap run of docs/analytics/town-soap-20261108.md (the need without the floor).
# barillaflow.mts watches the goods below; the two seeds run at once.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/town-soap-floor-20261109
f() { (cd $1 && env CLAYFLOW_GOODS="Soap,Castile Soap,Barilla,Oil,Olives,Tallow,Potash,Glass,Ash" FMG_CONFLICT_AUTONOMY=peace \
  FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $M/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
f $1 floor 2102 & f $1 floor 2103 & wait
echo done
