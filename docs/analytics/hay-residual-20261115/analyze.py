"""Breakdown of the April-short cells (docs/analytics/hay-residual-20261115.md).
python3 analyze.py <residual.json> <target month> ; the hay year is the 12 months up to the target."""
import json, sys
d = json.load(open(sys.argv[1])); t = int(sys.argv[2])
F = {f: i for i, f in enumerate(d["fields"])}
S = {s["month"]: s for s in d["snapshots"]}
g = lambda m, c, f: S[m]["cells"].get(c, [0]*len(F))[F[f]]
tgt = S[t]["cells"]
short = [c for c, v in tgt.items() if v[F["unmet"]] > 0.01 * v[F["required"]]]
alls = [c for c, v in tgt.items() if v[F["required"]] > 0]
print("calendar", S[t]["calendarMonth"], "short", len(short), "of", len(alls))
def agg(cells):
  T = dict(need=0, unmet=0, cut=0, cuttable=0, surplus=0, labor=0, uncutByLabor=0, uncutByGrass=0, stopByReserve=0, sloss=0, hloss=0, bought=0, sold=0, residue=0, catch=0)
  for c in cells:
    for m in range(t-11, t+1):
      req = g(m,c,"required"); T["need"] += req; T["unmet"] += g(m,c,"unmet")
      cut = g(m,c,"cutKept") + g(m,c,"harvestLoss"); cutt = g(m,c,"cuttable"); lab = g(m,c,"laborKg")
      T["cut"] += cut; T["cuttable"] += cutt; T["surplus"] += max(0, g(m,c,"grown")-g(m,c,"grazing")); T["labor"] += lab
      T["sloss"] += g(m,c,"storageLoss"); T["hloss"] += g(m,c,"harvestLoss"); T["bought"] += g(m,c,"bought"); T["sold"] += g(m,c,"sold"); T["residue"] += g(m,c,"residue"); T["catch"] += g(m,c,"catchUpDays")
      left = cutt - cut
      if left <= 1: continue
      if lab <= cut + 1: T["uncutByLabor"] += left   # hands ran out first
      else: T["stopByReserve"] += left                # hands and grass left: reserve target reached
  return {k: round(v/1e6, 1) for k, v in T.items()}
print("short", agg(short)); print("all", agg(alls))
# per short cell: annual surplus growth vs wintered need (feasible at all?)
inf = 0
for c in short:
  sur = sum(max(0, g(m,c,"grown")-g(m,c,"grazing")) for m in range(t-11,t+1))
  gap = sum(max(0, g(m,c,"required")-g(m,c,"grazing")) for m in range(t-11,t+1))
  if sur * 0.85 < gap: inf += 1
print("short cells whose year's surplus growth (x0.85 retention) is below the grazing gap:", inf)
