#!/bin/sh
# The work answer from the summer after a short spring (docs/analytics/livestock-feed-shortfall-20261115.md §4): 40
# months of 2102 with the default settings (feedShortfallTiming sameSummer), recorded by workyear.mts. The
# comparison is m40/legacy-2102.json and m40/random-2102.json (nextYear).
#   sh run-same.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/livestock-feed-shortfall-20261115/m40
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-2102.fmg $R/same-2102.json 40 > $R/same-2102.log 2>&1) &
(cd $1 && FMG_SETTINGS="{}" $E npx tsx docs/analytics/rural-work-year-20261115/workyear.mts $M/world-2103.fmg $R/same-2103.json 36 > $R/same-2103.log 2>&1) &
wait
echo done
