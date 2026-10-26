import * as THREE from "three";
import { createModularBridge, type ModularBridgeSpec } from "../../buildings/bridges/modularBridge";
import { type ModelQuality, resolveModelQuality } from "../../buildings/modelQuality";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import { type BridgeSite, collectBridgeSites } from "../../city-editor/renderers/bridgeSites";
import type { CityDocument, Point } from "../../city-editor/types/document";
import { ROAD_TOP_Y } from "../core/roadGeometry";
import { ribbonSidePoints } from "../core/structureGeometry";
import type { CityStructureMeshes } from "./structureMeshes";

/** Raise the last metres of the saved dry approach onto the deck, following its existing plan. */
function approachRamp(
  path: Point[],
  end: Point,
  deck: number,
  width: number,
  ground: (p: Point) => number
): THREE.BufferGeometry | null {
  if (path.length < 2) return null;
  let line = path.map(p => [...p] as Point);
  const gap = (p: Point) => Math.hypot(p[0] - end[0], p[1] - end[1]);
  if (gap(line[0]) < gap(line.at(-1)!)) line.reverse();
  if (gap(line.at(-1)!) > 3) return null;
  if (gap(line.at(-1)!) > 1e-6) line.push(end);
  let remaining = 12;
  const tail: Point[] = [line.at(-1)!];
  for (let i = line.length - 2; i >= 0; i--) {
    const a = line[i],
      b = line[i + 1],
      length = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (length < 1e-6) continue;
    if (length >= remaining) {
      tail.push([b[0] + ((a[0] - b[0]) * remaining) / length, b[1] + ((a[1] - b[1]) * remaining) / length]);
      break;
    }
    tail.push(a);
    remaining -= length;
  }
  line = tail.reverse();
  const left = ribbonSidePoints(line, width / 2),
    right = ribbonSidePoints(line, -width / 2);
  if (!left || !right) return null;
  const lengths = [0];
  for (let i = 1; i < line.length; i++)
    lengths.push(lengths.at(-1)! + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const total = lengths.at(-1)!;
  if (total < 0.1) return null;
  const delta = deck - ground(end) - ROAD_TOP_Y;
  const top = line.map((p, i) => ground(p) + ROAD_TOP_Y + (delta * lengths[i]) / total);
  const positions: number[] = [];
  const vertex = (p: Point, y: number) => [p[0], y, -p[1]];
  const quad = (a: number[], b: number[], c: number[], d: number[]) =>
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 1; i < line.length; i++) {
    quad(
      vertex(left[i - 1], top[i - 1]),
      vertex(right[i - 1], top[i - 1]),
      vertex(right[i], top[i]),
      vertex(left[i], top[i])
    );
    for (const edge of [left, right])
      quad(
        vertex(edge[i - 1], top[i - 1]),
        vertex(edge[i], top[i]),
        vertex(edge[i], ground(edge[i]) + ROAD_TOP_Y - 0.03),
        vertex(edge[i - 1], ground(edge[i - 1]) + ROAD_TOP_Y - 0.03)
      );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Plan coordinates stay exact. Bay repetition handles length; no whole-model scaling is used. */
export function createTownBridges(
  city: CityDocument,
  terrain: Pick<CityTerrain, "heightAt" | "surfaceAt"> | undefined,
  waterAt: (point: Point) => number,
  quality: ModelQuality = "high"
) {
  const group = new THREE.Group();
  group.name = "ce-modular-bridges";
  const models: CityStructureMeshes[] = [],
    pickables: THREE.Mesh[] = [];
  const sites = new Map<THREE.Object3D, BridgeSite>();
  const ramps: THREE.Mesh[] = [];
  const rampMaterial = new THREE.MeshLambertMaterial({ color: 0xb9af99, side: THREE.DoubleSide });
  const replaced = new Set<string>();
  for (const site of collectBridgeSites(city)) {
    const [a, b] = site.points,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dx = (b[0] - a[0]) / length,
      dy = (b[1] - a[1]) / length;
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (length > 20000 || site.widthMeters > 40) continue;
    const water = waterAt(midpoint);
    const depth = Math.max(2, Math.min(30, site.depthMeters ?? 4));
    const bed = water - depth;
    const bankA = site.banks?.[0] ?? ([a[0] - dx * 2, a[1] - dy * 2] as Point);
    const bankB = site.banks?.[1] ?? ([b[0] + dx * 2, b[1] + dy * 2] as Point);
    const bankAt = (p: Point) => terrain?.surfaceAt(p) ?? terrain?.heightAt(p) ?? 0;
    const spec: ModularBridgeSpec = {
      material: site.material,
      length,
      width: site.widthMeters,
      deckHeight: Math.max(bankAt(bankA) + 0.95, water + 1) - bed,
      endDeckHeight: Math.max(bankAt(bankB) + 0.95, water + 1) - bed,
      waterHeight: water - bed,
      movableOpeningMeters: Math.min(site.openingMeters, Math.max(0, length - 4))
    };
    if (![water, bed, spec.deckHeight, spec.endDeckHeight].every(Number.isFinite)) continue;
    const model = createModularBridge(spec, resolveModelQuality(quality, ["high", "low"] as const));
    model.group.position.set(midpoint[0], bed, -midpoint[1]);
    model.group.rotation.y = Math.atan2(dy, dx);
    group.add(model.group);
    models.push(model);
    pickables.push(...model.pickables);
    for (const mesh of model.pickables) sites.set(mesh, site);
    for (const [index, path] of (site.approaches ?? []).entries()) {
      const geometry = approachRamp(
        path,
        site.points[index],
        bed + (index === 0 ? spec.deckHeight : spec.endDeckHeight!),
        site.widthMeters,
        bankAt
      );
      if (!geometry) continue;
      const ramp = new THREE.Mesh(geometry, rampMaterial);
      ramp.name = "bridge-bank-approach";
      ramp.receiveShadow = true;
      group.add(ramp);
      ramps.push(ramp);
      pickables.push(ramp);
      sites.set(ramp, site);
    }
    if (site.structureId) replaced.add(site.structureId);
  }
  return {
    group,
    pickables,
    replaced,
    resolve: (hit: Pick<THREE.Intersection, "object">) => sites.get(hit.object),
    dispose() {
      for (const model of models) model.dispose();
      for (const ramp of ramps) ramp.geometry.dispose();
      rampMaterial.dispose();
    }
  };
}
export type TownBridges = ReturnType<typeof createTownBridges>;
