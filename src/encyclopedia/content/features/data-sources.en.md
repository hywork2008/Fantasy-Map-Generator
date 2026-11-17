Sources and licences of the geographic data used by real-terrain templates (Precreated heightmaps such as Japan and Britain) and by the Japan local war terrain in 3D.

## Land and administrative areas

| Data | Used for | Licence |
| :--- | :--- | :--- |
| Natural Earth 10m countries (admin-0) | Land and sea in Earth-region templates | Public domain |
| Natural Earth 10m states and provinces (admin-1) | Japan local war terrain: grouping elevation by prefecture, and the coastline | Public domain |

Credit: Made with Natural Earth. https://www.naturalearthdata.com/

## Elevation

| Data | Used for | Licence and credit |
| :--- | :--- | :--- |
| AWS Terrain Tiles (Terrarium) | Cell heights of Earth-region templates; the 1 km to 100 m levels of the Japan local war terrain | Per source. Around Japan: SRTM, GMTED2010, ETOPO1 and others (public domain). List: https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
| GSI elevation tiles (DEM10B and others), Geospatial Information Authority of Japan | The fine levels of the Japan local war terrain (preferred by default) | Public Data License v1.0 (PDL1.0). Credit: processed from GSI elevation tiles (https://maps.gsi.go.jp/development/ichiran.html) |

Public Data License v1.0: https://www.digital.go.jp/resources/open_data/public_data_license_v1.0

## Rivers

| Data | Used for | Licence and credit |
| :--- | :--- | :--- |
| GSI vector tiles (experimental), river layer from Global Map Japan (1:1,000,000) | Real rivers drawn in the Japan local war terrain, and the valleys carved along them | GSI content terms (compatible with Public Data License v1.0). Credit: processed from GSI vector tiles (Global Map Japan) |

The FMG rivers made by map generation (the rivers the simulation uses) are separate from these real rivers. By default the local war terrain draws the FMG rivers as water at their 2D map width. The real rivers are not distributed; when baked locally, a setting switches to them.

## Processing

Heights are resampled from these tiles when a map is generated and when a local war window is prepared (bilinear interpolation, coastline tests, river corridors carved down, ground flattened around towns). The terrain on screen is not the source data itself.

Details: docs/plan/japan-local-war-terrain.md and docs/plan/earth-geography-heightmaps.md.
