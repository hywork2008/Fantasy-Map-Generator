import * as THREE from "three";
import type { CourtyardLodgingSpec, GarrisonBuildingSpec } from "../../buildings/facilities/siteFacilities";
import { models as smithies } from "../../buildings/medieval/11-smithiesModels";
import { models as fuel } from "../../buildings/medieval/13-fuel-storageModels";
import { models as granaries } from "../../buildings/medieval/16-granariesModels";
import { models as warehouses } from "../../buildings/medieval/17-warehousesModels";
import { models as livestock } from "../../buildings/medieval/18-livestock-marketsModels";
import { models as tanneries } from "../../buildings/medieval/22-tanneriesModels";
import { models as granaryWorks } from "../../buildings/medieval/25-public-granariesModels";
import { models as cloth } from "../../buildings/medieval/27-cloth-hallsModels";
import { models as guilds } from "../../buildings/medieval/28-craft-guild-hallsModels";
import { models as stoneYards } from "../../buildings/medieval/29-stone-yardsModels";
import { models as kilns } from "../../buildings/medieval/30-lime-kilnsModels";
import { models as bleaching } from "../../buildings/medieval/31-bleaching-fieldsModels";
import { models as gallows } from "../../buildings/medieval/36-gallowsModels";
import { models as glass } from "../../buildings/medieval/37-glassworkers-hallsModels";
import { models as printing } from "../../buildings/medieval/38-printing-modelsModels";
import { models as instruments } from "../../buildings/medieval/39-instrument-makers-hallsModels";
import { models as sand } from "../../buildings/medieval/40-sand-yardsModels";
import { POST_MILL } from "../../buildings/mills/postMill";
import { TOWER_MILL } from "../../buildings/mills/towerMill";
import { createLowBankWaterMill, LOW_BANK_WATER_MILLS, WATER_MILL } from "../../buildings/mills/waterMill";
import { type ModelQuality, resolveModelQuality } from "../../buildings/modelQuality";
import {
  GARRISON_VARIANTS,
  LODGING_VARIANTS,
  OBJECT_VARIANTS,
  RAVELIN_VARIANTS,
  WELL_VARIANTS,
  YARD_VARIANTS
} from "../../buildings/siteVariants";
import type { DistrictFabric } from "../../city-editor/generators/blockInfill.types";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import { buildFortressPlan } from "../../city-editor/renderers/castleLayoutBuilder";
import { resolveCastleStyle } from "../../city-editor/renderers/castlePatterns";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import type { CityDocument, Point } from "../../city-editor/types/document";
import { adopt, adoptedDefinition, medievalDefinition } from "../adoption";
import { WATER_Y } from "../core/waterGeometry";
import { type BvDefinition, type BvPlacement, type BvPrototypeCache, createBvInstances } from "./bvInstances";
import { fitBvBuilding } from "./bvPlacement";

const lumber = adoptedDefinition(YARD_VARIANTS, "yard.lumber", "medieval-lumber-yard");
const cannon = adoptedDefinition(YARD_VARIANTS, "siege.early-field-cannon", "early-field-cannon");
const basin = adoptedDefinition(WELL_VARIANTS, "well.publicBasin", "citadel-water-basin");
const medieval = medievalDefinition;
const storageModels: Record<string, BvDefinition> = {
  livestockPen: medieval(livestock[0]),
  timberYard: lumber,
  stoneYard: medieval(stoneYards[0]),
  fuelStack: medieval(fuel[0]),
  granary: medieval(granaries[1]),
  warehouse: medieval(warehouses[0])
};
const guildModels: Record<string, BvDefinition> = {
  textiles: medieval(cloth[0]),
  leather: medieval(guilds[0]),
  woodworking: medieval(guilds[1]),
  masonry: medieval(guilds[2]),
  metallurgy: medieval(guilds[3]),
  glassware: medieval(glass[0]),
  instruments: medieval(instruments[0]),
  printing: medieval(printing[0])
};
const yardModels: Record<string, BvDefinition> = {
  timberYard: lumber,
  stoneYard: medieval(stoneYards[0]),
  limeKiln: medieval(kilns[0]),
  bleachingField: medieval(bleaching[0]),
  smithyYard: medieval(smithies[0]),
  sandYard: medieval(sand[0])
};
const definitions = new Map<string, BvDefinition>();
function definition(id: string, create: BvDefinition["create"], variant: string): BvDefinition {
  let result = definitions.get(id);
  if (!result) {
    result = { id, variant, create };
    definitions.set(id, result);
    if (definitions.size > 512) definitions.delete(definitions.keys().next().value!);
  }
  return result;
}

