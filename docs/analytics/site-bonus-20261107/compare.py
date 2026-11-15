"""Site-bonus and town-ale comparison (docs/analytics/site-bonus-20261107.md).

    python3 -I docs/analytics/site-bonus-20261107/compare.py <raw dir> <ale-biome raw dir>

B: beer-<seed>.json in <raw>/b against ale-biome-20261107 (same maps), months 13-36.
A: <raw>/h25 against <raw>/h1 (maps regenerated with siteBonusFullHabitability 25 and 1, B on in both):
map counts (small-maps.jsonl), K and people per biome (biomeprobe), ale made/demand (beerprobe).
"""
import json
import sys
from collections import defaultdict

raw, base = sys.argv[1], sys.argv[2]
SEEDS = (2101, 2102, 2103, 2104)


def ale(path):
    per = defaultdict(lambda: [0.0, 0.0])
    for snap in json.load(open(path))["snapshots"]:
        if 13 <= snap["month"] <= 36:
            for m in snap["markets"]:
                per[m["i"]][0] += m["aleDemand"]
                per[m["i"]][1] += min(m["made"].get("Beer", 0), m["aleDemand"])
    return per


def tot(per):
    return sum(v[0] for v in per.values()), sum(v[1] for v in per.values())


print("## B: town ale on the ale-biome-20261107 maps, months 13-36 (per month)")
print("seed | demand base | demand B | B/base | made/demand base | B | shortfall base | B | B/base")
T = [0.0] * 4
changed = []
for s in SEEDS:
    a, b = ale(f"{base}/beer-{s}.json"), ale(f"{raw}/b/beer-{s}.json")
    da, ma = tot(a)
    db, mb = tot(b)
    print(f"{s} | {da/24:.0f} | {db/24:.0f} | {db/da:.3f} | {ma/da:.3f} | {mb/db:.3f} | {(da-ma)/24:.0f} | {(db-mb)/24:.0f} | {(db-mb)/(da-ma):.2f}")
    for j, v in enumerate((da, ma, db, mb)):
        T[j] += v
    for i in sorted(a):
        if i in b and b[i][0] < 0.8 * a[i][0]:
            changed.append((s, i, a[i], b[i]))
da, ma, db, mb = T
print(f"all | {da/24:.0f} | {db/24:.0f} | {db/da:.3f} | {ma/da:.3f} | {mb/db:.3f} | {(da-ma)/24:.0f} | {(db-mb)/24:.0f} | {(db-mb)/(da-ma):.2f}")
print("\nmarkets whose demand fell below 0.8x")
print("seed | market | demand base | B | made/demand base | B | shortfall base | B")
for s, i, x, y in changed:
    print(f"{s} | {i} | {x[0]/24:.0f} | {y[0]/24:.0f} | {x[1]/x[0]:.2f} | {y[1]/y[0]:.2f} | {(x[0]-x[1])/24:.0f} | {(y[0]-y[1])/24:.0f}")

print("\n## A: maps per setting")
print("H | seed | burgs | states | provinces | burg pop (k) | K (M) | rural (M) | town (M) | town % | markets | ale/mo | made/demand")
world = {}
for h in (25, 1):
    W = [0.0] * 8
    for s in SEEDS:
        rows = [json.loads(x) for x in open(f"{raw}/h{h}/maps/small-maps.jsonl")]
        m = [x for x in rows if x["seed"] == str(s)][-1]
        c = m["counts"]
        bp = sum(x["population"] for x in m["burgs"])
        land = json.load(open(f"{raw}/h{h}/biome-{s}.json"))["rows"]
        K = sum(r["capacity"] for r in land)
        ru = sum(r["rural"] for r in land)
        ur = sum(r["urban"] for r in land)
        per = ale(f"{raw}/h{h}/beer-{s}.json")
        d, mk = tot(per)
        print(f"{h} | {s} | {c['burgs']} | {c['states']} | {c['provinces']} | {bp:.0f} | {K/1e6:.2f} | {ru/1e6:.2f} | {ur/1e6:.3f} | {ur/(ru+ur)*100:.1f} | {len(per)} | {d/24:.0f} | {mk/d:.3f}")
        for j, v in enumerate((c["burgs"], K, ru, ur, len(per), d, mk, bp)):
            W[j] += v
    world[h] = W
    print(f"{h} | all | {W[0]:.0f} | | | {W[7]:.0f} | {W[1]/1e6:.2f} | {W[2]/1e6:.2f} | {W[3]/1e6:.3f} | {W[3]/(W[2]+W[3])*100:.1f} | {W[4]:.0f} | {W[5]/24:.0f} | {W[6]/W[5]:.3f}")
a, b = world[25], world[1]
print(f"H25/H1 | burgs {a[0]/b[0]:.2f} | K {a[1]/b[1]:.2f} | rural {a[2]/b[2]:.2f} | town {a[3]/b[3]:.2f} | markets {a[4]/b[4]:.2f}")

print("\n## A: K and town people per biome, all seeds")
print("biome | habitability | cells | K H1 (k) | K H25 (k) | H25/H1 | K per cell vs temperate deciduous H1 | H25 | town H1 (k) | town H25 (k) | town % H1 | H25")
agg = {}
for h in (25, 1):
    t = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for s in SEEDS:
        land = json.load(open(f"{raw}/h{h}/biome-{s}.json"))
        names = {x["i"]: (x["name"], x["habitability"]) for x in land["biomes"]}
        for r in land["rows"]:
            v = t[names[r["biome"]]]
            v[0] += r["capacity"]; v[1] += r["rural"]; v[2] += r["urban"]; v[3] += r["cells"]
    agg[h] = t
ref = {h: agg[h][("Temperate deciduous forest", 100)] for h in (25, 1)}
for k in sorted(agg[1], key=lambda k: -agg[1][k][0]):
    x, y = agg[1][k], agg[25].get(k, [0, 0, 0, 0])
    if x[0] < 1e4:
        continue
    dens = lambda v, h: (v[0] / v[3]) / (ref[h][0] / ref[h][3]) if v[3] and v[0] else 0
    pct = lambda v: v[2] / (v[1] + v[2]) * 100 if v[1] + v[2] else 0
    rd = lambda d: f"1/{1/d:.1f}" if d else "0"
    print(f"{k[0]} | {k[1]} | {x[3]} | {x[0]/1e3:.0f} | {y[0]/1e3:.0f} | {y[0]/x[0]:.2f} | {rd(dens(x,1))} | {rd(dens(y,25))} | {x[2]/1e3:.1f} | {y[2]/1e3:.1f} | {pct(x):.1f} | {pct(y):.1f}")
