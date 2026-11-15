#!/bin/sh
# Craft book credit (docs/analytics/craft-credit-20261109.md): 24 months of the two warm maps of
# docs/analytics/barilla-20261108.md with the soap flows (barillaflow.mts), and 12 months of seed
# 2103 with the town purses by step (town-purse-20261109/pursesteps.mts). The base is
# docs/analytics/soap-potash-20261109.md and docs/analytics/town-purse-20261109.md.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/craft-credit-20261109
f() { (cd $1 && env CLAYFLOW_GOODS="Soap,Castile Soap,Barilla,Oil,Olives,Tallow,Potash,Glass,Ash" FMG_CONFLICT_AUTONOMY=peace \
  FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/barilla-20261108/barillaflow.mts $M/world-$3.fmg $R/$2-$3.json 24 add "Clay,White sand" \
  > $R/$2-$3.log 2>&1); }
f $1 credit 2102 & f $1 credit 2103 & wait
(cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/town-purse-20261109/pursesteps.mts $M/world-2103.fmg $R/purse-2103.json 12 > $R/purse-2103.log 2>&1)
echo done
