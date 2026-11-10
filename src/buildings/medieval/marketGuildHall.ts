import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { createCivicHallBody } from "./civicHallDetails";
import { CIVIC_STAIR, createPlacedCivicStair } from "./civicHallParts";
import { GUILD_HALL_PROFILE } from "./civicHallProfile";
import { addGuildEmblem, addGuildInspectionSamples, type EnclosedGuildRole } from "./enclosedGuildTrades";
import { ModelKit } from "./modelKit";

export type MarketGuildQuality = "low" | "high";
const width = GUILD_HALL_PROFILE.width,
  depth = GUILD_HALL_PROFILE.depth;
const pierCenters = new Map<string, [number, number]>();
for (const z of [-depth / 2, depth / 2])
  for (let i = 0; i <= 4; i++) {
    const x = -width / 2 + (i * width) / 4;
    pierCenters.set(`${x}:${z}`, [x, z]);
  }
for (const x of [-width / 2, width / 2])
  for (let i = 0; i <= 2; i++) {
    const z = -depth / 2 + (i * depth) / 2;
    pierCenters.set(`${x}:${z}`, [x, z]);
  }

/** Version 2 corrects the provisional central-column entrance and distinguishes tread/clear width. */
export const MARKET_GUILD_HALL = {
  formId: "guild-market-arcade",
  placementSpecVersion: 2,
  width,
  depth,
  groundFloor: 0.14,
  upperFloor: GUILD_HALL_PROFILE.upperFloor,
  upperWallTop: GUILD_HALL_PROFILE.upperFloor + GUILD_HALL_PROFILE.upperWall,
  roofBearingOffset: 0.12,
  envelope: { min: [-7.9, 0, -3.9], max: [9.3, 9.2, 5] },
  main: { position: [5.625, 0.14, 3.5], clearWidth: 2, clearHeight: 2.1 },
  upper: { position: [7.5, 3.32, -2.3], clearWidth: 1.1, clearHeight: 2.1 },
  stairFoot: { position: [8.36, 0, 3.6], clearWidth: 1.28, clearHeight: 2.1 },
  stair: {
    treadWidth: CIVIC_STAIR.width,
    clearWidth: 1.28,
    rise: CIVIC_STAIR.rise,
    run: CIVIC_STAIR.run,
    landingDepth: CIVIC_STAIR.landingDepth,
    risers: 18,
    flightTreads: 17,
    flightRun: 5.15,
    treadDepth: 5.15 / 17,
    centerX: 8.36,
    doorZ: GUILD_HALL_PROFILE.doorZ
  },
  groundAccess: [
    [5.625, 3.5],
    [5.625, 1],
    [0, 1],
    [0, -0.65]
  ],
  upperAccess: [
    [7.5, -2.3],
    [6.6, -2.3],
    [6.6, 0],
    [0, 0],
    [0, 3.5]
  ],
  assemblyAreaXZ: [-6.9, -2.81875, 5.9, 2.81875],
  floorLedger: {
    conservativeInset: 0.3,
    conservativeClearAreaM2: 92.16,
    circulationM2: 12,
    serviceM2: 8,
    groundPierFootprintsXZ: [...pierCenters.values()].map(([x, z]) => [x - 0.29, z - 0.29, x + 0.29, z + 0.29]),
    pierFootprintAreaM2: 4.0368
  },
  capacity: {
    netResidentialAreaM2: 0,
    workshops: 0,
    dwellings: 0,
    laborPeople: 0,
    simultaneousWorkplaces: 0,
    assemblyNetAreaM2: 72.16,
    assemblySeats: 36,
    assemblyAttendance: "delegated-or-scheduled"
  }
} as const;

function table(role: EnclosedGuildRole, quality: MarketGuildQuality) {
  const k = new ModelKit(`${role}-market-inspection-table`);
  k.table(-3, -0.65, 2.2, 1, 0.95);
  if (role === "textiles")
    for (let i = 0; i < 3; i++)
      k.box("inspection-cloth", [-3.7 + i * 0.7, 1.06, -0.65], [0.6, 0.1, 0.8], i % 2 ? "white" : "cloth");
  else if (role === "leather") k.box("inspected-leather", [-3, 1.05, -0.65], [1.8, 0.08, 0.8], "leather");
  else addGuildInspectionSamples(k, role, -0.65, quality === "high");
  if (quality === "high") k.beam("inspection-rule", [-4, 1.0225, -0.29], [-2, 1.0225, -0.29], 0.025, "wood");
  return k.finish();
}

function furnishings(role: EnclosedGuildRole, quality: MarketGuildQuality) {
  const k = new ModelKit(`${role}-market-guild-furnishings`);
  for (const x of [-3.6, 1.9])
    for (const z of [-2.45, -1.5, -0.8, 0.8, 1.5, 2.45]) {
      k.box("three-seat-assembly-bench", [x, 3.79, z], [2.4, 0.12, 0.42], "wood");
      for (const dx of [-0.95, 0.95]) k.box("bench-trestle", [x + dx, 3.54, z], [0.12, 0.44, 0.38]);
    }
  k.attach(table(role, quality), [0, 0, 0]);
  k.attach(table(role, quality), [6, 0, 0]);
  // Reuse the role emblem at the upper front wall, leaving every ground arcade bay open.
  const plaque = new ModelKit(`${role}-market-guild-emblem`);
  plaque.box("trade-sign", [-1.4, 2.95, 4.13], [1.15, 0.6, 0.12], "oak");
  if (role === "textiles")
    for (let i = 0; i < 3; i++)
      plaque.box("cloth-sign-fold", [-1.75 + i * 0.35, 2.95, 4.21], [0.22, 0.36, 0.035], "cloth");
  else if (role === "leather") {
    plaque.box("hide-sign-body", [-1.4, 2.95, 4.21], [0.55, 0.35, 0.035], "leather");
    for (const side of [-1, 1])
      for (const y of [2.79, 3.11])
        plaque.box("hide-sign-limb", [-1.4 + side * 0.29, y, 4.21], [0.18, 0.12, 0.035], "leather");
  } else addGuildEmblem(plaque, role);
  k.attach(plaque.finish(), [1.4, 3.15, -0.51]);
  return k.finish();
}

export function marketGuildHallParts(role: EnclosedGuildRole, quality: MarketGuildQuality): ModelPartFactory[] {
  return [
    ["architecture", () => createCivicHallBody("cloth", false, quality, "fully-open")],
    ["exterior-stair", () => createPlacedCivicStair("cloth", quality, "flush")],
    ["trade-furnishings", () => furnishings(role, quality)]
  ].map(([id, create]) => ({
    id: `${role}:${id}`,
    role: id as string,
    quality,
    author: DEFAULT_AUTHOR,
    create: create as ModelPartFactory["create"]
  }));
}
export function assembleMarketGuildHall(
  role: EnclosedGuildRole,
  quality: MarketGuildQuality,
  parts: readonly ModelPartFactory[] = marketGuildHallParts(role, quality)
) {
  const model = compactModel(createModelAssembly(`market-${role}-guild-hall-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  model.group.userData.placementSpec = structuredClone(MARKET_GUILD_HALL);
  return model;
}
