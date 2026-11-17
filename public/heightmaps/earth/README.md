# Earth-region rasters

Packed public-domain elevation and land masks used by `fromEarthRegion()`.

| File | Contents |
| :--- | :--- |
| `east-asia.bin` | FMGE raster: Natural Earth 10m admin-0 land + GMTED2010/ETOPO elevation |
| `japan.bin` | Japan theatre (in-frame islands + neighboring land) + GMTED/ETOPO |
| `britain.bin` | British Isles theatre (Ireland to Shetland + in-frame neighbors) + GMTED/ETOPO |
| `mediterranean-sea.bin` | Gibraltar to Levant (in-frame islands + neighboring shores) + GMTED/ETOPO |
| `europe-central.bin` | Channel / Low Countries / Rhine / Elbe industrial core + GMTED/ETOPO |
| `atlantics.bin` | North Atlantic basin (complete North America and Europe) + GMTED/ETOPO |
| `caribbean.bin` | Los Angeles (NW) to Belém (SE): Gulf, Caribbean, Central America + GMTED/ETOPO |
| `europe.bin` | Ireland to Georgia, Cyprus to Finland (EU members + candidates) + GMTED/ETOPO |
| `indian-ocean.bin` | Dakar (W) to mainland Australia (SE); Bass Strait north channel; Tasmania off-map + GMTED/ETOPO |
| `arabia.bin` | Croatia (NW) to Sri Lanka (SE); coastal margin south and east of Sri Lanka + GMTED/ETOPO |
| `ancient-rome.bin` | Roman Empire AD 117: Britain to the Caspian, Thebes to Scotland + GMTED/ETOPO |

Bake:

```bash
node scripts/bakeEastAsiaEarthRaster.mjs
node scripts/bakeJapanEarthRaster.mjs
node scripts/bakeBritainEarthRaster.mjs
node scripts/bakeMediterraneanSeaEarthRaster.mjs
node scripts/bakeEuropeCentralEarthRaster.mjs
node scripts/bakeAtlanticsEarthRaster.mjs
node scripts/bakeCaribbeanEarthRaster.mjs
node scripts/bakeEuropeEarthRaster.mjs
node scripts/bakeIndianOceanEarthRaster.mjs
node scripts/bakeArabiaEarthRaster.mjs
node scripts/bakeAncientRomeEarthRaster.mjs
```

License: Natural Earth, GMTED2010, and ETOPO1 are public domain. See
[docs/plan/earth-geography-heightmaps.md](../../../docs/plan/earth-geography-heightmaps.md).

## Japan local war terrain (`japan-local/`)

Real-DEM levels for the campaign 3D window on maps made from the `japan` template
([docs/plan/japan-local-war-terrain.md](../../../docs/plan/japan-local-war-terrain.md)).
One FMGE raster per prefecture and level (Okinawa is outside the map).

| Committed | Local only (Git-ignored) |
| :--- | :--- |
| `NN-1000m.bin`, `NN-500m.bin`, `manifest.json` (about 11.5 MB) | `*-250m*.bin`, `*-100m*.bin`, `manifest.local.json`, `rivers.json` |

```bash
node scripts/bakeJapanLocalDem.mjs --prefs JP-23 --levels 1000,500,250   # Terrarium
node scripts/bakeJapanLocalDem.mjs --prefs JP-23 --levels 100 --source gsi
node scripts/bakeJapanRivers.mjs                                          # optional real rivers
```

Sources and credits: Natural Earth admin-1 (public domain); AWS Terrain Tiles (per-source credits);
GSI elevation tiles and GSI vector tiles (Public Data License v1.0, credit 国土地理院). The in-app
Encyclopedia entry `feature:data-sources` lists them.

## Japan terrain tiles (`japan-tiles/`)

Quadtree tiles for the 3D war view on `japan`-template maps
([docs/plan/japan-terrain-tiles.md](../../../docs/plan/japan-terrain-tiles.md)), re-sampled from
`japan.bin` and `japan-local/`. Levels up to 2 MB load whole; larger ones load per tile by HTTP Range.

| Committed | Local only (Git-ignored) |
| :--- | :--- |
| `index.json`, `z0.bin`–`z3.bin` (4 km–500 m), `prefectures.bin` (about 13 MB) | `z4.bin`, `z5.bin` (250 m, 125 m), `index.local.json` |

```bash
node scripts/bakeJapanTiles.mjs                          # distributed levels z0–z3
node scripts/bakeJapanTiles.mjs --maxZoom 5 --local      # plus local 250 m / 100 m rasters
```
