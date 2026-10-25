import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { structureSurfaces } from "../../city3d/core/structureGeometry";
import type { CityTerrain } from "../generators/terrainElevation";
import { TOWN_WATER_COLOR } from "../generators/townWater";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { CityDocument, Point } from "../types/document";
import { bastionedTownStructures } from "./bastionedTownMassing";
import { renderBastionedTown } from "./bastionedTownSvg";
import { groundStructures } from "./terrainMassing";

function slopedTown(base: number): CityDocument {
  const platform: Point[] = [
    [0, 0],
    [12, 0],
    [12, 8],
    [0, 8]
  ];
  return {
    mesh: {
      faces: {
        low: { properties: { water: "land", elevation: 2 } },
        high: { properties: { water: "land", elevation: base } }
      }
    },
    bastionedTown: {
      id: "gc:bastioned-town",
      bastions: [
        {
          id: "gc:bastion-0",
          platform,
          elevations: {
            base: [base, base, base, base, base],
            crest: [base + 5, base + 5, base + 5, base + 5, base + 5]
          }
        }
      ],
      curtains: [
        {
          id: "gc:curtain-0",
          closure: "rampart",
          rampart: [
            [0, 0],
            [20, 0],
            [20, 4],
            [0, 4]
          ],
          elevations: { base: [base, base + 1], crest: [base + 5, base + 6] }
        }
      ],
      outworks: [],
      ditches: [
        {
          id: "gc:ditch-main",
          kind: "dry",
          region: [{ outer: platform, holes: [] }],
          bed: platform.map(() => base - 3),
          bank: platform.map(() => base)
        }
      ],
      glacis: [],
      accesses: [
        {
          id: "gc:access-0",
          bridge: [
            [0, 0],
            [8, 0]
          ],
          widthMeters: 3,
          elevations: [base + 1.2, base + 1.2]
        }
      ],
      works: []
    }
  } as unknown as CityDocument;
}

describe("bastioned town masses on a slope", () => {
  it("keeps the rampart height and lets the cell surface supply the bank", () => {
    const structures = bastionedTownStructures(slopedTown(38));
    const bastion = structures.find(item => item.id === "gc:bastion-0");
    const curtain = structures.find(item => item.id === "gc:curtain-0:0");
    const ditch = structures.find(item => item.id === "gc:ditch-main");
    const bridge = structures.find(item => item.id === "gc:access-0");
    expect(bastion?.baseElevationMeters).toBe(0);
    expect(bastion?.heightMeters).toBeCloseTo(5);
    expect(curtain?.baseElevationMeters).toBe(0);
    expect(curtain?.heightMeters).toBeCloseTo(5);
    expect(ditch?.sections?.[0].elevationsMeters[0]).toBeCloseTo(36);
    expect(ditch?.sections?.[1].elevationsMeters[0]).toBeCloseTo(36.2);
    expect(bridge?.baseElevationMeters).toBeCloseTo(1.2);
    expect(bridge?.baseElevationsMeters).toBeUndefined();

    const terrain = {
      relief: true,
      heightAt: () => 22,
      foundationAt: () => 22
    } as unknown as CityTerrain;
    const [grounded] = groundStructures([bastion!], terrain);
    expect(grounded.baseElevationMeters).toBeCloseTo(22);
    expect(grounded.heightMeters).toBeCloseTo(5);
  });

  it("keeps a shallow glacis on flat ground and does not raise one on a slope", () => {
    const band = [
      {
        outer: [
          [0, 0],
          [80, 0],
          [80, 40],
          [0, 40]
        ],
        holes: [
          [
            [10, 10],
            [70, 10],
            [70, 30],
            [10, 30]
          ]
        ]
      }
    ];
    const flat = slopedTown(2);
    flat.bastionedTown!.glacis = [band];
    const slab = bastionedTownStructures(flat).find(item => item.id === "gc:bastioned-town:glacis");
    expect(slab?.heightMeters).toBeCloseTo(0.15);
    expect(slab?.baseElevationMeters).toBe(0);

    const sloped = slopedTown(38);
    sloped.bastionedTown!.glacis = [band];
    const terrain = {
      relief: true,
      heightAt: (point: Point) => point[0] * 0.2,
      foundationAt: (ring: Point[]) => Math.max(...ring.map(point => point[0] * 0.2))
    } as unknown as CityTerrain;
    const grounded = groundStructures(bastionedTownStructures(sloped), terrain);
    expect(grounded.some(item => item.id.includes("glacis"))).toBe(false);
  });

  it("keeps wet-ditch water in the band outside the rampart", () => {
    const outer: Point[] = [
      [0, 0],
      [40, 0],
      [40, 40],
      [0, 40]
    ];
    const hole: Point[] = [
      [10, 10],
      [30, 10],
      [30, 30],
      [10, 30]
    ];
    const town = slopedTown(0);
    for (const face of Object.values(town.mesh.faces)) face.properties.elevation = 0;
    const ditch = town.bastionedTown!.ditches[0];
    ditch.kind = "wet";
    ditch.region = [{ outer, holes: [hole] }];
    ditch.bed = outer.map(() => -3);
    ditch.bank = outer.map(() => 0);
    const parts = bastionedTownStructures(town).filter(item => item.id.startsWith("gc:ditch-main"));
    expect(parts).toHaveLength(outer.length);
    const river = new THREE.Color(TOWN_WATER_COLOR.river);
    expect(
      parts.every(item => item.color?.[0] === river.r && item.color[1] === river.g && item.color[2] === river.b)
    ).toBe(true);
    const plan = town.bastionedTown!;
    plan.coveredWays = [];
    plan.bastions[0].rampart = plan.bastions[0].platform;
    expect(renderBastionedTown(town).querySelector(".ce-bastion-ditch-wet")?.getAttribute("fill")).toBe(
      `#${TOWN_WATER_COLOR.river.toString(16).padStart(6, "0")}`
    );
    const terrain = {
      relief: true,
      heightAt: (point: Point) => 4 + point[0],
      foundationAt: () => 30
    } as unknown as CityTerrain;
    const grounded = groundStructures(parts, terrain);
    expect(covers(grounded, [20, 20])).toBe(false);
    expect(covers(grounded, [20, 5])).toBe(true);
    expect(grounded[0].sections?.[0].elevationsMeters[0]).toBeCloseTo(0);
  });
});

function covers(parts: StructureMassing[], point: Point): boolean {
  for (const part of parts) {
    const surfaces = structureSurfaces(part);
    if (!surfaces) continue;
    for (const soup of [surfaces.walls, surfaces.roofs]) {
      const positions = soup.positions;
      for (let index = 0; index + 8 < positions.length; index += 9) {
        const triangle: Point[] = [
          [positions[index], -positions[index + 2]],
          [positions[index + 3], -positions[index + 5]],
          [positions[index + 6], -positions[index + 8]]
        ];
        if (pointInTriangle(point, triangle[0], triangle[1], triangle[2])) return true;
      }
    }
  }
  return false;
}

function pointInTriangle(point: Point, a: Point, b: Point, c: Point): boolean {
  const area = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]);
  const whole = area(a, b, c);
  if (Math.abs(whole) < 1e-8) return false;
  const ab = area(point, a, b) / whole;
  const bc = area(point, b, c) / whole;
  const ca = area(point, c, a) / whole;
  return ab >= -1e-8 && bc >= -1e-8 && ca >= -1e-8;
}
