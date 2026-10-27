import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildingAppearanceProfile, normalizeBuildingAppearanceContext } from "../../buildings/appearance/resolver";
import { BUILDING_APPEARANCE_VERSION, type BuildingAppearanceProfile } from "../../buildings/appearance/types";
import { createCodexTownWallPart } from "../../buildings/fortifications/codexTownWalls";
import type { ModelQuality } from "../../buildings/modelQuality";
import { featureGroupVertices } from "../../city-editor/generators/features";
import { castleWallIds } from "../../city-editor/generators/fortifications";
import { gateCrossingFrame } from "../../city-editor/generators/passages";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import type { CityDocument } from "../../city-editor/types/document";
import { ribbonSidePoints } from "../core/structureGeometry";
import type { BvDefinition, BvPrototypeCache } from "./bvInstances";

const LEGACY_DEFINITIONS = {
  wall: { id: "codex-town-wall", create: () => createCodexTownWallPart("wall") },
  bare: { id: "codex-town-bare-wall", create: () => createCodexTownWallPart("wall", false) },
  tower: { id: "codex-town-tower", create: () => createCodexTownWallPart("tower") },
  gate: { id: "codex-town-gate", create: () => createCodexTownWallPart("gate") }
} satisfies Record<string, BvDefinition>;

// Stable definition identities allow refreshes to reuse prototypes without sharing roof colors across cultures.
const CULTURE_DEFINITIONS = new Map<BuildingAppearanceProfile, typeof LEGACY_DEFINITIONS>();
function definitionsFor(profile: BuildingAppearanceProfile) {
  if (profile === "legacy") return LEGACY_DEFINITIONS;
  let definitions = CULTURE_DEFINITIONS.get(profile);
  if (!definitions) {
    definitions = {
      wall: LEGACY_DEFINITIONS.wall,
      bare: LEGACY_DEFINITIONS.bare,
      tower: { id: `codex-town-tower:${profile}`, create: () => createCodexTownWallPart("tower", true, profile) },
      gate: { id: `codex-town-gate:${profile}`, create: () => createCodexTownWallPart("gate", true, profile) }
    };
    CULTURE_DEFINITIONS.set(profile, definitions);
  }
  return definitions;
}

/** A sampled ribbon maps BV stonework onto the exact CE miter offsets and terrain levels. */
function ribbon(part: StructureMassing) {
  const line = part.centerline;
  if (!line || line.length < 2 || !(part.widthMeters! > 0)) return;
  const offsets = ribbonSidePoints(line, 1, part.ribbonOffsets);
  if (!offsets) return;
  const cum = [0];
  for (let i = 1; i < line.length; i++)
    cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = cum[cum.length - 1];
  if (!(total > 0.1)) return;
  const anchor = part.anchor ?? [0, 0];
  let sign = 1;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i];
    const away = -(b[1] - a[1]) * ((a[0] + b[0]) / 2 - anchor[0]) + (b[0] - a[0]) * ((a[1] + b[1]) / 2 - anchor[1]);
    if (Math.abs(away) > 1e-4) {
      sign = Math.sign(away);
      break;
    }
  }
  const at = (s: number) => {
    const target = Math.max(0, Math.min(total, s));
    let lo = 0,
      hi = line.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const t = (target - cum[lo]) / Math.max(1e-8, cum[lo + 1] - cum[lo]);
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const a = line[lo],
      b = line[lo + 1];
    const u = offsets[lo % offsets.length],
      v = offsets[(lo + 1) % offsets.length];
    return {
      x: lerp(a[0], b[0]),
      z: -lerp(a[1], b[1]),
      nx: lerp(u[0] - a[0], v[0] - b[0]) * sign,
      nz: -lerp(u[1] - a[1], v[1] - b[1]) * sign,
      base: part.baseElevationsMeters
        ? lerp(part.baseElevationsMeters[lo], part.baseElevationsMeters[lo + 1])
        : part.baseElevationMeters,
      top: part.topElevationsMeters
        ? lerp(part.topElevationsMeters[lo], part.topElevationsMeters[lo + 1])
        : part.baseElevationMeters + part.heightMeters
    };
  };
  return { total, at };
}

