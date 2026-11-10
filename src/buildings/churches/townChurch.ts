import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import { HouseDetailKit } from "../medieval/houseDetailKit";
import { addParishBell, addParishMasonryWall } from "../medieval/parishChurchDetails";

/**
 * A west-towered parish church built from bays. The long axis runs along X with the tower at -X (the west
 * front) and the chancel at +X; the south porch faces +Z. The whole assembly is centred on its bounding box,
 * so the placement footprint is symmetric about the anchor like the basilica's.
 *
 * Joints overlap instead of being cut: the tower and chancel walls are embedded 0.3 m into the nave and the
 * porch into the nave wall, so replacing a part leaves no opening behind.
 */
export interface TownChurchSpec {
  naveBays: number;
  bayLengthMeters: number;
  naveWidthMeters: number;
  naveEaveMeters: number;
  naveRiseMeters: number;
  chancelLengthMeters: number;
  chancelWidthMeters: number;
  chancelEaveMeters: number;
  chancelRiseMeters: number;
  /** Lean-to side aisles; the nave then rises into a clerestory above their roofs. */
  aisles?: { widthMeters: number; eaveMeters: number; riseMeters: number };
  tower: {
    sizeMeters: number;
    lowerStageMeters: number;
    belfryStageMeters: number;
    roofRiseMeters: number;
    roof: "pyramid" | "spire";
    doorMeters: readonly [width: number, height: number];
  };
  porch: { widthMeters: number; depthMeters: number; eaveMeters: number; riseMeters: number };
}
export type TownChurchDetail = "low" | "high";

/** T2: the principal church of a market town of 1,000-3,000 people (22 x 10 m on the ground). */
export const MARKET_TOWN_PARISH_CHURCH: TownChurchSpec = {
  naveBays: 4,
  bayLengthMeters: 3.2,
  naveWidthMeters: 7,
  naveEaveMeters: 5,
  naveRiseMeters: 3,
  chancelLengthMeters: 4.4,
  chancelWidthMeters: 5,
  chancelEaveMeters: 4,
  chancelRiseMeters: 2.2,
  tower: {
    sizeMeters: 4.2,
    lowerStageMeters: 7,
    belfryStageMeters: 2.6,
    roofRiseMeters: 3.2,
    roof: "pyramid",
    doorMeters: [1.5, 2.5]
  },
  porch: { widthMeters: 3, depthMeters: 2.7, eaveMeters: 3.2, riseMeters: 1.6 }
};

/** T3: the principal church of a town of 3,000-8,000 people (36 x 20 m on the ground). */
export const LARGE_TOWN_PARISH_CHURCH: TownChurchSpec = {
  naveBays: 6,
  bayLengthMeters: 3.8,
  naveWidthMeters: 7.6,
  naveEaveMeters: 9,
  naveRiseMeters: 3.6,
  aisles: { widthMeters: 4.2, eaveMeters: 4.2, riseMeters: 2.1 },
  chancelLengthMeters: 5.8,
  chancelWidthMeters: 6,
  chancelEaveMeters: 6.4,
  chancelRiseMeters: 2.6,
  tower: {
    sizeMeters: 6.2,
    lowerStageMeters: 13,
    belfryStageMeters: 4.2,
    roofRiseMeters: 9.5,
    roof: "spire",
    doorMeters: [2.2, 3.3]
  },
  porch: { widthMeters: 3.6, depthMeters: 3, eaveMeters: 3.8, riseMeters: 1.9 }
};

const EMBED = 0.3;
const HALF_PI = Math.PI / 2;

interface Aperture {
  u: number;
  base: number;
  width: number;
  height: number;
  glass?: boolean;
  door?: boolean;
  pointed?: boolean;
}

/** One masonry face: arched openings with dressings in High, a plain slab with dark recesses in Low. */
function face(
  k: HouseDetailKit,
  detail: TownChurchDetail,
  x: number,
  z: number,
  width: number,
  top: number,
  angle: number,
  holes: readonly Aperture[],
  base = 0
) {
  if (detail === "high") return addParishMasonryWall(k, x, z, width, top, angle, holes, base);
  const slab = k.box(
    "stone-wall",
    k.point(x, z, angle, 0, (base + top) / 2, -0.11),
    [width, top - base, 0.22],
    "stone"
  );
  slab.rotation.y = angle;
  for (const hole of holes) {
    const recess = k.box(
      hole.door ? "doorway-recess" : "lancet-recess",
      k.point(x, z, angle, hole.u, hole.base + hole.height / 2, 0.01),
      [hole.width, hole.height, 0.05],
      "dark"
    );
    recess.rotation.y = angle;
  }
}

