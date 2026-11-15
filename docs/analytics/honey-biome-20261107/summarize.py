"""Honey harvest per biome before and after the forage-land change (docs/analytics/honey-biome-20261107.md).

    python3 -I docs/analytics/honey-biome-20261107/summarize.py <raw dir>
"""
import json
import sys
from collections import defaultdict

raw = sys.argv[1]
KG_PER_BARREL = 168
out = {}
for k in ("before", "after"):
    t = defaultdict(lambda: [0, 0.0, 0.0])
    for s in (2101, 2102, 2103, 2104):
        for b, r in json.load(open(f"{raw}/{k}-{s}.json"))["rows"].items():
            v = t[b]
            v[0] += r["cells"]
            v[1] += r["rural"]
            v[2] += r["honeyBarrelsPerMonth"] * 12 * KG_PER_BARREL
    out[k] = t
print("biome | rural (k) | honey t/yr before | after | kg per rural person/yr before | after")
for b, v in sorted(out["after"].items(), key=lambda x: -x[1][1]):
    if v[1] <= 0:
        continue
    w = out["before"][b]
    print(f"{b} | {v[1]/1e3:.0f} | {w[2]/1e3:.0f} | {v[2]/1e3:.0f} | {w[2]/w[1]:.3f} | {v[2]/v[1]:.3f}")
for k in ("before", "after"):
    R = sum(v[1] for v in out[k].values())
    H = sum(v[2] for v in out[k].values())
    print(f"world {k}: rural {R/1e6:.2f}M, honey {H/1e3:.0f} t/yr, {H/R:.3f} kg per rural person/yr")
