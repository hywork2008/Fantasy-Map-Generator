# License

All code under `src/city-generator/` and `src/city/` is **MIT**, the same as the
rest of Fantasy-Map-Generator.

## Provenance

- The algorithm is **inspired by** Watabou's _Medieval Fantasy City Generator_
  and its TypeScript study port (`~/Projects/TownGeneratorTS`, GPL). **No code is
  copied from those projects.** Only their design docs (authored in-house) and
  publicly documented algorithms informed this implementation.
- `core/voronoi.ts` is a decoupled copy of `src/generators/voronoi.ts` from this
  same repository (MIT), trimmed so the city page imports nothing from the world
  map's module graph.

See `docs/city-generator/design.md` for the full rationale.