/** Local +X follows an edge; local +Z faces the right of that edge in the CE plan. */
function frameOf(ring: readonly Point[], longest = true) {
  let edge = 0;
  if (longest)
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        p = ring[edge],
        q = ring[(edge + 1) % ring.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > Math.hypot(q[0] - p[0], q[1] - p[1])) edge = i;
    }
  const a = ring[edge],
    b = ring[(edge + 1) % ring.length];
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
    c = Math.cos(angle),
    s = Math.sin(angle);
  const us = ring.map(p => p[0] * c + p[1] * s),
    vs = ring.map(p => -p[0] * s + p[1] * c);
  const u = (Math.min(...us) + Math.max(...us)) / 2,
    v = (Math.min(...vs) + Math.max(...vs)) / 2;
  const center: Point = [u * c - v * s, u * s + v * c];
  return {
    angle,
    center,
    width: Math.max(...us) - Math.min(...us),
    depth: Math.max(...vs) - Math.min(...vs),
    local: (p: Point): Point => [p[0] * c + p[1] * s - u, -(-p[0] * s + p[1] * c - v)]
  };
}
function placement(point: Point, elevation: number, angle = 0, scale = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(point[0], elevation, -point[1]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
    new THREE.Vector3(scale, scale, scale)
  );
}
export interface FacilitySite extends BvPlacement {
  name: string;
}

