import fs from "node:fs";
import path from "node:path";
import { contentDigest } from "../src/buildings/canonicalJson";
import { planSvg } from "../src/buildings/planSvg";
import type { BuildingRecord, Point, WallLoop } from "../src/buildings/record";
import { validateBuildingRecord } from "../src/buildings/validate";

// Original schematic massing, not a tracing or a surveyed reconstruction.
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (x: number, y: number, radius: number): Point[] => Array.from({ length: 12 }, (_, i) =>
  [x + radius * Math.cos(i * Math.PI / 6), y + radius * Math.sin(i * Math.PI / 6)]);
const wall = (id: string, outer: Point[], kind: WallLoop["kind"] = "range"): WallLoop =>
  ({ id, kind, outer, holes: [], thicknessMeters: kind === "tower" ? 3 : 2 });
const curtain = [
  wall("west-curtain", rect(-27, -30, -24, 34), "curtain"),
  wall("north-curtain", rect(-24, 31, 27, 34), "curtain"),
  wall("east-north-curtain", rect(24, 5, 27, 31), "curtain"),
  wall("east-south-curtain", rect(24, -30, 27, 0), "curtain"),
  wall("south-curtain", rect(-24, -30, 24, -27), "curtain")
];
const ranges = [
  wall("north-range", rect(-24, 24, 24, 31)),
  wall("west-range", rect(-24, -19, -17, 24)),
  wall("south-range", rect(-24, -27, 24, -19)),
  wall("east-range", rect(17, -19, 24, 0)),
  wall("great-hall", rect(-24, -8, -16.5, 19)),
  wall("chapel", rect(17, 10, 27, 29))
];
const towers = [-19, 0, 19].map((x, i) => wall(`south-tower-${i + 1}`, circle(x, i === 1 ? -32 : -28, 8), "tower"));
const levels = [
  { id: "ground", name: "Court and vaulted ranges", elevationMeters: 0, floorToFloorMeters: 10,
    walls: [...curtain, ...ranges, ...towers] },
  { id: "upper", name: "Inner curtain and upper buildings", elevationMeters: 10, floorToFloorMeters: 6,
    walls: [...curtain, ranges[5], ...towers] },
  { id: "towers", name: "Southern tower group", elevationMeters: 16, floorToFloorMeters: 6, walls: towers },
  { id: "command", name: "Southwest command tower", elevationMeters: 22, floorToFloorMeters: 3, walls: [towers[0]] }
].map((level, i) => ({ ...level, plates: i ? [] : [
  { id: "court", use: "courtyard", outer: rect(-16.5, -19, 17, 24), holes: [], kind: "courtyard" as const, roof: "open" as const }
], openings: [], fixtures: [] }));
const record: BuildingRecord = {
  format: "fmg-building-record", version: 1, id: "krak-inner-ward", revision: 1, contentHash: "",
  name: "Krak des Chevaliers — schematic inner ward", kind: "castle", period: "highMedieval",
  planFamily: "concentric", region: "Levant / City Editor schematic",
  occupancyMeters: { width: 54, depth: 74 }, approachAzimuthRadians: 0, placementStyles: ["concentric"], levels,
  verticalLinks: levels.slice(1).map((level, i) => ({ id: `tower-stair-${i}`, kind: "stair",
    fromLevelId: levels[i].id, toLevelId: level.id, footprint: rect(-21, -30, -19, -26), widthMeters: 2 })),
  roofs: [...curtain, ...ranges, ...towers].map(part => ({ baseId: part.id, form: "flat", pitchDeg: 0 })),
  materials: { wall: "stone", roof: "flat-stone" },
  provenance: {
    constructionPeriod: "Hospitaller castle, late 12th to mid-13th century",
    depictedPhase: "Schematic inner ward around 1270; outer defences are assembled separately",
    omitted: ["surveyed plan", "reconstructed interiors", "exact floor divisions", "windows", "arrow slits", "vault ribs", "ornament"],
    dimensionSource: "French Ministry of Culture, The Krak des Chevaliers: https://archeologie.culture.gouv.fr/crac-chevaliers/en/first-hospitaller-castle-12th-century ; https://archeologie.culture.gouv.fr/crac-chevaliers/en/strengthening-fortifications-13th-century ; https://archeologie.culture.gouv.fr/crac-chevaliers/en/great-gothic-hall (hall 27 x 7.5 m only; other dimensions and heights are schematic).",
    planClass: "well-published-survey", confidence: "approximate",
    note: "Original approximate exterior model. The three southern towers, open court, ranges, chapel and hall are fixed relative to one another. Dimensions other than the published hall are design proportions, not measurements. Levels are massing sections; stair positions are schematic. The east curtain is interrupted for the inner entrance. Stone talus, outer wall, towers, stables, cistern and access ramp belong to the modular fortress assembly."
  }
};
const centered = new Set<Point[]>();
for (const level of record.levels) for (const shape of [...level.walls, ...level.plates]) {
  if (centered.has(shape.outer)) continue;
  centered.add(shape.outer);
  for (const point of shape.outer) point[1] += 3;
}
for (const link of record.verticalLinks) for (const point of link.footprint) point[1] += 3;
record.contentHash = contentDigest(record);
const checked = validateBuildingRecord(record);
if (!checked.ok) throw new Error(checked.errors.join("\n"));
const root = path.join(import.meta.dirname, "../src/buildings");
fs.writeFileSync(path.join(root, "catalogue/krak-inner-ward.json"), `${JSON.stringify(record, null, 2)}\n`);
fs.writeFileSync(path.join(root, "plans/krak-inner-ward.svg"), `${planSvg(record)}\n`);
