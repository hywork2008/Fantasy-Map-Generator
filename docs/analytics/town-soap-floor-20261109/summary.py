# Town soap floor (docs/analytics/town-soap-floor-20261109.md): flows of the soaps and their ingredients summed over
# months 1-12 and 13-24 against the base (soap of docs/analytics/town-soap-20261108.md), the monthly
# soap the households took, and the stocks and prices at month 24.
#   python3 summary.py > summary.txt
import collections, json
B = '/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/town-soap-20261108/soap-{}.json'
N = '/Users/h-yamaguchi/Projects/fmg-2/docs/analytics/raw/town-soap-floor-20261109/floor-{}.json'
GOODS = ('Soap', 'Castile Soap', 'Barilla', 'Oil', 'Potash', 'Ash')
STOCKED = ('Soap', 'Castile Soap', 'Barilla', 'Oil', 'Potash', 'Tallow', 'Ash')
for seed in ['2102', '2103']:
    data = {'base': json.load(open(B.format(seed))), 'floor': json.load(open(N.format(seed)))}
    print(f'== seed {seed}')
    for label, lo, hi in [('months 1-12', 1, 12), ('months 13-24', 13, 24)]:
        totals = {}
        for run, d in data.items():
            t = collections.Counter()
            for snap in d['snapshots']:
                if lo <= snap['month'] <= hi:
                    for key, value in snap['flows'].items():
                        if key.split(':')[0] in GOODS:
                            t[key] += value
            totals[run] = t
        print(f' -- {label}:      base     floor')
        for key in sorted(set().union(*totals.values())):
            row = [totals[r][key] for r in data]
            if max(abs(v) for v in row) >= 0.5:
                print(f"   {key:58s} " + ' '.join(f'{v:9.1f}' for v in row))
    print(' -- floor run by month: households took (soft, white), hearth ash bought, potash made')
    for snap in data['floor']['snapshots']:
        t = collections.Counter()
        for key, value in snap['flows'].items():
            good, _band, direction, category = key.split(':')[:4]
            t[(good, direction, category.split('>')[0])] += value
        print(f"   month {snap['month']:2d}  soft {t[('Soap', 'sink', 'householdFood')]:7.1f}"
              f"  white {t[('Castile Soap', 'sink', 'householdFood')]:6.1f}"
              f"  ash {t[('Ash', 'source', 'hearthAsh')]:7.0f}  potash {t[('Potash', 'source', 'burgCraft')]:6.1f}")
    for run, d in data.items():
        stocks = {}
        for key, v in d['snapshots'][-1]['stocks'].items():
            good = key.split(':')[0]
            if good in STOCKED:
                s = stocks.setdefault(good, [0.0, 0.0])
                s[0] += v['stock']
                s[1] += v['value']
        print(f' -- {run} month 24 stock (price): ' + ', '.join(
            f"{g} {s[0]:.0f} ({s[1] / s[0]:.2f})" if s[0] > 0 else f'{g} 0' for g, s in stocks.items()))
