# Seasonal precipitation v1 baseline and structural checks

Run: `node --import tsx scripts/calibrateSeasonalPrecipitation.ts`. [Fixed inputs](../calibration/seasonal-precipitation-v1.json) contain station IDs, coordinates, retrieval dates and URLs. JMA TCC 1991-2020 normals.

Observed normals are compared with the old day-proportional distribution. Synthetic terrain is not mapped to real cities; annual-total calibration is outside this work.

|Station|Role|Annual mm|Observed wet3|Old wet3|Old share MAE|Daily-rate CV|Peak month|Dry candidates|
|---|---|---:|---:|---:|---:|---:|---|---|
|Mumbai|calibration|2250.7|0.795|0.252|0.1030|1.393|7|[{"startMonth":11,"length":7}]|
|Darwin|validation|1827.2|0.656|0.252|0.0787|1.096|1|[{"startMonth":5,"length":5}]|
|Lisbon|calibration|762.6|0.435|0.252|0.0451|0.623|11|[{"startMonth":6,"length":3}]|
|Perth|validation|690.8|0.554|0.252|0.0604|0.789|7|[{"startMonth":12,"length":4}]|
|Tokyo|validation|1598.2|0.384|0.252|0.0287|0.427|10|[{"startMonth":12,"length":2}]|
|Luxembourg|calibration|838.1|0.290|0.252|0.0082|0.133|12|[]|
|Kuala Lumpur|calibration|2841.6|0.324|0.252|0.0179|0.258|11|[]|
|Singapore Changi|validation|2122.7|0.381|0.252|0.0215|0.332|12|[]|

## Synthetic forcing checks

Ocean supply and terrain multiplier are 1 in every month; landFraction=0.6, axial tilt=23.5 degrees, confidence=1. Geography walks are verified separately on the synthetic continent fixture. No station-level modeled MAE is calculated without matching terrain.

Initial coefficients: background 0.06, convection 2.4, fronts 1.4, land convection 0.8, subsidence 2.4, ocean background 0.08. Belt widths follow the design candidates. Structural acceptance: summer-rain wet3>0.4, winter-rain cold-quarter>warm-quarter, two equatorial local maxima, no dry season under year-round wet conditions, maritime daily-rate maximum/minimum<3 at 50 degrees. These checks do not establish observational predictive accuracy.

|Latitude|Continentality|Annual mm|wet3|Daily-rate CV|Peak month|Dry candidates|
|---:|---:|---:|---:|---:|---|---|
|18|0.6|1800|0.708|1.141|7|[{"startMonth":10,"length":7}]|
|-18|0.6|1800|0.696|1.147|1|[{"startMonth":4,"length":7}]|
|38|0.05|760|0.581|0.946|1|[{"startMonth":5,"length":5}]|
|-38|0.05|760|0.593|0.943|7|[{"startMonth":11,"length":6}]|
|0|0|2800|0.308|0.243|10|[]|
|50|0|840|0.304|0.261|3|[]|
|70|0.7|400|0.529|0.748|7|[{"startMonth":11,"length":5}]|

Seasonal allocation does not change annual totals, random draws, river generation or biomes. Solar salt production reads the new monthly amounts; normalized seasonal production weights retain existing annual capability.
