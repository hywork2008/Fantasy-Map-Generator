import json,sys
S=sys.argv[1]
runs={'HEAD':json.load(open(f'{S}/haysurplus-36.json')),
      'A':json.load(open(f'{S}/haytrade-marketShortfall-36.json')),
      'B':json.load(open(f'{S}/haytrade-farmsFirst-36.json'))}
base=json.load(open(f'{S}/treasury-84.json'))
def tot(rows,k): return sum(v.get(k,0) for r in rows for v in r['feed'].values())/1000
print('year run   need     hayEat  unmet  unmet%  soldByFarms  boughtByFarms  barnEnd')
for y in range(3):
  for name,d in runs.items():
    rows=d['rows'][y*12:(y+1)*12]
    need=tot(rows,'requiredKg')
    print(y+1,'%-4s %8.0f %8.0f %7.0f %5.2f%% %8.0f %8.0f %8.0f'%(name,need,tot(rows,'hayConsumedKg'),tot(rows,'unmetKg'),100*tot(rows,'unmetKg')/need,tot(rows,'soldKg'),tot(rows,'purchasedKg'),sum(v.get('hayKg',0) for v in rows[-1]['feed'].values())/1000))
ms=['14','16','15','10','13','4','6','7','9','8']
print('rural purse month 36:', 'mkt', ' '.join('%7s'%m for m in ms),' total')
print('HEAD', ' '.join('%7d'%base['years'][2]['end'][m]['ruralPurse'] for m in ms), sum(v['ruralPurse'] for v in base['years'][2]['end'].values()))
for name in ['A','B']:
  mo=runs[name]['rows'][35]['money']
  print(name+'   ', ' '.join('%7d'%mo[m]['purse'] for m in ms), sum(v['purse'] for v in mo.values()))
print('treasury balance month 36')
print('HEAD', ' '.join('%7d'%base['years'][2]['end'][m]['balance'] for m in ms), sum(v['balance'] for v in base['years'][2]['end'].values()))
for name in ['A','B']:
  mo=runs[name]['rows'][35]['money']
  print(name+'   ', ' '.join('%7d'%mo[m]['balance'] for m in ms), sum(v['balance'] for v in mo.values()))
