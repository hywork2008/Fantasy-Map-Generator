import type { Monastery, PrecinctBuilding } from "../../city-editor/generators/monasteryLayout";
import type { Point } from "../../city-editor/types/document";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { createHighFriaryBuilding, createHighFriaryCloister } from "../monasteries/friaryDetails";
import { monasteryContext } from "../monasteries/monasteryComponents";
import { ModelKit } from "./modelKit";
import { cutRoofRectangle } from "./roofCut";
import { addCraftBench } from "./workshopDetailKit";

const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, -z0],
  [x1, -z0],
  [x1, -z1],
  [x0, -z1]
];
const range = (x0: number, z0: number, x1: number, z1: number): PrecinctBuilding => ({
  polygon: rect(x0, z0, x1, z1),
  role: "range",
  ridge:
    x1 - x0 > z1 - z0
      ? [
          [x0, -(z0 + z1) / 2],
          [x1, -(z0 + z1) / 2]
        ]
      : [
          [(x0 + x1) / 2, -z0],
          [(x0 + x1) / 2, -z1]
        ]
});
/** A domestic-only plan; no phantom church is generated or used to cut these roofs. */
export function abbeyDomesticContext() {
  const plan: Monastery = {
    id: "abbey-domestic-range",
    kind: "abbey",
    name: "Abbey domestic ranges",
    faceId: "preview",
    precinct: rect(-12, -12, 12, 12),
    wall: [],
    gate: [0, -11],
    buildings: [
      range(-10, -11, 10, -7),
      range(-11, -7, -7, 7),
      range(7, -7, 11, 7),
      range(-10, 7, -1, 11),
      range(1, 7, 10, 11)
    ],
    courts: [{ kind: "garth", polygon: rect(-5, -5, 5, 5) }],
    walk: { outer: rect(-7, -7, 7, 7), garth: rect(-5, -5, 5, 5) },
    beds: [],
    trees: []
  };
  return { ...monasteryContext(plan, 0.1, 0), scale: 1 };
}

function furnishings() {
  const k = new ModelKit("abbey-domestic-furnishings");
  // Dormitory floor surrounds the internal stair opening instead of spanning over it.
  for (const [x, z, w, d] of [
    [-8.25, -9, 3.1, 3.6],
    [3.85, -9, 11.9, 3.6],
    [-4.4, -10.15, 4.6, 1.3],
    [-4.4, -7.85, 4.6, 1.3],
    [9, 0, 3.6, 13.6],
    [8.5, -7, 2.6, 0.6]
  ])
    k.box("dormitory-upper-floor", [x, 2.85, z], [w, 0.15, d], "wood");
  for (let i = 0; i < 16; i++) {
    const h = 0.175 + ((i + 1) * 2.75) / 16;
    k.box(
      "internal-dormitory-stair",
      [-6.65 + ((i + 0.5) * 4.4) / 16, (h + 0.175) / 2, -9],
      [4.4 / 16 + 0.005, h - 0.175, 0.9],
      "oak"
    );
  }
  for (const x of [-0.7, 1.9, 4.5, 7.1]) {
    k.box("dormitory-bed-frame", [x, 3.15, -9], [0.95, 0.18, 1.8], "wood");
    for (const dx of [-0.36, 0.36])
      for (const z of [-9.7, -8.3]) k.box("bed-foot", [x + dx, 3.0, z], [0.09, 0.15, 0.09], "oak");
    k.box("straw-mattress", [x, 3.31, -9], [0.86, 0.14, 1.7], "straw");
    k.box("dormitory-coverlet", [x, 3.395, -8.8], [0.88, 0.03, 1.25], "cloth");
  }
  for (const z of [-3.3, 0, 3.3]) {
    addCraftBench(k, -9, z, 1.2, 2.4, 0.95);
    for (const x of [-10, -8]) addCraftBench(k, x, z, 0.35, 2.4, 0.48);
  }
  addCraftBench(k, -5.7, 9.2, 2.3, 0.9, 0.92);
  k.vessel("kitchen-preparation-bowl", [-5.7, 0.92, 9.2], 0.27, 0.22, "wood");
  for (let i = 0; i < 4; i++) k.box("service-shelf", [5, 0.7 + i * 0.55, 9.6], [2.6, 0.08, 0.6], "wood");
  for (const x of [3.75, 6.25]) k.box("service-shelf-upright", [x, 1.55, 9.6], [0.1, 2.9, 0.1], "oak");
  return k.finish();
}

function kitchen(context: ReturnType<typeof abbeyDomesticContext>) {
  const k = new ModelKit("abbey-kitchen-range");
  k.attach(createHighFriaryBuilding(context, 3), [0, 0, 0]);
  const roof = k.pickables.filter(p => /roof/.test(p.name));
  cutRoofRectangle(k, roof, { minX: -6.43, maxX: -5.57, minZ: 8.27, maxZ: 9.13 }, p =>
    p.name === "roof-course-seam" ? "stone" : "tile"
  );
  for (const mesh of roof) mesh.removeFromParent();
  for (const side of [-1, 1]) {
    k.box("hollow-kitchen-flue-side", [-6 + side * 0.35, 3.88, 8.7], [0.16, 7.56, 0.86], "stone");
    k.box("hollow-kitchen-flue-end", [-6, 3.88, 8.7 + side * 0.35], [0.54, 7.56, 0.16], "stone");
    k.box("flue-cap-side", [-6 + side * 0.37, 7.7, 8.7], [0.2, 0.14, 0.96], "stone");
    k.box("flue-cap-end", [-6, 7.7, 8.7 + side * 0.37], [0.54, 0.14, 0.2], "stone");
  }
  return k.finish();
}

export function abbeyDomesticPartFactories(): ModelPartFactory[] {
  const context = abbeyDomesticContext();
  const definitions: Array<[string, () => ReturnType<ModelKit["finish"]>]> = [
    ["dormitory", () => createHighFriaryBuilding(context, 0)],
    ["refectory", () => createHighFriaryBuilding(context, 1)],
    ["service-range", () => createHighFriaryBuilding(context, 2)],
    ["kitchen", () => kitchen(context)],
    ["stores", () => createHighFriaryBuilding(context, 4)],
    ["cloister", () => createHighFriaryCloister(context)],
    [
      "court",
      () => {
        const k = new ModelKit("abbey-domestic-court");
        k.box("court-ground", [0, 0.05, 0], [10, 0.1, 10], "green");
        for (const x of [-2, 2])
          for (const z of [-2, 2]) {
            k.box("herb-bed", [x, 0.18, z], [2.1, 0.16, 2.1], "earth");
            for (let i = 0; i < 9; i++)
              k.sphere(
                "herb-clump",
                [x - 0.7 + (i % 3) * 0.7, 0.3, z - 0.7 + Math.floor(i / 3) * 0.7],
                [0.18, 0.08, 0.18],
                "green"
              );
          }
        return k.finish();
      }
    ],
    ["furnishings", furnishings]
  ];
  return definitions.map(([role, create]) => ({
    id: `abbey-domestic:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create
  }));
}
export const assembleDomesticParts = (name: string, parts: readonly ModelPartFactory[]) =>
  compactModel(createModelAssembly(name, parts), { mergeEquivalentMaterials: true });
export const createHighAbbeyDomestic = () =>
  assembleDomesticParts("abbey-domestic-range-high", abbeyDomesticPartFactories());
