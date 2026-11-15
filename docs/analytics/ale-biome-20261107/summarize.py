"""Ale shortfall by market and by biome (docs/analytics/ale-biome-20261107.md).

    python3 -I docs/analytics/ale-biome-20261107/summarize.py <raw dir> <seed>... [--from 13 --to 36]

Per market over the months: ale demand, Beer made and drunk (beerprobe), the shortfall (demand -
made) split by the guard that stopped the brewers (classify.py's rules), and the market's land from
biomeprobe: K (cells.capacity), the Economy's subsistence capacity, rural and town people, and the
biome holding most of K. Then per biome, each market's demand, made and shortfall shared out by the
biome's share of the market's K.
"""
import json
import sys
from collections import defaultdict

sys.path.insert(0, "")
args = [a for a in sys.argv[1:]]
first = int(args[args.index("--from") + 1]) if "--from" in args else 13
last = int(args[args.index("--to") + 1]) if "--to" in args else 36
args = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or not args[i - 1].startswith("--"))]
raw, seeds = args[0], args[1:]
BARRELS_PER_TUN = 0.4
CAUSES = ("grain", "casks", "profit", "recipe", "headroom")


def guard(m):
    dem = m["aleDemand"]
    brewable = sum((g or {}).get("stock", 0) for g in m["grains"].values())
    exportable = (m.get("food") or {}).get("exportable", 0)
    if min(brewable, exportable) < 0.5 * dem:
        return "grain"
    if m["barrels"]["stock"] < 0.05 * dem * BARRELS_PER_TUN:
        return "casks"
    counts = defaultdict(int)
    for k, v in m["diagnostics"].get("Beer", {}).items():
        if k.endswith("outputLots") or not k.startswith("planning:"):
            continue
        cons = k.split(":", 1)[1]
        counts["profit" if "profitability" in cons else "headroom" if cons in ("ranking", "chosen") else "recipe"] += v
    return max(counts, key=counts.get) if counts else "recipe"


by_biome = defaultdict(lambda: defaultdict(float))
for seed in seeds:
    beer = json.load(open(f"{raw}/beer-{seed}.json"))
    land = json.load(open(f"{raw}/biome-{seed}.json"))
    names = {b["i"]: b["name"] for b in land["biomes"]}
    hab = {b["i"]: b["habitability"] for b in land["biomes"]}
    mk = defaultdict(lambda: defaultdict(float))
    biomes_of = defaultdict(dict)
    for r in land["rows"]:
        m = mk[r["market"]]
        for k in ("cells", "capacity", "subsistence", "rural", "urban"):
            m[k] += r[k]
        biomes_of[r["market"]][r["biome"]] = r
    rows = defaultdict(lambda: defaultdict(float))
    prev = {}
    months = 0
    for snap in beer["snapshots"]:
        in_range = first <= snap["month"] <= last
        months += in_range
        for m in snap["markets"]:
            led = m.get("beerLedger") or {}
            drunk = led.get("drunk", 0) - prev.get(m["i"], 0)
            prev[m["i"]] = led.get("drunk", 0)
            if not in_range:
                continue
            r = rows[m["i"]]
            dem, made = m["aleDemand"], m["made"].get("Beer", 0)
            r["demand"] += dem
            r["made"] += made
            r["drunk"] += drunk
            r["brewPeople"] += m.get("brewingPeople", 0)
            if dem > made:
                r[guard(m)] += dem - made
    print(f"\n## {seed} months {first}-{last}")
    print("market | ale/mo | made | drunk | " + " | ".join(CAUSES) + " | brewers | town | rural | K | subsist/K | rural/K | main biome (share of K)")
    for i, r in sorted(rows.items(), key=lambda kv: -(kv[1]["demand"] - kv[1]["made"])):
        land_m = mk.get(i, {})
        d = r["demand"] or 1
        K = land_m.get("capacity", 0)
        top = sorted(biomes_of[i].values(), key=lambda b: -b["capacity"])[:2]
        top_s = ", ".join(f"{names[b['biome']]} {b['capacity'] / max(1, K):.0%}" for b in top)
        print(
            f"{i} | {r['demand'] / months:.0f} | {r['made'] / d:.2f} | {r['drunk'] / d:.2f} | "
            + " | ".join(f"{r[c] / d:.2f}" for c in CAUSES)
            + f" | {r['brewPeople'] / months:.0f} | {land_m.get('urban', 0):.0f} | {land_m.get('rural', 0):.0f} | {K:.0f} | "
            f"{land_m.get('subsistence', 0) / max(1, K):.2f} | {land_m.get('rural', 0) / max(1, K):.2f} | {top_s}"
        )
        for b in biomes_of[i].values():
            share = b["capacity"] / max(1, K)
            acc = by_biome[names[b["biome"]]]
            acc["hab"] = hab[b["biome"]]
            acc["cells"] += b["cells"]
            acc["K"] += b["capacity"]
            acc["subsistence"] += b["subsistence"]
            acc["rural"] += b["rural"]
            acc["urban"] += b["urban"]
            acc["demand"] += r["demand"] * share
            acc["made"] += r["made"] * share
            for c in CAUSES:
                acc[c] += r[c] * share

print(f"\n## by biome, seeds {' '.join(seeds)} (market figures shared by the biome's share of the market's K)")
print("biome | habitability | cells | K | subsist/K | rural/K | town people | ale made/demand | " + " | ".join(CAUSES))
for name, a in sorted(by_biome.items(), key=lambda kv: -kv[1]["K"]):
    d = a["demand"] or 1
    print(
        f"{name} | {a['hab']:.0f} | {a['cells']:.0f} | {a['K']:.0f} | {a['subsistence'] / max(1, a['K']):.2f} | "
        f"{a['rural'] / max(1, a['K']):.2f} | {a['urban']:.0f} | {a['made'] / d:.2f} | " + " | ".join(f"{a[c] / d:.2f}" for c in CAUSES)
    )
