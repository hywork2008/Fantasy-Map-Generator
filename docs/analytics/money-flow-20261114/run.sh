#!/bin/sh
# Money flow by step (docs/analytics/money-flow-20261114.md): 36 months of 2103 under four settings.
#   sh run.sh <worktree>
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/money-flow-20261114
mkdir -p $R
f() { (cd $1 && env FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 FMG_SETTINGS="$3" \
  npx tsx docs/analytics/money-flow-20261114/holdersteps.mts $M/world-2103.fmg $R/$2.json 36 > $R/$2.log 2>&1); }
f $1 default '{}' & f $1 pollTax '{"stateBudgetIncome":"pollTax"}' & wait
f $1 legacyMaster '{"guildMasterSeat":"legacy","guildMasterIncome":"stipend"}' & f $1 both '{"stateBudgetIncome":"pollTax","guildMasterSeat":"legacy","guildMasterIncome":"stipend"}' & wait
echo done
