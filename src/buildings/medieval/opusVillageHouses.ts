import * as THREE from "three";
import type { BvDefinition } from "../../city3d/three/bvInstances";
import { compactModel } from "../compactModel";
import { ModelKit } from "./modelKit";
import { createOpusVillageHouseHigh } from "./opusVillageHouseHigh";
import {
  clampTo,
  type ProfileLook,
  VILLAGE_EAVE_METERS,
  VILLAGE_HOUSE_LIMITS,
  VILLAGE_HOUSE_LOOKS,
  VILLAGE_OVERHANG_METERS,
  VILLAGE_THATCH_METERS,
  type VillageHouseSpec,
  type VillageOpening,
  villageHouseLayout,
  villageHouseSpecKey
} from "./opusVillageHouseProfile";

/**
 * Single-storey village buildings of the roadside village (docs/plan/ce-meshless-roadside-burgage-village.md §14):
 * the longhouse (home and byre under one roof, a cross-passage between them), the cottage of one or two rooms, and
 * the barn standing apart in the toft. CE fits each to its house's footprint, so the model takes its length and width
 * from the spec. Long side along x, the front (the road, or the yard for a barn) on +z, centred on the origin, ground
 * at y = 0. Walls are the footprint; the roof overhangs it. Low is massing with painted openings; High
 * (opusVillageHouseHigh.ts) builds the same plan in courses, timbers, thatch and tiles.
 */
export {
  VILLAGE_HOUSE_AUTHOR,
  VILLAGE_HOUSE_KINDS,
  VILLAGE_HOUSE_LIMITS,
  VILLAGE_HOUSE_PRESETS,
  VILLAGE_HOUSE_PROFILES,
  type VillageHouseKind,
  type VillageHouseProfile,
  type VillageHouseSpec,
  villageHouseSpecKey
} from "./opusVillageHouseProfile";

/** The pitched roof as a solid of its thickness, ridge along x, with the gable walls closing its ends. */
function roofAndGables(k: ModelKit, look: ProfileLook, length: number, width: number, eave: number) {
  const ov = VILLAGE_OVERHANG_METERS,
    half = width / 2 + ov,
    rise = Math.tan((look.pitchDeg * Math.PI) / 180) * (width / 2),
    thick = look.roof === "thatch" ? VILLAGE_THATCH_METERS : 0.12,
    top = eave + rise,
    // The underside runs on the gable's slope through the wall heads and on out over the eaves, so no wall stands
    // through the roof; the cover lies on it at its own thickness.
    drip = eave - (rise / (width / 2)) * ov;
  const shape = new THREE.Shape();
  shape.moveTo(-half, drip);
  shape.lineTo(-half, drip + thick);
  shape.lineTo(0, top + thick);
  shape.lineTo(half, drip + thick);
  shape.lineTo(half, drip);
  shape.lineTo(0, top);
  shape.closePath();
  const roof = new THREE.ExtrudeGeometry(shape, {
    depth: length + 2 * ov,
    bevelEnabled: false
  });
  // The shape lies in (z, y); its extrusion runs along x.
  roof.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  roof.translate(-(length / 2 + ov), 0, 0);
  k.add("roof", roof, look.roof);
  for (const side of [-1, 1]) {
    const gable = new THREE.Shape();
    gable.moveTo(-width / 2, eave);
    gable.lineTo(0, top);
    gable.lineTo(width / 2, eave);
    gable.closePath();
    const wall = new THREE.ExtrudeGeometry(gable, {
      depth: look.wallMeters,
      bevelEnabled: false
    });
    wall.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    wall.translate(side > 0 ? length / 2 - look.wallMeters : -length / 2, 0, 0);
    k.add("gable-wall", wall, look.frame === "logs" ? "wood" : look.wall);
  }
  return top + thick;
}

function walls(k: ModelKit, look: ProfileLook, length: number, width: number, eave: number) {
  const t = look.wallMeters;
  for (const side of [-1, 1]) {
    k.box("long-wall", [0, eave / 2, side * (width / 2 - t / 2)], [length, eave, t], look.wall);
    k.box("end-wall", [side * (length / 2 - t / 2), eave / 2, 0], [t, eave, width - 2 * t], look.wall);
  }
  if (look.wall !== "stone") k.box("stone-footing", [0, 0.15, 0], [length + 0.08, 0.3, width + 0.08], "stone");
}

