import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createEarthenHouse } from "../houses/earthenHouses";
import type { RegionalHouseQuality } from "../houses/regionalHouses";
import { ModelKit } from "../medieval/modelKit";

export type GarrisonBuildingKind = "barracks" | "command" | "service" | "magazine";
export interface GarrisonBuildingSpec {
  kind: GarrisonBuildingKind;
  width: number;
  depth: number;
  height: number;
}

/** Meter-sized masonry ranges: CE supplies the saved building's dimensions, without mesh stretching. */
export function createGarrisonBuilding(
  spec: GarrisonBuildingSpec,
  quality: RegionalHouseQuality = "high"
): CityStructureMeshes {
  const k = new ModelKit(`citadel-${spec.kind}`);
  const { width: w, depth: d, height: h } = spec;
  const rise = Math.min(2, d * 0.3);
  k.hall(0, 0, w, d, h, rise, {
    wall: "stone",
    roof: "tile",
    storeys: h >= 5 ? 2 : 1,
    windows: spec.kind !== "magazine"
  });
  if (quality === "high") {
    const levels = h >= 5 ? [1.4, h * 0.65] : [1.4];
    for (const side of [-1, 1]) {
      for (let x = -w / 2 + 0.8; x < w / 2 - 0.5; x += 1.8) {
        for (const y of levels) {
          if (side === 1 && Math.abs(x) < 1.1 && y < 2.5) continue;
          const windowH = spec.kind === "magazine" ? 0.25 : 0.9;
          k.box("recessed-opening", [x, y, side * (d / 2 + 0.012)], [0.55, windowH, 0.035], "dark");
          k.box(
            "stone-window-lintel",
            [x, y + windowH / 2 + 0.08, side * (d / 2 + 0.025)],
            [0.78, 0.15, 0.08],
            "stone"
          );
          if (spec.kind === "magazine") {
            for (const dx of [-0.15, 0.15])
              k.box("vent-grille", [x + dx, y, side * (d / 2 + 0.035)], [0.035, windowH, 0.035], "iron");
          } else {
            k.box("window-transom", [x, y, side * (d / 2 + 0.04)], [0.55, 0.055, 0.045], "wood");
            k.box("window-mullion", [x, y, side * (d / 2 + 0.04)], [0.055, windowH, 0.045], "wood");
          }
        }
      }
      for (let y = 0.35, row = 0; y < h - 0.15; y += 0.4, row++) {
        for (const x of [-w / 2 + 0.16, w / 2 - 0.16])
          k.box("dressed-corner-stone", [x, y, side * (d / 2 - 0.05)], [row % 2 ? 0.28 : 0.5, 0.3, 0.16], "white");
      }
    }
    // Tile courses follow the measured roof slopes rather than a texture.
    for (const side of [-1, 1])
      for (let z = 0.3; z < d / 2; z += 0.38) {
        const y = h + rise * (1 - z / (d / 2)) + 0.03;
        k.beam("roof-tile-course", [-w / 2, y, side * z], [w / 2, y, side * z], 0.055, "tile");
      }
    if (spec.kind === "service") {
      k.beam("workshop-sign-arm", [w * 0.2, 2.6, d / 2], [w * 0.2, 2.6, d / 2 + 0.2], 0.06, "iron");
      k.box("workshop-sign", [w * 0.2, 2.3, d / 2 + 0.14], [0.6, 0.4, 0.07], "wood");
    }
    if (spec.kind === "command") k.box("command-plaque", [0, 3, d / 2 + 0.06], [0.8, 0.6, 0.08], "white");
    if (spec.kind === "magazine") {
      for (const side of [-1, 1]) {
        const buttress = k.box("magazine-buttress", [side * (w / 2 - 0.2), h / 2, 0], [0.4, h, d * 0.3], "stone");
        buttress.name = "internal-magazine-buttress";
      }
    }
  }
  return k.finish();
}

export interface CourtyardLodgingSpec {
  kind: "inn" | "caravanserai";
  width: number;
  depth: number;
  courtWidth: number;
  courtDepth: number;
  entranceWidth: number;
  stableSpaces: number;
  earthen: boolean;
}