/** High-quality stone town defenses only. The ordinary layer retains every unaccepted part. */
export function createTownWalls(
  city: CityDocument,
  structures: readonly StructureMassing[],
  cache: BvPrototypeCache,
  quality: ModelQuality = "standard"
) {
  const context =
    city.buildingAppearanceContext ??
    normalizeBuildingAppearanceContext({
      period: city.historicalPeriod,
      tradition: city.civilization?.tradition,
      biome: city.biome
    });
  const profile =
    city.buildingAppearanceVersion === BUILDING_APPEARANCE_VERSION
      ? buildingAppearanceProfile({ profile: city.buildingAppearanceProfile, context, rural: false })
      : "legacy";
  const definitions = definitionsFor(profile);
  const group = new THREE.Group();
  group.name = "ce-codex-town-walls";
  const replaced = new Set<string>();
  const pieces: THREE.BufferGeometry[] = [];
  const leases = new Map<BvDefinition, NonNullable<ReturnType<BvPrototypeCache["acquire"]>>>();
  const prototype = (definition: BvDefinition) => {
    let lease = leases.get(definition);
    if (!lease) {
      lease = cache.acquire(definition);
      if (lease) leases.set(definition, lease);
    }
    return lease;
  };
  const append = (definition: BvDefinition, index: number, map: (x: number, y: number, z: number) => Point3) => {
    const source = prototype(definition);
    if (!source) return false;
    const geometry = source.geometry.clone();
    const p = geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...map(p.getX(i), p.getY(i), p.getZ(i)));
    geometry.computeVertexNormals();
    geometry.setAttribute("buildingIndex", new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(index), 1));
    pieces.push(geometry);
    return true;
  };
  if (quality === "high") {
    const castles = castleWallIds(city);
    const wallIds = city.featureGroups
      .filter(wall => wall.kind === "wall" && wall.wallMaterial !== "wood" && !castles.has(wall.id))
      .map(wall => wall.id);
    const walls = structures.filter(
      part =>
        part.kind === "wall" &&
        part.material === "stone" &&
        !part.sections &&
        !part.wallWalkModified &&
        !part.id.endsWith(":foundation") &&
        wallIds.some(id => part.id.startsWith(`wall:${id}:`))
    );
    for (const part of walls) {
      const path = ribbon(part);
      if (!path) continue;
      const before = pieces.length;
      const index = structures.indexOf(part),
        count = Math.ceil(path.total / 14),
        length = path.total / count;
      for (let i = 0; i < count; i++)
        append(part.parapet === "none" ? definitions.bare : definitions.wall, index, (x, y, z) => {
          const station = path.at(i * length + ((x + 7) * length) / 14);
          const offset = (z * part.widthMeters!) / 2.6;
          const height =
            y <= 8
              ? station.base + ((station.top - station.base) * y) / 8
              : station.top + ((y - 8) * part.heightMeters) / 8;
          return [station.x + station.nx * offset, height, station.z + station.nz * offset];
        });
      if (pieces.length > before) replaced.add(part.id);
    }
    // Curtain tower IDs retain their owning feature group; castle and authored towers stay separate.
    for (const [index, part] of structures.entries()) {
      if (
        part.kind !== "tower" ||
        part.material !== "stone" ||
        !part.footprint?.length ||
        part.id.endsWith(":foundation") ||
        !wallIds.some(id => part.id.startsWith(`tower-${id}-`))
      )
        continue;
      const ring = part.footprint;
      const cx = ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
        cy = ring.reduce((sum, p) => sum + p[1], 0) / ring.length;
      const radius = Math.max(...ring.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
      let best = Infinity,
        tx = 1,
        ty = 0,
        outward = 1;
      for (const wall of walls) {
        const line = wall.centerline ?? [];
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1],
            b = line[i];
          const dx = b[0] - a[0],
            dy = b[1] - a[1],
            length = Math.hypot(dx, dy);
          if (length < 1e-6) continue;
          const t = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cy - a[1]) * dy) / (length * length)));
          const distance = Math.hypot(cx - a[0] - dx * t, cy - a[1] - dy * t);
          if (distance >= best) continue;
          best = distance;
          tx = dx / length;
          ty = dy / length;
          const anchor = wall.anchor ?? [0, 0];
          outward = Math.sign(-ty * (cx - anchor[0]) + tx * (cy - anchor[1])) || 1;
        }
      }
      if (
        append(definitions.tower, index, (x, y, z) => {
          const along = (x * radius) / 3.3,
            field = ((z * radius) / 3.3) * outward;
          return [
            cx + tx * along - ty * field,
            part.baseElevationMeters + (y * (part.heightMeters - 4)) / 8,
            -cy - ty * along - tx * field
          ];
        })
      )
        replaced.add(part.id);
    }
    for (const gate of city.gates ?? []) {
      if (gate.ownerCastleId || (gate.role && gate.role !== "town")) continue;
      if (
        !city.featureGroups.some(
          wall => wallIds.includes(wall.id) && featureGroupVertices(city, wall).includes(gate.vertexId)
        )
      )
        continue;
      const own = structures.filter(
        part =>
          part.kind === "gate" &&
          part.material === "stone" &&
          [`gate:${gate.id}:flank:0`, `gate:${gate.id}:flank:1`, `gate:${gate.id}:lintel`].includes(part.id)
      );
      const lintel = own.find(part => part.id.endsWith(":lintel"));
      const flanks = own.filter(part => part.footprint?.length);
      const frame = gateCrossingFrame(city, gate.vertexId);
      if (!lintel?.centerline || flanks.length !== 2 || !frame) continue;
      // Match the existing opening and tower footprints independently; widening the road must not swell the towers.
      const [a, b] = lintel.centerline;
      const opening = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ring = flanks[0].footprint!;
      const side = Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]);
      const base = Math.max(...flanks.map(part => part.baseElevationMeters));
      const wallHeight = flanks[0].heightMeters - 2.5;
      const sy = wallHeight / 8;
      const success = append(definitions.gate, structures.indexOf(lintel), (x, y, z) => {
        const xx =
          Math.abs(x) <= 1.9 ? (x * opening) / 3.8 : Math.sign(x) * (opening / 2 + ((Math.abs(x) - 1.9) * side) / 6.6);
        const zz = (z * side) / 6.6;
        return [
          frame.point[0] + frame.tangent[0] * xx - frame.inward[0] * zz,
          // Keep the lower four metres clear even when the curtain has no wall-walk.
          base + (y <= 4 ? y : y <= 8 ? 4 + ((y - 4) * (wallHeight - 4)) / 4 : wallHeight + (y - 8) * sy),
          -frame.point[1] - frame.tangent[1] * xx + frame.inward[1] * zz
        ];
      });
      if (success) for (const part of own) replaced.add(part.id);
    }
  }
  const pickables: THREE.Mesh[] = [];
  if (pieces.length) {
    const geometry = mergeGeometries(pieces)!;
    for (const piece of pieces) piece.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    mesh.name = "codex-town-defenses";
    group.add(mesh);
    pickables.push(mesh);
  }
  let disposed = false;
  return {
    group,
    pickables,
    replaced,
    resolve(hit: THREE.Intersection) {
      if (!pickables.includes(hit.object as THREE.Mesh) || !hit.face) return;
      return structures[(hit.object as THREE.Mesh).geometry.getAttribute("buildingIndex").getX(hit.face.a)];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      for (const lease of leases.values()) lease.release();
      group.clear();
    }
  };
}
type Point3 = [number, number, number];
export type TownWalls = ReturnType<typeof createTownWalls>;