/** Corner posts, wall plates and studs of a box frame. */
function frame(k: ModelKit, look: ProfileLook, length: number, width: number, eave: number) {
  if (look.frame !== "box") return;
  const bays = Math.max(1, Math.round(length / 2.6));
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + 0.02);
    k.box("wall-plate", [0, eave - 0.09, z], [length, 0.18, 0.06], "oak");
    k.box("sill-beam", [0, 0.36, z], [length, 0.14, 0.06], "oak");
    for (let i = 0; i <= bays; i++)
      k.box("frame-stud", [-length / 2 + 0.09 + ((length - 0.18) * i) / bays, eave / 2, z], [0.16, eave, 0.06]);
  }
}

/** An opening painted on its wall: a boarded leaf in a dark doorway, a dark window or vent. */
function opening(k: ModelKit, o: VillageOpening, length: number, width: number) {
  const along = o.face === "front" || o.face === "back",
    sign = o.face === "front" || o.face === "right" ? 1 : -1,
    at = (out: number, y: number): [number, number, number] =>
      along ? [o.at, y, sign * (width / 2 + out)] : [sign * (length / 2 + out), y, o.at],
    size = (w: number, h: number, d: number): [number, number, number] => (along ? [w, h, d] : [d, h, w]);
  if (o.kind === "door") {
    k.box("doorway", at(0.01, (o.height + 0.06) / 2), size(o.width + 0.12, o.height + 0.06, 0.04), "dark");
    k.box("door-leaf", at(0.04, o.height / 2), size(o.width, o.height, 0.06), "wood");
  } else
    k.box(
      o.kind === "window" ? "window-opening" : "byre-vent",
      at(0.01, o.base + o.height / 2),
      size(o.width, o.height, 0.04),
      "dark"
    );
}

function smoke(k: ModelKit, look: ProfileLook, x: number, roofTop: number, width: number) {
  if (look.smoke === "chimney") {
    k.box("chimney-stack", [x, (roofTop + 0.6) / 2, -width / 2 + 0.45], [0.7, roofTop + 0.6, 0.6], "stone");
    k.box("chimney-cap", [x, roofTop + 0.65, -width / 2 + 0.45], [0.85, 0.12, 0.75], "stone");
    return;
  }
  // A smoke louver: a small gabled hood on the ridge over the hearth.
  k.box("smoke-louver", [x, roofTop + 0.2, 0], [0.8, 0.4, 0.6], "wood");
  k.box("louver-cap", [x, roofTop + 0.45, 0], [1, 0.1, 0.8], look.roof === "thatch" ? "wood" : look.roof);
}

function createLowVillageHouse(spec: VillageHouseSpec) {
  const look = VILLAGE_HOUSE_LOOKS[spec.profile],
    length = clampTo(spec.length, VILLAGE_HOUSE_LIMITS.length),
    width = clampTo(spec.width, VILLAGE_HOUSE_LIMITS.width),
    eave = VILLAGE_EAVE_METERS[spec.kind],
    k = new ModelKit(`village-${spec.kind}`, look.colors);
  walls(k, look, length, width, eave);
  frame(k, look, length, width, eave);
  const top = roofAndGables(k, look, length, width, eave),
    layout = villageHouseLayout(spec, length, width);
  for (const o of layout.openings) opening(k, o, length, width);
  if (layout.smokeX !== undefined) smoke(k, look, layout.smokeX, top, width);
  return compactModel(k.finish(), { mergeEquivalentMaterials: true });
}

export function createOpusVillageHouse(spec: VillageHouseSpec, quality: "low" | "high") {
  return quality === "high" ? createOpusVillageHouseHigh(spec) : createLowVillageHouse(spec);
}

/** Definitions shared by every house of one spec and quality, so CE instances them. */
const definitions = new Map<string, BvDefinition>();
export function villageHouseDefinition(spec: VillageHouseSpec, quality: "low" | "high"): BvDefinition {
  const key = `village-house:${quality}:${villageHouseSpecKey(spec)}`;
  let definition = definitions.get(key);
  if (!definition) {
    definition = {
      id: key,
      cacheKey: key,
      create: () => createOpusVillageHouse(spec, quality)
    };
    definitions.set(key, definition);
  }
  return definition;
}
