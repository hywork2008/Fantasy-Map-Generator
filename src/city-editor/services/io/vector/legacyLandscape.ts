import type { DistrictFabric } from "../../../generators/blockInfill.types";
import { buildForestPlan } from "../../../generators/forestPlan";
import { landscapeClimate } from "../../../generators/landscapeVegetation";
import { facePoints } from "../../../generators/mesh";
import type { CityDocument } from "../../../types/document";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorLandscape } from "../../../types/vector/landscape";

export function copyLegacyLandscape(
  source: CityDocument,
  doc: VectorCityDocument,
  fabric?: DistrictFabric
): VectorLandscape {
  if (source.terrain || source.fabric?.generation?.settings.mode === "terrain")
    throw Error("landscape-terrain-not-supported");
  const empty = fabric ?? { buildings: [], lanes: [], entrances: new Map(), farms: [] };
  const domains = Object.fromEntries(
    (["legacy", "farmland", "surroundings"] as const).map(mode => {
      const variant = {
        ...source,
        forestSettings: { version: 1 as const, mode, density: source.forestSettings?.density ?? ("standard" as const) }
      };
      return [
        mode,
        buildForestPlan(variant, empty, undefined, { ignoreTreeClimate: true }).regions.map(p => ({
          outer: p.outer,
          holes: p.holes
        }))
      ];
    })
  ) as VectorLandscape["forest"]["domains"];
  return {
    version: 1,
    context: {
      ...structuredClone(landscapeClimate(source)),
      seed: source.generationSeed ?? source.fabric?.seed ?? source.format,
      ...(source.civilization ? { civilization: structuredClone(source.civilization) } : {}),
      ...(source.burialProfile ? { burialProfile: structuredClone(source.burialProfile) } : {})
    },
    forest: {
      settings: structuredClone(source.forestSettings ?? { version: 1, mode: "legacy", density: "standard" }),
      domains,
      farmland: Object.values(source.mesh.faces)
        .filter(f => f.properties.ward === "farm" && f.properties.water === "land" && !f.properties.locked)
        .map(f => ({ outer: facePoints(source.mesh, f), holes: [] })),
      regionIds: Object.values(doc.regions)
        .filter(r => r.kind === "forest")
        .map(r => r.id),
      farmRegionIds: Object.values(doc.regions)
        .filter(r => r.kind === "farm")
        .map(r => r.id)
    },
    parks: (fabric?.parks ?? []).map((p, i) => ({
      id: `landscape:park:${i}`,
      lawns: p.lawnPolygons.map(outer => ({ outer: structuredClone(outer), holes: [] })),
      paths: structuredClone(p.paths),
      trees: p.trees.map(t => ({ point: [...t.center], radiusMeters: t.radius }))
    })),
    farmSources: (fabric?.farms ?? []).map(({ faceId, sourceFaceIds, polygon, ...p }, i) => ({
      ...structuredClone(p),
      id: `landscape:farm:${i}`,
      polygon: { outer: structuredClone(polygon), holes: [] },
      locked: (sourceFaceIds ?? [faceId]).some(id => !!source.mesh.faces[id]?.properties.locked)
    })),
    farms: [],
    cemeteries: (source.cemeteries ?? []).map(({ faceId: _face, ...c }) => structuredClone(c)),
    trees: []
  };
}