/** The entrance is an actual ground-level passage through the front range; +Z faces the road. */
export function createCourtyardLodging(
  spec: CourtyardLodgingSpec,
  quality: RegionalHouseQuality = "high"
): CityStructureMeshes {
  const k = new ModelKit(`courtyard-${spec.kind}`);
  const { width: w, depth: d, courtWidth: cw, courtDepth: cd } = spec;
  const sideWidth = (w - cw) / 2,
    frontDepth = (d - cd) / 2;
  const gate = Math.min(spec.entranceWidth, cw * 0.5);
  const floorHeight = spec.kind === "caravanserai" ? 3.2 : 3;
  const range = (x: number, z: number, width: number, depth: number) => {
    if (spec.earthen) {
      const model = createEarthenHouse(
        {
          footprint: [
            [-width / 2, -depth / 2],
            [width / 2, -depth / 2],
            [width / 2, depth / 2],
            [-width / 2, depth / 2]
          ],
          floorHeights: [floorHeight, 2.9],
          entranceEdge: z === 0 ? (x > 0 ? 3 : 1) : z < 0 ? 2 : 0,
          groundUse: "residential",
          wall: "earth",
          roof: "turf",
          shade: 1
        },
        quality
      );
      k.attach(model, [x, 0, z]);
    } else {
      const sideRange = z === 0;
      k.hall(
        x,
        z,
        sideRange ? depth : width,
        sideRange ? width : depth,
        floorHeight + 2.9,
        Math.min(1.5, (sideRange ? width : depth) * 0.3),
        {
          wall: "plaster",
          storeys: 2,
          rotation: sideRange ? (x > 0 ? -Math.PI / 2 : Math.PI / 2) : z > 0 ? Math.PI : 0
        }
      );
    }
  };
  k.box("open-courtyard-ground", [0, 0.025, 0], [cw, 0.05, cd], "earth");
  range(0, -(cd + frontDepth) / 2, w, frontDepth);
  for (const side of [-1, 1]) {
    range((side * (cw + sideWidth)) / 2, 0, sideWidth, cd);
    range((side * (w + gate)) / 4, (cd + frontDepth) / 2, (w - gate) / 2, frontDepth);
  }
  // Leave the saved passage free of columns, stable partitions and furniture.
  k.box("gateway-lintel", [0, 3.35, (cd + frontDepth) / 2], [gate, 0.35, frontDepth], "stone");
  for (const side of [-1, 1]) {
    for (let z = -cd / 2 + 1; z < cd / 2 - 0.7; z += 2.4) {
      k.box("gallery-post", [side * (cw / 2 - 0.7), 1.4, z], [0.15, 2.8, 0.15]);
      if (quality === "high")
        k.beam("gallery-brace", [side * (cw / 2 - 0.7), 2.2, z], [side * (cw / 2 - 0.7), 2.8, z + 0.55], 0.09);
    }
    k.box("gallery-walk", [side * (cw / 2 - 0.6), 2.9, 0], [1.2, 0.16, cd], "wood");
    k.beam("gallery-handrail", [side * (cw / 2 - 1.15), 3.8, -cd / 2], [side * (cw / 2 - 1.15), 3.8, cd / 2], 0.08);
  }
  const drawn = Math.min(8, Math.max(0, spec.stableSpaces));
  for (let i = 0; i < drawn; i++) {
    const x = -cw / 2 + 1.5 + ((cw - 3) * (i + 0.5)) / Math.max(1, drawn);
    k.fence([x, -cd / 2 + 0.2], [x, -cd / 2 + 2], 1);
  }
  if (quality === "high") {
    k.vessel("stable-water-trough", [cw / 2 - 1.5, 0.05, -cd / 2 + 2.6], 0.45, 0.55, "stone", true);
    k.box("lodging-sign", [gate / 2 + 0.5, 2.4, d / 2 + 0.04], [0.65, 0.65, 0.08], "wood");
    if (spec.kind === "inn") k.ring("inn-sign-symbol", [gate / 2 + 0.5, 2.4, d / 2 + 0.1], 0.17, 0.03, "straw", true);
  }
  return k.finish();
}

export const DEFAULT_CARAVANSERAI: CourtyardLodgingSpec = {
  kind: "caravanserai",
  width: 29,
  depth: 27,
  courtWidth: 14,
  courtDepth: 12,
  entranceWidth: 3.2,
  stableSpaces: 8,
  earthen: true
};

export interface CitadelRavelinSpec {
  polygon: readonly (readonly [number, number])[];
  /** Vertex indices where the entrance / rear connection interrupt the enclosure. */
  openings: readonly number[];
}

export function createCitadelRavelin(
  spec: CitadelRavelinSpec,
  quality: RegionalHouseQuality = "high"
): CityStructureMeshes {
  const k = new ModelKit("citadel-ravelin");
  spec.polygon.forEach((a, i) => {
    const j = (i + 1) % spec.polygon.length,
      b = spec.polygon[j];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const start = spec.openings.includes(i) ? 1.7 : 0,
      end = spec.openings.includes(j) ? 1.7 : 0;
    const span = length - start - end;
    if (span < 0.2) return;
    const tx = (b[0] - a[0]) / length,
      tz = (b[1] - a[1]) / length;
    const x = a[0] + tx * (start + span / 2),
      z = a[1] + tz * (start + span / 2);
    const angle = -Math.atan2(tz, tx);
    const wall = k.box("ravelin-curtain", [x, 2.2, z], [span, 4.4, 1.0], "stone");
    wall.rotation.y = angle;
    const coping = k.box("ravelin-parapet", [x, 4.7, z], [span, 0.6, 1.0], "stone");
    coping.rotation.y = angle;
    if (quality === "high") {
      for (let y = 0.3, row = 0; y < 4.5; y += 0.4, row++)
        for (let u = -span / 2 + 0.35 + (row % 2) * 0.2; u < span / 2 - 0.25; u += 0.75)
          for (const side of [-1, 1]) {
            const stone = k.box(
              "ravelin-ashlar",
              [x + tx * u - side * tz * 0.51, y, z + tz * u + side * tx * 0.51],
              [0.65, 0.3, 0.045],
              row % 3 ? "stone" : "white"
            );
            stone.rotation.y = angle;
          }
    }
  });
  return k.finish();
}
