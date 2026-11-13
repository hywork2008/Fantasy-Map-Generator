#!/bin/sh
# v4 (docs/analytics/barilla-20261108.md §6): the new code with the final glass pricing (new4), then
# the base code with only that pricing (basefix), on the maps of run.sh. Two runs at a time.
#   sh run-v4.sh <new worktree> <base worktree with the pricing files>
D=$(dirname "$0")
sh "$D/run-v2.sh" "$1" new4
sh "$D/run-v2.sh" "$2" basefix
echo done
