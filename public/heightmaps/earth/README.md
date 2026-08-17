# Earth-region rasters

Packed public-domain elevation and land masks used by `fromEarthRegion()`.

| File | Contents |
| :--- | :--- |
| `east-asia.bin` | FMGE raster: Natural Earth 10m admin-0 land + GMTED2010/ETOPO elevation |
| `japan.bin` | Japan theatre (in-frame islands + neighboring land) + GMTED/ETOPO |

Bake:

```bash
node scripts/bakeEastAsiaEarthRaster.mjs
node scripts/bakeJapanEarthRaster.mjs
```

License: Natural Earth, GMTED2010, and ETOPO1 are public domain. See
[docs/plan/earth-geography-heightmaps.md](../../../docs/plan/earth-geography-heightmaps.md).
