"""Summarize containerflow.mts outputs (docs/analytics/drink-containers-20261107.md).

  python3 docs/analytics/drink-containers-20261107/summarize.py <raw dir> <seed>...
"""
import json
import sys

DRINKS = ["Beer", "Wine", "Cider", "Perry", "Mead"]
CONTAINERS = ["Barrels", "Ceramics", "Glass"]
raw, seeds = sys.argv[1], sys.argv[2:]


def load(name):
    return json.load(open(f"{raw}/{name}.json"))["snapshots"]


for seed in seeds:
    runs = {variant: load(f"{variant}-{seed}") for variant in ("base", "new")}
    print(f"== seed {seed}")
    print("drink        variant  drunk/yr  unmet/yr  met%   m12 met%")
    for drink in DRINKS:
        for variant, snaps in runs.items():
            drunk = sum(s["drinks"].get(drink, {}).get("household", 0) for s in snaps)
            unmet = sum(s["drinks"].get(drink, {}).get("unmet", 0) for s in snaps)
            last = snaps[-1]["drinks"].get(drink, {})
            m12 = last.get("household", 0) / max(1e-9, last.get("household", 0) + last.get("unmet", 0))
            met = drunk / max(1e-9, drunk + unmet)
            print(f"{drink:<12} {variant:<7} {drunk:>9.0f} {unmet:>9.0f} {met:>5.0%} {m12:>9.0%}")
    print("container recipe input by drink (units/yr)")
    for variant, snaps in runs.items():
        totals = {}
        for s in snaps:
            for key, units in s["flows"].items():
                parts = key.split(":")
                if parts[0] in CONTAINERS and parts[1] == "sink" and parts[2] == "recipeInput":
                    label = f"{parts[0]}->{parts[3] if len(parts) > 3 else '?'}"
                    totals[label] = totals.get(label, 0) + units
        print(f"  {variant}: " + ", ".join(f"{k} {v:.1f}" for k, v in sorted(totals.items())))
    print("containers at month 12 (stock, price, circulation)")
    for variant, snaps in runs.items():
        for name in CONTAINERS:
            c = snaps[-1]["containers"].get(name)
            if not c:
                continue
            circ = c["circulation"]
            returned = sum(
                s["flows"].get(f"{name}:source:containerReturn", 0) for s in snaps
            )
            print(
                f"  {variant} {name:<9} stock {c['stock']:>9.0f} price {c['price']:>6.3f}"
                f" empties {circ['empties']:>8.0f} filled {circ['filled']:>7.0f} shipped {circ['shipped']:>6.0f}"
                f" reused {circ['reused']:>9.0f} bought {circ['bought']:>7.0f} lost {circ['lost']:>7.0f}"
                f" released {circ['released']:>7.0f} (flow {returned:.0f})"
            )
    print("Beer monthly: drunk / unmet (base | new)")
    for b, n in zip(runs["base"], runs["new"]):
        bd, nd = b["drinks"]["Beer"], n["drinks"]["Beer"]
        print(f"  m{b['month']:>2} {bd['household']:>7.0f} {bd['unmet']:>7.0f} | {nd['household']:>7.0f} {nd['unmet']:>7.0f}")
