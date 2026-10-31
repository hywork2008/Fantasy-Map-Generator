"""Per-person tables of urban-money-shortfall-20261031.md from the L4 audits and treasury-36.json.
Usage: python3 summarize.py (run in this directory)."""
import json
from collections import defaultdict

L4 = "../livestock-meat-sales-l4-20261031/"
money = json.load(open(L4 + "money-l4-fix-84.json"))
markets = {str(r["market"]): r for r in (json.loads(l) for l in open(L4 + "l4markets.jsonl") if l.startswith("{")) if "market" in r}
treasury = json.load(open("treasury-36.json"))
MS = ["14", "15", "16", "21", "10", "1", "2", "4", "6", "7"]
last = money["years"][-1]
town = {m: last["people"][m] for m in MS}
rural = {m: sum(markets[m]["ruralByState"].values()) for m in MS}

def table(title, rows, scale):
    print("\n" + title)
    print("channel".ljust(56), " ".join(f"{m:>6}" for m in MS))
    keys = set().union(*[rows[m].keys() for m in MS])
    for k in sorted(keys, key=lambda k: -max(abs(rows[m].get(k, 0) * scale[m]) for m in MS))[:20]:
        print(k[:56].ljust(56), " ".join(f"{rows[m].get(k, 0) * scale[m]:6.3f}" for m in MS))

print("town wallet per town person, start of year")
for y in money["years"]:
    print(y["date"][0], " ".join(f"{y['start'].get(m, 0) / y['people'][m]:6.3f}" for m in MS))
table("town flows per town person, 1306", {m: last["flows"][m] for m in MS}, {m: 1 / town[m] for m in MS})
table("rural flows per rural person x1000, 1306", {m: last["ruralFlows"][m] for m in MS}, {m: 1000 / rural[m] for m in MS})
t = {m: defaultdict(float) for m in MS}
for y in treasury["years"]:
    for m in MS:
        for k, v in y["flows"].get(m, {}).items():
            t[m][k] += v / len(treasury["years"])
table("market treasury flows per town person per year, 36 months", t, {m: 1 / town[m] for m in MS})
print("\nmarket rural/town  rural cash income  salt  salt share  saltworks")
for m in MS:
    f = last["ruralFlows"][m]
    inc = sum(v for v in f.values() if v > 0)
    salt = -sum(v for k, v in f.items() if "salt" in k.lower())
    works = sum(1 for w in treasury["saltworks"] if str(w["market"]) == m)
    print(m, round(rural[m] / town[m], 1), round(inc / rural[m] * 1000, 1), round(salt / rural[m] * 1000, 1), round(salt / inc, 2), works)

print("\nyear  salt paid by treasuries  town salt wages  freight  state payroll  household income (section 6.3)")
for i, y in enumerate(treasury["years"]):
    s = defaultdict(float)
    for f in y["flows"].values():
        for k, v in f.items():
            s[k] += v
    paid = -s["- saltFinance.paySaltWholesale"] - s["+ saltFinance.paySaltWholesale"] - s["- saltFinance.repaySaltPayables"]
    my = money["years"][i]
    u, r = defaultdict(float), defaultdict(float)
    for f in my["flows"].values():
        for k, v in f.items():
            u[k] += v
    for f in my["ruralFlows"].values():
        for k, v in f.items():
            r[k] += v
    payroll = u["+ householdWealth.payStateHouseholds"] + r["+ householdWealth.payStateHouseholds"]
    income = sum(v for v in u.values() if v > 0) + sum(v for v in r.values() if v > 0)
    print(my["date"][0], round(paid), round(u["+ saltFinance"]), round(u["+ saltFinance.paySaltWholesale"]), round(payroll), round(income))
