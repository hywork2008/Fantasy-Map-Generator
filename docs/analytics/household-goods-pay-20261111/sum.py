"""Household goods free vs pay and goods stocks (docs/analytics/household-goods-pay-20261111.md).
   Run in docs/analytics/raw/household-goods-pay-20261111: python3 sum.py"""
import json
from collections import defaultdict
GOODS = ["Milk", "Cheese", "Grapes", "Raisins", "Wine", "Honey", "Apples", "Pears", "Cider", "Perry", "Mead", "Ale"]
def load(mode, m): return json.load(open(f"{mode}-{m}.json"))["snapshots"]
for m in ("2102", "2103"):
    for mode in ("free", "pay"):
        S = load(mode, m); y = [s for s in S if 25 <= s["month"] <= 36]
        print(f"== {m} {mode} year 3")
        sat = []
        for g in GOODS:
            d = sum(s["demand"].get(g, 0) for s in y)
            c = sum(v for s in y for k, v in s["flows"].items() if k.startswith(g + "|sink|household"))
            if d > 0: sat.append(f"{g} {100*c/d:.0f}%")
        print(" satisfied:", ", ".join(sat))
        for k in ("rural", "marketCash", "townHouseholds", "townTreasury", "stateTreasury"):
            print(f"  {k:15s}", " ".join(f"{S[i]['money'][k]/1000:7.0f}" for i in (0, 11, 23, 35)))
        L = [S[i]["stock"].get("Leather", [0, 0]) for i in (0, 5, 11, 17, 23, 29, 35)]
        print("  Leather stock/price m1,6,12,18,24,30,36:", [f"{u/1000:.0f}k/{p}" for u, p in L])
for m in ("2102", "2103"):
    S = load("free", m); y = [s for s in S if 25 <= s["month"] <= 36]
    t = defaultdict(float)
    for s in y:
        for k, v in s["flows"].items():
            if k.startswith("Leather|"): t[k] += v
    print(f"== Leather flows {m} free year 3")
    for k, v in sorted(t.items(), key=lambda kv: -kv[1]): print(f"  {v:12,.0f} {k}")
    grow = []
    for name in S[0]["stock"]:
        a, b = S[11]["stock"].get(name, [0])[0], S[35]["stock"].get(name, [0])[0]
        made = sum(v for s in y for k, v in s["flows"].items() if k.startswith(name + "|source"))
        if b - a > 0 and made > 0: grow.append((((b - a) / 2) / made, name, a, b, made))
    print(f"== goods whose stock grew m12->m36, (yearly growth / year-3 made) top 15 {m}")
    for r, name, a, b, made in sorted(grow, reverse=True)[:15]: print(f"  {r:6.2f} {name:20s} {a:12,.0f} -> {b:12,.0f} made/yr {made:12,.0f}")
