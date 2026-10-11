await import("../../src/test-setup");
const { worldContext } = await import("../../src/context/worldContext");
const { loadArchiveWorld } = await import("../../src/city-editor/core/housingReport");
const { getBurgSiteDescriptor } = await import("../../src/services/burgSiteDescriptor");

const liveBurgs = () =>
  (worldContext.pack.burgs ?? []).flatMap((burg, index) =>
    burg && !burg.removed && (burg.i ?? index) > 0 ? [{ ...burg, i: burg.i ?? index }] : []
  );

export async function loadMap(path: string) {
  await loadArchiveWorld(path);
  return { seed: worldContext.seed, burgs: liveBurgs().length };
}

export function listBurgs() {
  const { states = [], cultures = [] } = worldContext.pack;
  return liveBurgs().map(burg => ({
    id: burg.i,
    name: burg.name,
    population: burg.population,
    state: states[burg.state ?? 0]?.name ?? null,
    culture: cultures[burg.culture ?? 0]?.name ?? null,
    capital: Boolean(burg.capital),
    port: Boolean(burg.port),
    x: burg.x,
    y: burg.y
  }));
}

export function getDescriptor(id: number) {
  if (!liveBurgs().some(burg => burg.i === id)) return null;
  return getBurgSiteDescriptor(id) ?? null;
}
