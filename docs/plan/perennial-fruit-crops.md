# Perennial Fruit Crops and Climate-Based Olive Production

## Status

Implemented initial model. This document is the design record for the orchard/vine work introduced after `fruits.md`.

## Goal

Add the major useful medieval-European fruit crops as trade goods and calculate their rural output from compatible temperature, rainfall, soil, land, and labour. Olives must no longer be produced because a cell happens to have the `scrub` biome tag.

The initial catalogue is deliberately compact:

| Good | Historical role | Climate source, absolute / optimal |
| --- | --- | --- |
| Apples | Main northern and western European orchard fruit; cider and storage | [FAO ECOCROP: *Malus domestica*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1407): 8–33 / 14–27°C; 500–3200 / 700–2500 mm |
| Pears | Major temperate orchard fruit | [FAO ECOCROP: *Pyrus communis*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1832): 10–37 / 20–35°C; 400–2100 / 600–900 mm |
| Plums | Temperate fruit, including drying into prunes | [FAO ECOCROP: *Prunus domestica*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=16203): 6–36 / 18–33°C; 600–1800 / 900–1500 mm |
| Figs | Mediterranean and warm-temperate fruit, fresh or dried | [FAO ECOCROP: *Ficus carica*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1071): 4–38 / 16–26°C; 300–2700 / 700–1500 mm |
| Lemons | Southern citrus and culinary/preserving fruit | [FAO ECOCROP: *Citrus limon*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=714): 12–36 / 15–28°C; 300–4000 / 1000–2300 mm |
| Olives | Mediterranean fruit and oil input | [FAO ECOCROP: *Olea europaea*](https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1553): 5–40 / 20–34°C; 200–1200 / 400–700 mm |
| Grapes | Existing vine crop; wine and raisins | Existing vineyard model, now moved to this shared climate-first path |

ECOCROP is appropriate as a first-pass source because its records include minimum/maximum temperature, annual precipitation, soil texture, drainage, and related ecological constraints. It is a broad screening database rather than a cultivar model, so it must not be treated as a simulation of chill hours, frost timing, or monthly rainfall distribution. [FAO describes those limits and fields here](https://www.fao.org/geospatial/data-and-tools/data-portals/ecocrop/).

## Climate scale

`grid.cells.temp` is degrees Celsius, while `grid.cells.prec` is FMG's annual precipitation proxy (0–255), not millimetres. `src/data/perennialCrops.ts` therefore contains calibrated proxy ranges rather than asserting a direct mm conversion. Calibration preserves the existing staple-crop climate scale and uses the FAO absolute/optimal bands for relative ordering:

- olives remain comparatively drought tolerant;
- apples, pears, and plums favour wetter temperate cells;
- figs cover warm, moderately dry to moderately wet cells;
- lemons require frost-free warm cells and generally more water;
- irrigation augments the precipitation suitability value just as it does for staple crops.

Adding monthly climate, chilling hours, late-frost damage, and seasonal rain timing is explicitly out of scope for this pass.

## Follow-up: seasonal harvest and labour calibration

The present `laborDaysPerHectare` values are annual placeholders. They do not yet distinguish pruning, irrigation, canopy management, harvest, drying, or pressing, and they must not be read as a verified medieval labour ratio. The first orchard pass deliberately keeps annual output stable while climate placement is verified.

The follow-up is specified in [季節別作物暦・農繁期・混合農業労働](seasonal-crop-calendars.md). It will give each perennial crop an evidence-backed monthly harvest window and labour profile, keep perennial crops at one harvest per year unless a crop-specific source supports more, and combine those monthly demands with husbandry rather than applying a universal labour-sharing discount. Until then, the annual values remain compatibility parameters, not historical claims.

## Architecture

`PerennialCropProfile` is separate from `StapleCropProfile`.

- `crop` remains field crops only: cereals, legumes, and roots feed `getCropMix`, the 2:1 staple/legume rotation, soil fertility, and the Food Ledger.
- `perennialCrop` is used by orchards and vines only. It contains climate/soil ranges, maximum land share, population-bounded desired area, labour days, and output per hectare.
- `viticulture.ts` retains its public name and persisted labour columns for save compatibility, but now allocates a single dominant climate-compatible vine or orchard per cell. This prevents every compatible fruit from claiming the same land.
- `production-utils.ts` obtains all perennial harvests from that model; none of them uses `biomeOutputByTag`.
- `faunaPopulation.ts` already subtracts the historical `getVineyardAreaUsedHectares` result; that result now represents both orchard and vineyard land, preventing a second wildlife claim on it.

This keeps the renderer pure: production is resolved by generators and no renderer writes world data.

## Goods and food handling

- Apples, Pears, Plums, Figs, and Lemons are fresh foods produced at orchards.
- Plums and Figs (and surplus Apples/Pears) use the shared `Dried Fruits` preserved-food recipe; the existing cell-local fresh-food planner fills local reserves before commercial output.
- Grapes retain their more valuable Wine commercial path and Raisins reserve path.
- Olives remain a non-fresh `Olives → Oil` input; existing oil, soap, and other recipes stay valid.
- Neither fruit nor olive output enters the staple Food Ledger. They are diet, trade, and processing goods, not a new source of Grain-equivalent subsistence calories.

## Save migration and verification

`migratePerennialFruitGoods()` appends missing orchard goods with new IDs, sets profiles on existing Grapes and Olives, removes olive biome-output and random biome-placement fields, and rebuilds `Dried Fruits` recipes from the loaded catalogue's actual IDs. It never changes existing Olive stock or recipes that consume Olives.

Verification covers:

1. suitability boundaries, soils, and irrigation;
2. exclusion from `getCropMix` and staple inventories;
3. olive output in climate-suitable non-scrub cells and no climate-incompatible scrub output;
4. land/labour competition with grapes, husbandry, and wildlife;
5. migration of legacy catalogues; and
6. `Crop climate guide` detail and comparison display for all `crop` and `perennialCrop` goods.
