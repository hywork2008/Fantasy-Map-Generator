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
  const lakes = (worldContext.pack.features ?? []).filter(feature => feature && feature.type === "lake");
  return {
    seed: worldContext.seed,
    burgs: liveBurgs().length,
    lakes: { total: lakes.length, withOutlet: lakes.filter(lake => lake.outlet).length },
    riverPortLab: worldContext.pack.riverPortLab ?? null
  };
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
      labSiteKind: burg.labSiteKind ?? null,
      seaPort: access.port.sea,
      riverPort: access.port.river,
      lakePort: access.port.lake,
      site: classifyRiverSite(index, burg.cell)
    };
  });
}

/** River-Port Lab: land cells per site kind, and how many are populated / navigable (candidate supply). */
export function classifyCellSupply() {
  const { pack } = worldContext;
  const { cells } = pack;
  const index = buildRiverSiteIndex({ cells, features: pack.features, rivers: pack.rivers ?? [] });
  const supply: Record<
    string,
    { cells: number; populated: number; cultured: number; navigable: number; joins: number; mouthDist: number[] }
  > = {};
  for (let cell = 0; cell < cells.h.length; cell++) {
    const site = classifyRiverSite(index, cell);
    if (!site) continue;
    const row = (supply[site.kind] ??= {
      cells: 0,
      populated: 0,
      cultured: 0,
      navigable: 0,
      joins: 0,
      mouthDist: []
    });
    if (site.confluenceOrder > 1 || cells.conf[cell]) {
      row.joins++;
      row.mouthDist.push(site.distanceToMouthCells ?? -1);
    }
    row.cells++;
    if (cells.pop?.[cell] > 0) row.populated++;
    if (cells.culture?.[cell]) row.cultured++;
    if (cells.fl[cell] >= 100) row.navigable++;
  }
  return supply;
}

