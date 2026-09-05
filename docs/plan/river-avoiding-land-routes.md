# River-avoiding land routes

`landRouteGenerationMode = "riverAvoidance"` is the default route-generator mode. It retains the elevation-aware cost model and adds a bridge feasibility rule for roads and trails:

- Entering a river cell wider than the selected historical period's maximum bridge span has infinite cost.
- A bridgeable river cell remains passable, but pays a fixed bridge cost plus a width-scaled cost. This makes routes prefer a dry detour or a narrower crossing when either exists.
- The river width is the hydrology model's estimated channel width at that packed cell, converted from map units to metres with `distanceScale`.

## Period thresholds

These are conservative routine-infrastructure limits, not record-span permissions: a generated route represents an ordinary road or trail network rather than a unique state prestige project.

| Historical period | Maximum channel width / bridge span |
| --- | ---: |
| Early medieval | 15 m |
| High medieval | 25 m |
| Late medieval | 50 m |
| Age of Exploration | 60 m |
| Maritime | 80 m |
| Pre-industrial | 150 m |
| Steam | 350 m |
| Industrial chemistry | 500 m |
| Petroleum | 1,000 m |
| Rocketry and space | 2,000 m |

The calibration is anchored by notable record spans, then rounded down for ordinary construction: the late-medieval Trezzo bridge had a 72 m span; Menai (1826) 176 m; Forth (1890) 521 m; and Akashi Kaikyo (1998) 1,991 m. These anchors support the order of magnitude, while the lower thresholds preserve the map generator's preference for practical crossings.

Sources:

- [Lombardia Beni Culturali — Trezzo fortified bridge](https://www.lombardiabeniculturali.it/architetture/schede/MI100-09102/)
- [Coflein — Menai Suspension Bridge](https://coflein.gov.uk/en/sites/43063)
- [UNESCO — The Forth Bridge](https://whc.unesco.org/en/list/1485/)
- [Honshu-Shikoku Bridge Expressway Company — Akashi Kaikyo Bridge](https://www.jb-honshi.co.jp/english/corp_index/technology/introduction/introduction_akashi.html)
