#!/bin/sh
# Barilla soap (docs/analytics/barilla-soap-20261108.md): 24 months on the warm maps of
# docs/analytics/barilla-20261108.md, on the base code, the base with only the soap pricing (soapfix)
# and the new code. The three runs of a seed at once. barillaflow.mts watches the goods below.
#   sh run.sh <base worktree> <soapfix worktree> <new worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-soap-20261108
f() { (cd $1 && env CLAYFLOW_GOODS="Soap,Barilla,Oil,Olives,Tallow,Potash,Glass" FMG_CONFLICT_AUTONOMY=peace \
  FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $M/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
for s in 2102 2103; do
  f $1 base $s & f $2 soapfix $s & f $3 new $s & wait
done
echo done
