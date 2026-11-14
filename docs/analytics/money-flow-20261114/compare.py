"""Compare two holdersteps.mts outputs: per holder, the step-by-step difference of summed money moves
over months 1..N (B - A), largest first.  python3 compare.py <a.json> <b.json> [months]"""
import json, sys
a, b = (json.load(open(p)) for p in sys.argv[1:3])
n = int(sys.argv[3]) if len(sys.argv) > 3 else len(a["snapshots"])
H = a["holders"]
def sums(d):
    out = {}
    for s in d["snapshots"][:n]:
        for step, cells in s["steps"].items():
            row = out.setdefault(step, {})
            for h, v in cells.items(): row[h] = row.get(h, 0) + v
    return out
sa, sb = sums(a), sums(b)
print("after", n, "A", [round(x) for x in a["snapshots"][n-1]["after"]])
print("after", n, "B", [round(x) for x in b["snapshots"][n-1]["after"]])
for h in H:
    diffs = []
    for step in set(sa) | set(sb):
        va, vb = sa.get(step, {}).get(h, 0), sb.get(step, {}).get(h, 0)
        if abs(vb - va) > 1: diffs.append((vb - va, step, va, vb))
    diffs.sort(key=lambda x: -abs(x[0]))
    print(f"\n== {h}  total diff {sum(d[0] for d in diffs):.0f}")
    for d, step, va, vb in diffs[:8]: print(f"  {d:>10.0f}  {step}  ({va:.0f} -> {vb:.0f})")
