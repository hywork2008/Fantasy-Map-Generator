"""Compare simulated prices with England c.1500-1540, as kg of wheat per physical unit.
   python3 compare.py prices-2102.json [prices-2103.json ...]"""
import json, sys, os
here = os.path.dirname(__file__)
M = json.load(open(os.path.join(here, "measures.json")))
WHEAT_D_PER_KG = 0.35  # 6.5 s/quarter (~218 kg), 1500-1540 mean (Rogers, Beveridge); +-30%
# (good, per, physical amount per sim unit, Tudor pence per that amount, note)
REF = [
  ("Meat", "kg", None, 0.8, "beef ~0.35 d/lb"),
  ("Cheese", "kg", None, 1.4, "~0.6 d/lb"),
  ("Beer", "L", None, 0.22, "ale ~1 d/gallon"),
  ("Wine", "L", None, 1.8, "Gascon ~8 d/gallon"),
  ("Salt", "kg", None, 0.2, "~5 d/bushel"),
  ("Tallow Candles", "kg", None, 2.6, "~1.2 d/lb"),
  ("Candles", "kg", None, 15, "wax ~7 d/lb"),
  ("Wool", "kg", None, 5.0, "~£4 per 364 lb sack"),
  ("Wool Cloth", "kg", None, 12, "kersey/plain cloth"),
  ("Linen", "kg", None, 10, "~4 d/ell"),
  ("Iron Ingot", "kg", None, 1.5, "bar iron ~£6/ton"),
  ("Cattle", "head", 1, 160, "cow/ox 10-16 s"),
  ("Sheep", "head", 1, 20, "~1 s 8 d"),
  ("Horses", "head", 25, 300, "cart horse ~25 s each"),
  ("Boots", "pair", 20, 7, "shoes ~6-8 d"),
  ("Wood", "kg", None, 0.025, "firewood load ~2 s/t"),
]
def per_unit(name, per, count):
    m = M[name]
    if per == "kg": return m["kg"]
    if per == "L": return m["liters"]
    return count
for path in sys.argv[1:]:
    d = json.load(open(path))
    snaps = [s for s in d["snaps"] if "prices" in s]
    pick = [s for s in snaps if s["month"] in (0, 12, 24, 36, 48, 60)]
    print("\n##", os.path.basename(path), "months", [s["month"] for s in pick])
    print("good | Tudor kg-wheat/unit | sim by month | sim/Tudor (last)")
    for name, per, count, pence, note in REF:
        tud = pence / WHEAT_D_PER_KG
        row = []
        for s in pick:
            g = s["prices"]["goods"]; w = g["Grain"]["median"] / M["Grain"]["kg"]
            if name not in g: row.append(None); continue
            row.append(g[name]["median"] / per_unit(name, per, count) / w)
        last = row[-1]
        print(f"{name}/{per} | {tud:.2f} | " + " ".join(f"{v:.2f}" if v else "-" for v in row) + f" | {last/tud:.2f} ({note})")
    # wage: per person-day (25 days/month)
    print("labour day (kg wheat):", [round(s["prices"]["wageMedian"]/1000/25/(s["prices"]["goods"]["Grain"]["median"]/M["Grain"]["kg"]),2) for s in pick], "Tudor labourer 4d:", round(4/WHEAT_D_PER_KG,1))
    print("staple/wheat/grain median:", [(s["prices"]["goods"]["Grain"]["median"], s["prices"]["goods"]["Wheat"]["median"], s["prices"]["goods"]["Rye"]["median"]) for s in pick])
    allm = d["snaps"]
    print("money by year (k):")
    for s in allm:
        if s["month"] % 12 == 0:
            m = s["money"]; tot = sum(m.values())
            heads = None
            print(s["month"], {k: round(v/1000) for k, v in m.items()}, "total", round(tot/1000))
    p0 = snaps[0]["pop"]; heads = (p0["ruralPoints"] + p0["urbanPoints"]) * d["populationRate"]
    for s in pick:
        tot = sum(next(x for x in allm if x["month"] == s["month"])["money"].values())
        p = s["pop"]; heads = (p["ruralPoints"] + p["urbanPoints"]) * d["populationRate"]
        w = s["prices"]["goods"]["Grain"]["median"] / M["Grain"]["kg"]
        print(f"m{s['month']}: heads {heads/1e6:.2f}M urban {p['urbanPoints']/(p['ruralPoints']+p['urbanPoints']):.1%}, money/head {tot/heads:.3f} SP = {tot/heads/w:.0f} kg wheat (Tudor ~130d = {130/WHEAT_D_PER_KG:.0f} kg)")
