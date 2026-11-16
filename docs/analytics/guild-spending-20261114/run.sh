#!/bin/sh
# Guild spending (docs/analytics/guild-spending-20261114.md): goods.mts of peat-cut-plan-20261113 with
# the guild treasuries in the money and FMG_GUILD_SURPLUS overriding guildSurplusUse, 36 months.
#   sh run.sh <worktree>          spend and keep on 2102, spend on 2103 (2103 keep: peat-cut-plan new-2103)
#   sh run.sh <worktree> retune   spend on 2102 and 2103 with the retuned defaults (§3)
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/guild-spending-20261114
mkdir -p $R
f() { (cd $1 && env FMG_GUILD_SURPLUS=$2 FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/guild-spending-20261114/goods.mts $M/world-$3.fmg $R/$2-$3.json 36 free \
  > $R/$2-$3.log 2>&1); }
if [ "$2" = retune ]; then
  # guildReserveMonths 1, guildSpendRate 0.08 (§3): spend again on both maps
  f $1 spend 2102 & f $1 spend 2103 & wait
else
  f $1 spend 2102 & f $1 keep 2102 & wait
  f $1 spend 2103
fi
echo done
