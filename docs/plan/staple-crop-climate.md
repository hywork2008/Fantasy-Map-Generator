# Staple Crop Climate Profiles

## Climate scale

`grid.cells.prec` stores annual precipitation in a 0–255 proxy scale where one
unit equals `100 mm`. All `StapleCropProfile.precipitation` boundaries are the
source annual-rainfall values divided by 100. This is the same physical contract
used by Cell Info, Crop climate guide, perennial crops, and irrigation.

## Annual precipitation sources

| Crop | Absolute / optimal annual precipitation |
| --- | --- |
| Wheat | [FAO ECOCROP: *Triticum aestivum*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2114): 300–1600 / 750–900 mm |
| Rye | [FAO ECOCROP: *Secale cereale*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1929): 400–2000 / 600–1000 mm |
| Barley | [FAO ECOCROP: *Hordeum vulgare*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1232): 200–2000 / 500–1000 mm |
| Oats | [FAO ECOCROP: *Avena sativa*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=481): 250–1500 / 600–1000 mm |
| Millet | [FAO ECOCROP: *Panicum miliaceum*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=8280): 200–1000 / 500–750 mm |
| Buckwheat | [FAO ECOCROP: *Fagopyrum esculentum*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2285): 400–1300 / 700–1000 mm |
| Peas | [FAO ECOCROP: *Pisum sativum*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1721): 350–2500 / 800–1200 mm |
| Broad Beans | [FAO ECOCROP: *Vicia faba*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2146): 250–2600 / 650–1000 mm |
| Lentils | [FAO ECOCROP: *Lens culinaris*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=7209): 250–2500 / 600–1000 mm |
| Chickpeas | [FAO ECOCROP: *Cicer arietinum*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=2479): 300–1800 / 600–1000 mm |
| Turnips | Annual climate-screening range 250–1500 / 500–800 mm. ECOCROP has no matching turnip record; this conservative range is a model parameter pending a species-specific source. |
| Potatoes | [FAO ECOCROP: *Solanum tuberosum*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1971): 250–2000 / 500–800 mm |

The profiles are annual screening bands. They do not model growing-season rainfall,
waterlogging duration, cultivar differences, or soil water retention; those belong
to a future seasonal water-balance model.
