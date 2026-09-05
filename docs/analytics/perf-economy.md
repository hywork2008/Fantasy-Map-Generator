# npm run perf:advance-year

## Result

`docs/analytics/advance-year-benchmark-latest.json`

## Human Readable

┌─────────┬───────────────────────────────────┬─────────┬──────────┬───────┬─────────┐
│ (index) │ label                             │ totalMs │ sharePct │ calls │ avgMs   │
├─────────┼───────────────────────────────────┼─────────┼──────────┼───────┼─────────┤
│ 0       │ 'production:settle'               │ 1689.4  │ 26.82    │ 12    │ 140.783 │
│ 1       │ 'production:produce'              │ 1166.6  │ 18.52    │ 12    │ 97.217  │
│ 2       │ 'production:finishCycle'          │ 501.3   │ 7.96     │ 12    │ 41.775  │
│ 3       │ 'production:syncLedgers'          │ 428.6   │ 6.8      │ 12    │ 35.717  │
│ 4       │ 'production:startCycle'           │ 337.2   │ 5.35     │ 12    │ 28.1    │
│ 5       │ 'production:burgLoop'             │ 327.9   │ 5.21     │ 12    │ 27.325  │
│ 6       │ 'production:playerCommerce'       │ 260.5   │ 4.14     │ 12    │ 21.708  │
│ 7       │ 'production:planRetail'           │ 259.3   │ 4.12     │ 12    │ 21.608  │
│ 8       │ 'production:rural'                │ 225.8   │ 3.59     │ 12    │ 18.817  │
│ 9       │ 'production:taxes'                │ 166.8   │ 2.65     │ 12    │ 13.9    │
│ 10      │ 'economy:dailyHiring'             │ 151.5   │ 2.41     │ 366   │ 0.414   │
│ 11      │ 'core:manpower'                   │ 100.5   │ 1.6      │ 366   │ 0.275   │
│ 12      │ 'economy:annualAgTech'            │ 89      │ 1.41     │ 366   │ 0.243   │
│ 13      │ 'core:demographics'               │ 76.8    │ 1.22     │ 366   │ 0.21    │
│ 14      │ 'production:metallurgProcurement' │ 70.8    │ 1.12     │ 12    │ 5.9     │
│ 15      │ 'production:pricesAndLabor'       │ 59.2    │ 0.94     │ 12    │ 4.933   │
│ 16      │ 'economy:foodCalendar'            │ 45.8    │ 0.73     │ 366   │ 0.125   │
│ 17      │ 'economy:forestProspect'          │ 45      │ 0.71     │ 366   │ 0.123   │
│ 18      │ 'production:saltLogistics'        │ 31.1    │ 0.49     │ 12    │ 2.592   │
│ 19      │ 'production:globalTrade'          │ 30.6    │ 0.49     │ 12    │ 2.55    │
│ 20      │ 'production:spawnCaravans'        │ 27.1    │ 0.43     │ 12    │ 2.258   │
│ 21      │ 'economy:marketTerritorySync'     │ 27.1    │ 0.43     │ 366   │ 0.074   │
│ 22      │ 'economyMarketTerritories'        │ 26.2    │ 0.42     │ 366   │ 0.072   │
│ 23      │ 'economy:annualInfrastructure'    │ 18      │ 0.29     │ 366   │ 0.049   │
│ 24      │ 'economy:annualPlants'            │ 17.5    │ 0.28     │ 366   │ 0.048   │
└─────────┴───────────────────────────────────┴─────────┴──────────┴───────┴─────────┘

### perf:advance-year で検索した際に出てくるドキュメント

- docs/analytics/advance-year-performance.md
- docs/plan/advance-time-loop-reduction.md
- docs/simulation/advance-time.md
- docs/temp/survey/advance-time-cadence-catalog.md
