#!/bin/sh
# Who pays for the church wax (docs/analytics/church-wax-pay-20261113.md): goods.mts of
# church-wax-20261113 with FMG_WAX_KG overriding waxCandleKgPerPerson, 36 months of map 2102,
# church wax 0 and 0.05 on the same code.
#   sh run.sh <worktree>            36 months
#   sh run.sh <worktree> callers    3 months, town household money by caller
M=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/barilla-20261108/maps
R=/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/church-wax-pay-20261113
mkdir -p $R
f() { (cd $1 && env FMG_WAX_KG=$2 FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
  npx tsx docs/analytics/church-wax-pay-20261113/goods.mts $M/world-2102.fmg $R/wax$2-2102.json 36 free \
  > $R/wax$2-2102.log 2>&1); }
if [ "$2" = callers ]; then
  g() { (cd $1 && env FMG_WEALTH_CALLERS=1 FMG_WAX_KG=$2 FMG_CONFLICT_AUTONOMY=peace FMG_CARAVAN_RAIDS=off NODE_OPTIONS=--max-old-space-size=3072 \
    npx tsx docs/analytics/church-wax-pay-20261113/goods.mts $M/world-2102.fmg $R/callers$2-2102.json 3 free \
    > $R/callers$2-2102.log 2>&1); }
  g $1 0 & g $1 0.05 & wait
else
  f $1 0 & f $1 0.05 & wait
fi
echo done
