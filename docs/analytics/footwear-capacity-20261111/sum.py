"""Footwear capacity vs leather-uses (docs/analytics/footwear-capacity-20261111.md).
   Run in docs/analytics/raw: python3 ../footwear-capacity-20261111/sum.py"""
import json
from collections import defaultdict
def load(p): return json.load(open(p))["snapshots"]
for m in ("2102", "2103"):
    for tag, p in (("prev", f"leather-uses-20261111/new-{m}.json"), ("new", f"footwear-capacity-20261111/new-{m}.json")):
        S = load(p); y = [s for s in S if 25 <= s["month"] <= 36]
        print(f"== {m} {tag}")
        for g in ("Leather", "Boots", "Leather Goods"):
            st = [S[i]["stock"].get(g, [0, 0]) for i in (11, 23, 35)]
            print(f"  {g} stock/price m12,24,36:", [f"{u/1000:.0f}k/{pr}" for u, pr in st])
            t = defaultdict(float)
            for s in y:
                for k, v in s["flows"].items():
                    if k.startswith(g + "|"): t[k] += v
            for k, v in sorted(t.items(), key=lambda kv: -kv[1])[:8]: print(f"     {v:12,.0f} {k}")
            d = sum(s["demand"].get(g, 0) for s in y)
            if d: print(f"     demand {d:,.0f}")
        for k in ("rural", "marketCash", "townHouseholds", "townTreasury", "stateTreasury"):
            print(f"  {k:15s}", " ".join(f"{S[i]['money'][k]/1000:7.0f}" for i in (0, 11, 23, 35)))