function roof(
  k: HouseDetailKit,
  detail: TownChurchDetail,
  x: number,
  z: number,
  length: number,
  depth: number,
  eave: number,
  rise: number
) {
  if (detail === "high") k.roofCover(x, z, length, depth, eave + 0.12, rise, "tile");
  else k.roof(x, z, length + 0.6, depth + 0.7, eave + 0.12, rise, "tile", true);
}

const outerHalf = (spec: TownChurchSpec) => spec.naveWidthMeters / 2 + (spec.aisles?.widthMeters ?? 0);

function buildTower(k: HouseDetailKit, detail: TownChurchDetail, spec: TownChurchSpec, xEast: number) {
  const t = spec.tower,
    s = t.sizeMeters,
    cx = xEast - s / 2,
    top = t.lowerStageMeters + t.belfryStageMeters;
  const door: Aperture = { u: 0, base: 0, width: t.doorMeters[0], height: t.doorMeters[1], door: true, pointed: true };
  const slit: Aperture = { u: 0, base: t.doorMeters[1] + 0.9, width: 0.45, height: 1.4, glass: true };
  const bayU = s / 6,
    belfryHeight = t.belfryStageMeters - 0.9;
  const belfry: Aperture[] = [-bayU, bayU].map(u => ({
    u,
    base: t.lowerStageMeters + 0.4,
    width: bayU,
    height: belfryHeight,
    pointed: true
  }));
  k.box("tower-plinth", [cx, 0.1, 0], [s + 0.3, 0.2, s + 0.3], "stone");
  // Faces: west (front, doorway), north and south (slit windows), east (rises above the nave roof).
  const faces: [number, number, number, Aperture[]][] = [
    [cx - s / 2, 0, -HALF_PI, [door]],
    [cx + s / 2, 0, HALF_PI, []],
    [cx, s / 2, 0, [slit]],
    [cx, -s / 2, Math.PI, [slit]]
  ];
  for (const [x, z, angle, holes] of faces) {
    face(k, detail, x, z, s, t.lowerStageMeters, angle, holes);
    face(k, detail, x, z, s, top, angle, detail === "high" ? belfry : [], t.lowerStageMeters);
  }
  k.box("belfry-floor", [cx, t.lowerStageMeters, 0], [s - 0.4, 0.14, s - 0.4], "wood");
  if (detail === "high") {
    for (const u of [-bayU, bayU])
      for (const side of [-1, 1])
        for (let row = 0; row < Math.round((belfryHeight - 0.5) / 0.3); row++) {
          const y = t.lowerStageMeters + 0.7 + row * 0.3;
          k.box("belfry-louvre", [cx + u, y, side * (s / 2 - 0.11)], [bayU - 0.08, 0.05, 0.12], "wood").rotation.x =
            side * 0.32;
        }
    addParishBell(k, cx, t.lowerStageMeters + 0.5, 0, 1.1);
  }
  k.box("tower-cornice", [cx, top + 0.1, 0], [s + 0.3, 0.2, s + 0.3], "stone");
  // West corner buttresses, two per corner, stepping back from the faces.
  for (const side of [-1, 1]) {
    const h = t.lowerStageMeters * 0.74;
    k.box("tower-buttress", [cx - s / 2 - 0.22, h / 2, side * (s / 2 - 0.2)], [0.45, h, 0.42], "stone");
    k.box("tower-buttress", [cx - s / 2 + 0.2, h / 2, side * (s / 2 + 0.22)], [0.42, h, 0.45], "stone");
  }
  const spire = t.roof === "spire";
  // A spire is octagonal, with its flats on the tower faces; corner pinnacles hide the change of plan.
  const roofMesh = k.add(
    "tower-roof",
    spire
      ? new THREE.ConeGeometry((s / 2 + 0.1) / Math.cos(Math.PI / 8), t.roofRiseMeters, 8)
      : new THREE.ConeGeometry(((s + 0.5) / 2) * Math.SQRT2, t.roofRiseMeters, 4),
    "wood"
  );
  roofMesh.position.set(cx, top + 0.2 + t.roofRiseMeters / 2, 0);
  roofMesh.rotation.y = spire ? Math.PI / 8 : Math.PI / 4;
  if (spire)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        k.box(
          "corner-pinnacle",
          [cx + (sx * (s - 0.5)) / 2, top + 0.2 + 0.6, (sz * (s - 0.5)) / 2],
          [0.5, 1.2, 0.5],
          "stone"
        );
        k.cylinder(
          "pinnacle-cap",
          [cx + (sx * (s - 0.5)) / 2, top + 0.2 + 1.5, (sz * (s - 0.5)) / 2],
          0.02,
          0.6,
          "stone",
          0.3,
          4
        );
      }
  const apex = top + 0.2 + t.roofRiseMeters;
  k.beam("tower-cross", [cx, apex - 0.1, 0], [cx, apex + 0.9, 0], 0.07, "iron");
  k.beam("tower-cross-arm", [cx - 0.28, apex + 0.6, 0], [cx + 0.28, apex + 0.6, 0], 0.07, "iron");
}

