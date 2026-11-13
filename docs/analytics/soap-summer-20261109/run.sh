#!/bin/sh
# Town soap by market (docs/analytics/soap-summer-20261109.md): 24 months of seed 2103 on the warm
# map of docs/analytics/barilla-20261108.md, at 8a3226417 (the soap and potash floors).
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/soap-summer-20261109
cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/soap-summer-20261109/soapmarkets.mts $M/world-2103.fmg $R/diag-2103.json 24 \
  > $R/diag-2103.log 2>&1
echo done