/** Saved facility plans supply positions and footprints; BV supplies their visible architecture. */
export function createTownFacilities(
  city: CityDocument,
  fabric: DistrictFabric,
  structures: readonly StructureMassing[],
  cache: BvPrototypeCache,
  quality: ModelQuality = "high",
  terrain?: Pick<CityTerrain, "foundationAt" | "heightAt" | "relief">,
  waterHeightAt: (point: Point) => number = () => WATER_Y
) {
  const sites: FacilitySite[] = [],
    releases: Array<() => void> = [];
  const replacements = new Map<string, string[]>();
  const tier = resolveModelQuality(quality, ["high", "low"] as const);
  const elevationAt = (ring: Point[]) => (terrain?.relief ? terrain.foundationAt(ring) : 0);
  const fitFacility = (id: string, name: string, ring: Point[], model: BvDefinition) => {
    if (ring.length < 3) return;
    const prototype = cache.acquire(model);
    if (!prototype) return;
    releases.push(prototype.release);
    // Outdoor compounds can occupy small saved plots. Always scale uniformly and retain the full BV envelope.
    const fitted = fitBvBuilding(prototype.bounds, ring, frameOf(ring).angle, elevationAt(ring), 0.05);
    if (fitted) sites.push({ id, name, definition: model, matrix: fitted.matrix });
  };
  const aerial = fabric.aerialLandmarks;
  for (const mill of fabric.watermills?.mills ?? []) {
    const frame = frameOf(mill.millhousePolygon);
    let angle = mill.wheel.angleRad;
    const dx = frame.center[0] - mill.wheel.center[0];
    const dy = frame.center[1] - mill.wheel.center[1];
    // Local -Z points from the wheel toward the house, on either river bank.
    if (-Math.sin(angle) * dx + Math.cos(angle) * dy < 0) angle += Math.PI;
    const scale = mill.wheel.radius / WATER_MILL.wheelRadius;
    const base = elevationAt(mill.millhousePolygon);
    const water = waterHeightAt(mill.wheel.center);
    if (![scale, base, water].every(Number.isFinite) || scale <= 0) continue;
    const bankDrop = (base - water) / scale;
    const flow = Math.cos(angle - mill.wheel.angleRad) > 0 ? 1 : -1;
    const variants = LOW_BANK_WATER_MILLS.filter(spec => spec.flow === flow);
    const spec = variants.reduce((best, item) =>
      Math.abs(item.bankDrop - bankDrop) < Math.abs(best.bankDrop - bankDrop) ? item : best
    );
    const source = adopt(OBJECT_VARIANTS, `object.${spec.id}`, "default");
    // Size in plan remains unchanged; axle and intake follow the rendered water, not a preset gap.
    const immersion = 0.35 / scale;
    const model = definition(
      `watermill:${spec.id}:${bankDrop}:${immersion}`,
      () => createLowBankWaterMill(spec, false, { bankDrop, immersion, drawWater: false }),
      source.id
    );
    const matrix = placement(mill.wheel.center, base, angle, scale).multiply(
      new THREE.Matrix4().makeTranslation(-WATER_MILL.wheelCenter.x, 0, -WATER_MILL.wheelCenter.z)
    );
    sites.push({ id: mill.id, name: mill.name, definition: model, matrix });
  }
  for (const mill of aerial?.windmills ?? []) {
    const source = mill.kind === "post" ? POST_MILL : TOWER_MILL;
    const mills = adopt(OBJECT_VARIANTS, mill.kind === "post" ? "object.postMill" : "object.towerMill", "default");
    const model = definition(
      `windmill:${mill.kind}:${mill.sailAngle}`,
      () => {
        const result = mills.create();
        const rotor = result.group.getObjectByName("sail-assembly");
        if (rotor) rotor.rotation.z = mill.sailAngle - Math.PI / 4;
        return result;
      },
      mills.id
    );
    sites.push({
      id: mill.id,
      name: mill.name,
      definition: model,
      matrix: placement(
        mill.center,
        terrain?.relief ? terrain.heightAt(mill.center) : 0,
        mill.facing + Math.PI / 2,
        mill.sailLength / source.sailRadius
      )
    });
  }
  for (const inn of aerial?.gateInns ?? []) {
    if (inn.footprint.length !== 4 || inn.court.length !== 4) continue;
    const frame = frameOf(inn.footprint, false),
      court = inn.court.map(frame.local);
    const spec: CourtyardLodgingSpec = {
      kind: inn.kind,
      width: frame.width,
      depth: frame.depth,
      courtWidth: Math.max(...court.map(p => p[0])) - Math.min(...court.map(p => p[0])),
      courtDepth: Math.max(...court.map(p => p[1])) - Math.min(...court.map(p => p[1])),
      entranceWidth: 3.2,
      stableSpaces: inn.stableSpaces,
      earthen: city.buildingAppearanceContext?.arid === true
    };
    const lodging = adopt(LODGING_VARIANTS, "facility.courtyard-lodging", tier);
    const model = definition(`lodging:${JSON.stringify(spec)}:${tier}`, () => lodging.create(spec), lodging.id);
    sites.push({
      id: inn.id,
      name: inn.name,
      definition: model,
      matrix: placement(frame.center, elevationAt(inn.footprint), frame.angle)
    });
  }
  for (const yard of aerial?.storageYards ?? []) {
    const model = yard.origin === "publicWorks" ? medieval(granaryWorks[0]) : storageModels[yard.form];
    if (model) fitFacility(yard.id, yard.name, yard.polygon, model);
  }
  for (const yard of aerial?.guildYards ?? []) {
    const model = yardModels[yard.kind];
    if (model) fitFacility(yard.id, yard.name, yard.polygon, model);
  }
  for (const hall of aerial?.guildHalls ?? []) {
    const model = guildModels[hall.domain];
    if (model) fitFacility(hall.id, hall.name, hall.footprint, model);
  }
  for (const yard of aerial?.tanneries ?? []) fitFacility(yard.id, yard.name, yard.yard, medieval(tanneries[0]));
  for (const item of aerial?.gallows ?? []) {
    const r = item.moundRadius;
    fitFacility(
      item.id,
      item.name,
      [
        [item.center[0] - r, item.center[1] - r],
        [item.center[0] + r, item.center[1] - r],
        [item.center[0] + r, item.center[1] + r],
        [item.center[0] - r, item.center[1] + r]
      ],
      medieval(gallows[0])
    );
  }
  for (const warehouse of aerial?.quayWarehouses ?? [])
    if (!warehouse.court) fitFacility(warehouse.id, warehouse.name, warehouse.footprint, medieval(warehouses[0]));

  const addGarrison = (
    id: string,
    name: string,
    ring: Point[],
    kind: GarrisonBuildingSpec["kind"],
    height: number,
    base: number
  ) => {
    if (ring.length !== 4) return;
    const frame = frameOf(ring);
    const spec: GarrisonBuildingSpec = { kind, width: frame.width, depth: frame.depth, height };
    const garrison = adopt(GARRISON_VARIANTS, "facility.garrison", tier);
    const model = definition(`garrison:${JSON.stringify(spec)}:${tier}`, () => garrison.create(spec), garrison.id);
    sites.push({ id, name, definition: model, matrix: placement(frame.center, base, frame.angle) });
    replacements.set(id, [id]);
  };
  for (const castle of city.castles ?? []) {
    const profile = resolveCastleStyle(city, castle);
    const circuit = city.defenseCircuits?.find(c => c.id === castle.circuitId);
    if (profile.style !== "bastion-citadel" || circuit?.state === "razed" || castle.fortress) continue;
    const plan = buildFortressPlan(city, castle, profile);
    for (const building of plan.buildings) {
      const id = `castle:${castle.id}:${building.id}`;
      const part = structures.find(s => s.id === id);
      if (!part) continue;
      const kind = building.kind === "barracks" ? "barracks" : building.kind === "service" ? "service" : "command";
      addGarrison(
        id,
        `${castle.id} · ${building.kind}`,
        building.polygon,
        kind,
        part.heightMeters,
        part.baseElevationMeters
      );
    }
    const center = frameOf(
      castle.courtyards[0] ??
        plan.courtyards[0]?.polygon ?? [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1]
        ]
    ).center;
    for (const [i, prop] of plan.props.entries()) {
      if (prop.kind !== "cannon_battery" && prop.kind !== "reflecting_pool" && prop.kind !== "stone_well") continue;
      const towerIndex = plan.towers.findIndex(
        t => Math.hypot(t.point[0] - prop.point[0], t.point[1] - prop.point[1]) < 1e-6
      );
      const tower = structures.find(s => s.id === `tower:${castle.id}:${towerIndex}`);
      // Tower fitting can discard a cramped bastion after the style creates its props.
      if (prop.kind === "cannon_battery" && !tower) continue;
      const base = tower
        ? tower.baseElevationMeters + tower.heightMeters
        : terrain?.relief
          ? terrain.heightAt(prop.point)
          : 0;
      sites.push({
        id: `${castle.id}:prop:${i}`,
        name: prop.kind,
        definition: prop.kind === "cannon_battery" ? cannon : basin,
        matrix: placement(prop.point, base, Math.atan2(prop.point[1] - center[1], prop.point[0] - center[0]))
      });
    }
    for (const [i, gate] of plan.defensiveGates.entries()) {
      if (gate.kind !== "barbican" || !gate.polygon?.length) continue;
      const frame = frameOf(gate.polygon);
      const openings = [gate.outerGate, gate.innerGate].flatMap(p =>
        p
          ? [
              gate.polygon!.reduce(
                (best, q, j) =>
                  Math.hypot(q[0] - p[0], q[1] - p[1]) <
                  Math.hypot(gate.polygon![best][0] - p[0], gate.polygon![best][1] - p[1])
                    ? j
                    : best,
                0
              )
            ]
          : []
      );
      const spec = { polygon: gate.polygon.map(frame.local), openings };
      const ravelin = adopt(RAVELIN_VARIANTS, "facility.citadel-ravelin", tier);
      const model = definition(`ravelin:${JSON.stringify(spec)}:${tier}`, () => ravelin.create(spec), ravelin.id);
      sites.push({
        id: `${castle.id}:ravelin:${i}`,
        name: "Citadel ravelin",
        definition: model,
        matrix: placement(frame.center, elevationAt(gate.polygon), frame.angle)
      });
    }
  }
  for (const work of city.bastionedTown?.works ?? []) {
    const part = structures.find(s => s.id === work.id);
    if (part) addGarrison(work.id, work.kind, work.polygon, work.kind, part.heightMeters, part.baseElevationMeters);
  }
  const layer = createBvInstances(sites, cache);
  for (const release of releases) release();
  layer.group.name = "ce-facilities";
  return { ...layer, replaced: new Set(layer.accepted.flatMap(site => replacements.get(site.id) ?? [])) };
}
export type TownFacilities = ReturnType<typeof createTownFacilities>;
