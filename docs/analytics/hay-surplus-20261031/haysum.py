import json,sys
d=json.load(open(sys.argv[1]));print('months',d['months'])
T=lambda r,k: sum(v.get(k,0) for v in r.values())
print('m  cuttbl laborKg planCut receivd  ownHay  sellKg  barnIn reserve |    need pasture residue  hayEat   unmet  bought    sold    barn  (t DM)')
for r in d['rows']:
  c=r['cut'];f=r['feed']
  print('%2d'%r['month'],' '.join('%7.0f'%(T(c,k)/1000) for k in ['cuttable','laborKg','planCut','received','ownHay','sellKg','barnIn','reserve']),'|',' '.join('%7.0f'%(T(f,k)/1000) for k in ['requiredKg','pastureConsumedKg','cropResidueFeedKg','hayConsumedKg','unmetKg','purchasedKg','soldKg','hayKg']))