function buildPorch(k: HouseDetailKit, detail: TownChurchDetail, spec: TownChurchSpec, x: number) {
  const p = spec.porch,
    wallZ = outerHalf(spec),
    length = p.depthMeters + EMBED;
  // Built with its gable facing local +X, then turned to face the nave's +Z side.
  const porch = new HouseDetailKit("south-porch");
  porch.box("porch-plinth", [0, 0.1, 0], [length, 0.2, p.widthMeters], "stone");
  face(porch, detail, length / 2, 0, p.widthMeters, p.eaveMeters, HALF_PI, [
    { u: 0, base: 0, width: 1.5, height: 2.3, door: false, pointed: true }
  ]);
  for (const side of [-1, 1])
    face(porch, detail, 0, (side * p.widthMeters) / 2, length, p.eaveMeters, side > 0 ? 0 : Math.PI, []);
  roof(porch, detail, 0, 0, length, p.widthMeters, p.eaveMeters, p.riseMeters);
  const model = porch.finish();
  k.attach(model, [x, 0, wallZ + p.depthMeters / 2 - EMBED / 2]);
  model.group.rotation.y = -HALF_PI;
}

function buildBody(spec: TownChurchSpec, detail: TownChurchDetail) {
  const k = new HouseDetailKit("town-church-body");
  const naveLength = spec.naveBays * spec.bayLengthMeters,
    halfWidth = spec.naveWidthMeters / 2,
    outer = outerHalf(spec),
    aisles = spec.aisles,
    porchBay = Math.floor(spec.naveBays / 2),
    bayU = (bay: number) => (bay + 0.5) * spec.bayLengthMeters - naveLength / 2;
  k.box("nave-plinth", [naveLength / 2, 0.1, 0], [naveLength, 0.2, outer * 2], "stone");
  for (const side of [-1, 1]) {
    const angle = side > 0 ? 0 : Math.PI;
    if (aisles) {
      // Outer aisle wall with a window per bay and the south door; the nave rises above it as a clerestory.
      const holes: Aperture[] = [];
      for (let bay = 0; bay < spec.naveBays; bay++)
        holes.push(
          side > 0 && bay === porchBay
            ? { u: bayU(bay), base: 0, width: 1.6, height: 2.5, door: true, pointed: true }
            : { u: bayU(bay), base: 1.3, width: 0.9, height: 2, glass: true, pointed: true }
        );
      face(k, detail, naveLength / 2, side * outer, naveLength, aisles.eaveMeters, angle, holes);
      const junction = aisles.eaveMeters + aisles.riseMeters;
      face(
        k,
        detail,
        naveLength / 2,
        side * halfWidth,
        naveLength,
        spec.naveEaveMeters,
        angle,
        Array.from({ length: spec.naveBays }, (_, bay) => ({
          u: bayU(bay),
          base: junction + 0.5,
          width: 1,
          height: spec.naveEaveMeters - junction - 1,
          glass: true,
          pointed: true
        })),
        junction
      );
      // Lean-to roof: one sloping slab from the aisle eave up into the clerestory wall.
      const run = aisles.widthMeters + 0.3,
        slope = Math.atan2(aisles.riseMeters, aisles.widthMeters),
        slab = k.box(
          "aisle-roof",
          [naveLength / 2, aisles.eaveMeters + aisles.riseMeters / 2 + 0.05, side * (halfWidth + run / 2 - 0.15)],
          [naveLength + 0.6, 0.14, Math.hypot(run, aisles.riseMeters)],
          "tile"
        );
      slab.rotation.x = side * slope;
      for (const x of [0, naveLength]) {
        const gable = new THREE.BufferGeometry();
        gable.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [x, aisles.eaveMeters, side * outer, x, aisles.eaveMeters, side * halfWidth, x, junction, side * halfWidth],
            3
          )
        );
        gable.computeVertexNormals();
        k.add("aisle-end-gable", gable, "stone");
        face(
          k,
          detail,
          x,
          side * (halfWidth + aisles.widthMeters / 2),
          aisles.widthMeters,
          aisles.eaveMeters,
          x ? HALF_PI : -HALF_PI,
          []
        );
      }
      for (let bay = 0; bay <= spec.naveBays; bay++) {
        const h = aisles.eaveMeters - 0.5;
        k.box("aisle-buttress", [bay * spec.bayLengthMeters, h / 2, side * (outer + 0.24)], [0.5, h, 0.62], "stone");
        k.box(
          "buttress-offset",
          [bay * spec.bayLengthMeters, h * 0.68, side * (outer + 0.15)],
          [0.4, 0.3, 0.42],
          "white"
        );
      }
    } else {
      const holes: Aperture[] = [];
      for (let bay = 0; bay < spec.naveBays; bay++)
        holes.push(
          side > 0 && bay === porchBay
            ? { u: bayU(bay), base: 0, width: 1.5, height: 2.3, door: true, pointed: true }
            : { u: bayU(bay), base: 1.6, width: 0.7, height: 2.4, glass: true, pointed: true }
        );
      face(k, detail, naveLength / 2, side * halfWidth, naveLength, spec.naveEaveMeters, angle, holes);
      for (let bay = 0; bay <= spec.naveBays; bay++) {
        k.box("nave-buttress", [bay * spec.bayLengthMeters, 1.6, side * (halfWidth + 0.24)], [0.45, 3.2, 0.6], "stone");
        k.box(
          "buttress-offset",
          [bay * spec.bayLengthMeters, 3.3, side * (halfWidth + 0.15)],
          [0.36, 0.3, 0.4],
          "white"
        );
      }
    }
    k.box(
      "nave-eaves-cornice",
      [naveLength / 2, spec.naveEaveMeters + 0.04, side * halfWidth],
      [naveLength, 0.2, 0.3],
      "stone"
    );
  }
  // The nave's east gable wall is hidden behind the chancel; the west end is the tower's east face.
  face(k, detail, naveLength, 0, spec.naveWidthMeters, spec.naveEaveMeters, HALF_PI, []);
  roof(k, detail, naveLength / 2, 0, naveLength, spec.naveWidthMeters, spec.naveEaveMeters, spec.naveRiseMeters);

  const cl = spec.chancelLengthMeters + EMBED,
    clx = naveLength - EMBED + cl / 2,
    cw = spec.chancelWidthMeters / 2;
  k.box("chancel-plinth", [clx, 0.1, 0], [cl, 0.2, spec.chancelWidthMeters], "stone");
  for (const side of [-1, 1])
    face(k, detail, clx, side * cw, cl, spec.chancelEaveMeters, side > 0 ? 0 : Math.PI, [
      { u: 0, base: 1.3, width: 0.6, height: 1.7, glass: true, pointed: true }
    ]);
  face(k, detail, clx + cl / 2, 0, spec.chancelWidthMeters, spec.chancelEaveMeters, HALF_PI, [
    { u: 0, base: 1.1, width: 1.1, height: 2, glass: true, pointed: true }
  ]);
  roof(k, detail, clx, 0, cl, spec.chancelWidthMeters, spec.chancelEaveMeters, spec.chancelRiseMeters);
  k.beam(
    "gable-cross",
    [clx + cl / 2, spec.chancelEaveMeters + spec.chancelRiseMeters, 0],
    [clx + cl / 2, spec.chancelEaveMeters + spec.chancelRiseMeters + 0.8, 0],
    0.06,
    "iron"
  );

  buildTower(k, detail, spec, EMBED);
  buildPorch(k, detail, spec, (porchBay + 0.5) * spec.bayLengthMeters);
  return k;
}

export function createTownChurch(spec: TownChurchSpec, detail: TownChurchDetail): CityStructureMeshes {
  const body = buildBody(spec, detail).finish();
  body.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body.group, true);
  const outer = new HouseDetailKit("town-church");
  outer.attach(body, [-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2]);
  return compactModel(outer.finish());
}
