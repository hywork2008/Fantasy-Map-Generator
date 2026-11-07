"""Summarize clayprobe.mts outputs (docs/analytics/cold-clay-20261107.md).

  python3 docs/analytics/cold-clay-20261107/summarize.py <raw dir> <prefix> <seed>...
"""
import json
import sys

raw, prefix, seeds = sys.argv[1], sys.argv[2], sys.argv[3:]
rows, markets = {}, []
for seed in seeds:
    data = json.load(open(f"{raw}/{prefix}-{seed}.json"))
    for key, row in data["rows"].items():
        acc = rows.setdefault(key, {"cells": 0, "eligible": 0, "clay": 0, "people": 0})
        for k in acc:
            acc[k] += row[k]
    markets += [dict(m, seed=seed) for m in data["markets"]]
print("biome | temp band | land cells | shore/river | clay cells | rural people (k)")
for key, row in sorted(rows.items(), key=lambda kv: -kv[1]["people"]):
    biome, band = key.split("|")
    if row["people"] < 20:
        continue
    print(f"{biome:<30} {band:>5} {row['cells']:>7} {row['eligible']:>7} {row['clay']:>5} {row['people']:>9.0f}")
total = sum(r["clay"] for r in rows.values())
print(f"clay cells total {total}")
no_clay = [m for m in markets if m["clayCells"] == 0]
print(f"markets {len(markets)}, with no clay cell {len(no_clay)}")
for band in ("<0", "0-4", "4-8", ">=8"):
    def inband(t):
        if t is None:
            return False
        return {"<0": t < 0, "0-4": 0 <= t < 4, "4-8": 4 <= t < 8, ">=8": t >= 8}[band]
    ms = [m for m in markets if inband(m["meanTemp"])]
    nc = [m for m in ms if m["clayCells"] == 0]
    print(f"  mean temp {band:>4}: markets {len(ms):>3}, no clay {len(nc):>3}, people {sum(m['people'] for m in ms):>8.0f}k, people in no-clay {sum(m['people'] for m in nc):>8.0f}k")
