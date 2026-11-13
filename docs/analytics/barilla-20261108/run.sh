#!/bin/sh
# Barilla (docs/analytics/barilla-20261108.md): warm maps at 30 degrees N generated on the base code, then
# 24 months on the base and the new code, two runs at a time. Clay and White sand are added on the
# cold lands in both, as in docs/analytics/glass-houses-20261107.md.
#   sh run.sh <base worktree> <new worktree>
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108
S=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/barilla-20261108
for s in 2102 2103; do
  [ -f $R/maps/world-$s.fmg ] || (cd $1 && node scripts/generateSmallMaps.mjs $R/maps --scope world --seed $s \
    --local-storage $S/storage-warm.json --wait-extensions > $R/gen-$s.log 2>&1)
done
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $R/maps/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
for s in 2102 2103; do
  f $1 base $s & f $2 new $s & wait
done
echo done
