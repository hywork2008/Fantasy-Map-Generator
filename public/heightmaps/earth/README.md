# Earth-region rasters

Packed public-domain elevation and land masks used by `fromEarthRegion()`.

| File | Contents |
| :--- | :--- |
| `east-asia.bin` | FMGE raster: Natural Earth 10m admin-0 land + GMTED2010/ETOPO elevation (terrarium tiles) |

Bake:

```bash
node scripts/bakeEastAsiaEarthRaster.mjs
```

License: Natural Earth, GMTED2010, and ETOPO1 are public domain. See
[docs/plan/earth-geography-heightmaps.md](../../../docs/plan/earth-geography-heightmaps.md).
