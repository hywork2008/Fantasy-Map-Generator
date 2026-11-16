"""Compare two goods.mts outputs for fuel-price-share-20261113: peat and wood, salt, money."""
import json, sys
def load(p): return json.load(open(p))["snapshots"]
def yr(s, lo, hi):
    t = {}
    for x in s:
        if lo <= x["month"] <= hi:
            for k, v in x["flows"].items(): t[k] = t.get(k, 0) + v
    return t
old, new = load(sys.argv[1]), load(sys.argv[2])
for name, s in (("old", old), ("new", new)):
    h = [x["flows"].get("Peat|source|ruralHarvest", 0) for x in s]
    y3 = yr(s, 25, 36)
    fuel = lambda g: sum(v for k, v in y3.items() if k.startswith(g + "|sink|") and ("householdHeating" in k or "recipeInput" in k and ">" not in k))
    print(name, "peat y2 %d y3 %d max-month %d months>500 %d" % (sum(h[12:24]), sum(h[24:]), max(h), sum(v > 500 for v in h)))
    print("   y3 peat heating %d recipe %d | wood heating %d" % (y3.get("Peat|sink|householdHeating", 0), y3.get("Peat|sink|recipeInput", 0), y3.get("Wood|sink|householdHeating", 0)))
    print("   salt prod y3 %d | wood stock/price m36 %s peat %s" % (sum(v for k, v in y3.items() if k.startswith("Salt|source|")), s[35]["stock"]["Wood"], s[35]["stock"]["Peat"]))
    print("   money m36", {k: round(v / 1e3) for k, v in s[35]["money"].items()})
