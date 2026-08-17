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

Bake:

```bash
node scripts/bakeEastAsiaEarthRaster.mjs
node scripts/bakeJapanEarthRaster.mjs
node scripts/bakeBritainEarthRaster.mjs
node scripts/bakeMediterraneanSeaEarthRaster.mjs
node scripts/bakeEuropeCentralEarthRaster.mjs
node scripts/bakeAtlanticsEarthRaster.mjs
```

License: Natural Earth, GMTED2010, and ETOPO1 are public domain. See
[docs/plan/earth-geography-heightmaps.md](../../../docs/plan/earth-geography-heightmaps.md).
