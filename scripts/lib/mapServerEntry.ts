await import("../../src/test-setup");
const { worldContext } = await import("../../src/context/worldContext");
const { loadArchiveWorld } = await import("../../src/city-editor/core/housingReport");
const { getBurgSiteDescriptor } = await import("../../src/services/burgSiteDescriptor");
const { updateBurgWaterAccess } = await import("../../src/services/burgWaterAccess");
const { buildRiverSiteIndex, classifyRiverSite } = await import("../../src/debug/riverPortLab/classifyRiverSite");

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

/** River-Port Lab L0 (docs/plan/river-port-lab.md): every live burg's river/sea site class. */
export function classifyBurgSites() {
  const { pack } = worldContext;
  const index = buildRiverSiteIndex({ cells: pack.cells, features: pack.features, rivers: pack.rivers ?? [] });
  return liveBurgs().map(burg => {
    const access = updateBurgWaterAccess({ ...burg }, pack); // copy: the served map stays untouched
    return {
      seed: worldContext.seed,
      id: burg.i,
      name: burg.name,
      population: burg.population,
      capital: Boolean(burg.capital),
      cell: burg.cell,
      seaPort: access.port.sea,
      riverPort: access.port.river,
      lakePort: access.port.lake,
      site: classifyRiverSite(index, burg.cell)
    };
  });
}
