"""Compare clayflow.mts outputs, saved Clay (base) against Clay added on the cold lands (add).

  python3 -I docs/analytics/cold-clay-20261107/compare.py <raw dir> <seed>... [--goods Clay,Ceramics,Brick]

Sums the 12 months' flows by good, the markets' temperature band and direction:category, and the
12th month's stock and mean price by good and band.
"""
import json
import sys

args = sys.argv[1:]
goods = ["Clay", "Ceramics", "Brick"]
if "--goods" in args:
    k = args.index("--goods")
    goods = args[k + 1].split(",")
    args = args[:k] + args[k + 2 :]
raw, seeds = args[0], args[1:]
BANDS = ["<0", "0-4", "4-8", ">=8"]
for seed in seeds:
    runs = {mode: json.load(open(f"{raw}/{mode}-{seed}.json")) for mode in ("base", "add")}
    print(f"== seed {seed}")
    print("  markets by band", runs["base"]["marketsByBand"])
    added = runs["add"]["added"]
    rows = added if all(isinstance(v, dict) for v in added.values()) else {"Clay": added}
    for name, row in rows.items():
        print(f"  added {name}", {k: round(v, 4) for k, v in row.items()})
    for mode, run in runs.items():
        print(f"  {mode} clay cells by market band", run["clayCells"], "by cell temp", run["clayByCellBand"])
        if "depositCells" in run:
            print(f"  {mode} deposit cells by market band", run["depositCells"])
    for good in goods:
        print(f"  -- {good}: 12-month flows by band (base -> add)")
        keys = set()
        for run in runs.values():
            for snap in run["snapshots"]:
                keys |= {k for k in snap["flows"] if k.startswith(good + ":")}
        totals = {
            mode: {k: sum(s["flows"].get(k, 0) for s in run["snapshots"]) for k in keys} for mode, run in runs.items()
        }
        for key in sorted(keys, key=lambda k: (BANDS.index(k.split(":")[1]) if k.split(":")[1] in BANDS else 9, k)):
            b, a = totals["base"][key], totals["add"][key]
            if max(b, a) < 1:
                continue
            print(f"    {key[len(good) + 1:]:<40} {b:>10.0f} -> {a:>10.0f}")
        for band in BANDS:
            row = []
            for run in runs.values():
                st = run["snapshots"][-1]["stocks"].get(f"{good}:{band}", {"stock": 0, "value": 0})
                price = st["value"] / st["stock"] if st["stock"] > 0 else 0
                row.append(f"stock {st['stock']:>9.0f} price {price:.3f}")
            print(f"    month 12 {band:>4}: {row[0]}  ->  {row[1]}")
