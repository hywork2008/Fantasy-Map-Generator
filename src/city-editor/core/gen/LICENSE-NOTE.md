# `src/city-editor/core/gen/` — vendored generation engine

All code here is **MIT**, the same as the rest of Fantasy-Map-Generator.

## Provenance

- These modules are a **verbatim MIT copy** of `src/city-generator/core/*` and
  `src/city-generator/site/*` (the trimmed subset that `../generate.ts` and
  `../document.ts` actually use), taken so City Editor owns its generation code
  and `src/city-generator/` can be frozen and later deleted. See
  `docs/city-editor/実装計画.md` Phase G0.
- At the initial import only the relative paths were adjusted (`site/*.ts`: `../core/x` → `../x`).
  City Editor now maintains and improves these modules independently. `../generate.ts` runs its own pipeline
  (`runPlan`) over these — `pipeline.ts` / `buildings.ts` were not needed and
  were not copied.
- The algorithm is **inspired by** Watabou's _Medieval Fantasy City Generator_
  and its TypeScript study port (`~/Projects/TownGeneratorTS`, GPL). **No code is
  copied from those projects.** As these modules diverge from the frozen
  `src/city-generator/` copy (Phases G1+), re-implementations continue to follow
  only in-house design docs and publicly documented algorithms.
- `finishCityGeometry.ts` and `buildingLots.ts` are independent MIT implementations
  using the editor's shared mesh. The supplied `temp/ce1` / `temp/ce2` images and
  exported geometry served as visual references; no generator source or reference
  city geometry is embedded in the implementation.
- `voronoi.ts` is a decoupled copy of `src/generators/voronoi.ts` from this same
  repo (MIT), so nothing here reaches into the world map's module graph.

See `docs/city-generator/towngen-comparison.md` and `docs/city-editor/design.md`
for the rationale.
