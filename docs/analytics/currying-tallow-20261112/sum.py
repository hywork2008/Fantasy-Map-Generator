"""Currying tallow vs household-goods-values (docs/analytics/byproduct-pricing-20261111.md).
   Run in docs/analytics/raw: python3 ../byproduct-pricing-20261111/sum.py"""
import json
from collections import defaultdict
def load(p): return json.load(open(p))["snapshots"]
G = ("Leather", "Tallow", "Boots", "Leather Goods", "Candles", "Cattle", "Harnesses")
for m in ("2102", "2103"):
    for tag, p in (("prev", f"household-goods-values-20261112/new-{m}.json"), ("new", f"currying-tallow-20261112/new-{m}.json")):
        S = load(p); y = [s for s in S if 25 <= s["month"] <= 36]
        print(f"== {m} {tag}")
        for g in G:
            st = [S[i]["stock"].get(g, [0, 0]) for i in (11, 23, 35)]
            print(f"  {g:14s} m12,24,36 stock/mean[/weighted]:", [f"{v[0]/1000:.0f}k/" + "/".join(str(x) for x in v[1:]) for v in st])
            t = defaultdict(float)
            for s in y:
                for k, v in s["flows"].items():
                    if k.startswith(g + "|"): t[k] += v
            for k, v in sorted(t.items(), key=lambda kv: -kv[1])[:5]: print(f"     {v:12,.0f} {k}")
        for k in ("rural", "marketCash", "townHouseholds", "townTreasury", "stateTreasury"):
            print(f"  {k:15s}", " ".join(f"{S[i]['money'][k]/1000:7.0f}" for i in (0, 11, 23, 35)))
