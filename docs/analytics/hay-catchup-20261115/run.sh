#!/bin/sh
# Free adult days after the hay season (docs/analytics/hay-catchup-20261115.md): one month of 2102 with the
# default settings, recorded by slack.mts for the April-short cells of urban-harvest-help-20261114.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/hay-catchup-20261115
mkdir -p $R
E="env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072"
(cd $1 && $E npx tsx docs/analytics/hay-catchup-20261115/slack.mts $M/world-2102.fmg /Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/urban-harvest-help-20261114/cells-2102.json $R/slack-2102.json > $R/slack-2102.log 2>&1)
echo done
