import * as THREE from "three";
import type { CityStructureMeshes } from "../city3d/three/structureMeshes";
import type { Author } from "./authors";
import { createPostMill, POST_MILL } from "./mills/postMill";
import { createTowerMill, TOWER_MILL } from "./mills/towerMill";
import { createWaterMill, WATER_MILL } from "./mills/waterMill";
import { BATTERING_RAM, createBatteringRam } from "./siege/batteringRam";
import { createEarlyFieldCannon, EARLY_FIELD_CANNON } from "./siege/earlyFieldCannon";
import { createSiegeTower, SIEGE_TOWER } from "./siege/siegeTower";
import { createTrebuchet, TREBUCHET } from "./siege/trebuchet";
import { COVERED_WAGON, createCoveredWagon } from "./vehicles/coveredWagon";
import {
  AIRSHIP,
  createAirship,
  createHotAirBalloon,
  createSteamLocomotive,
  HOT_AIR_BALLOON,
  STEAM_LOCOMOTIVE
} from "./vehicles/industrialVehicles";
import { createMedievalWagon, MEDIEVAL_WAGON } from "./vehicles/medievalWagon";
import { createMinecart, MINECART } from "./vehicles/minecart";
import { createNobleCarriage, NOBLE_CARRIAGE } from "./vehicles/nobleCarriage";
import { createWarWagon, WAR_WAGON } from "./vehicles/warWagon";
import { createMedievalWell, MEDIEVAL_WELL } from "./wells/medievalWell";
import { createPublicWaterBasin } from "./wells/publicWaterBasin";
import { PUBLIC_WATER_BASINS, WATER_BASIN_KINDS } from "./wells/publicWaterBasinSpec";

export const OBJECT_CATEGORIES = ["Siege engines", "Vehicles", "Mills", "Artillery", "Wells"] as const;
export interface PlaceableObject {
  id: string;
  category: (typeof OBJECT_CATEGORIES)[number];
  name: string;
  author: Author;
  create(): CityStructureMeshes & { plan: string };
}
/** The same factories used by Building Viewer, at their authored meter scale. */
export const PLACEABLE_OBJECTS: readonly PlaceableObject[] = [
  {
    id: "trebuchet",
    category: "Siege engines",
    name: TREBUCHET.name,
    author: TREBUCHET.author,
    create: createTrebuchet
  },
  {
    id: "batteringRam",
    category: "Siege engines",
    name: BATTERING_RAM.name,
    author: BATTERING_RAM.author,
    create: createBatteringRam
  },
  {
    id: "siegeTower",
    category: "Siege engines",
    name: SIEGE_TOWER.name,
    author: SIEGE_TOWER.author,
    create: createSiegeTower
  },
  {
    id: "hotAirBalloon",
    category: "Vehicles",
    name: HOT_AIR_BALLOON.name,
    author: HOT_AIR_BALLOON.author,
    create: createHotAirBalloon
  },
  { id: "airship", category: "Vehicles", name: AIRSHIP.name, author: AIRSHIP.author, create: createAirship },
  {
    id: "steamLocomotive",
    category: "Vehicles",
    name: STEAM_LOCOMOTIVE.name,
    author: STEAM_LOCOMOTIVE.author,
    create: createSteamLocomotive
  },
  { id: "minecart", category: "Vehicles", name: MINECART.name, author: MINECART.author, create: createMinecart },
  {
    id: "medievalWagon",
    category: "Vehicles",
    name: MEDIEVAL_WAGON.name,
    author: MEDIEVAL_WAGON.author,
    create: createMedievalWagon
  },
  {
    id: "coveredWagon",
    category: "Vehicles",
    name: COVERED_WAGON.name,
    author: COVERED_WAGON.author,
    create: createCoveredWagon
  },
  {
    id: "nobleCarriage",
    category: "Vehicles",
    name: NOBLE_CARRIAGE.name,
    author: NOBLE_CARRIAGE.author,
    create: createNobleCarriage
  },
  { id: "warWagon", category: "Vehicles", name: WAR_WAGON.name, author: WAR_WAGON.author, create: createWarWagon },
  { id: "postMill", category: "Mills", name: POST_MILL.name, author: POST_MILL.author, create: createPostMill },
  { id: "towerMill", category: "Mills", name: TOWER_MILL.name, author: TOWER_MILL.author, create: createTowerMill },
  { id: "waterMill", category: "Mills", name: WATER_MILL.name, author: WATER_MILL.author, create: createWaterMill },
  {
    id: "earlyFieldCannon",
    category: "Artillery",
    name: EARLY_FIELD_CANNON.name,
    author: EARLY_FIELD_CANNON.author,
    create: createEarlyFieldCannon
  },
  {
    id: "medievalWell",
    category: "Wells",
    name: MEDIEVAL_WELL.name,
    author: MEDIEVAL_WELL.author,
    create: createMedievalWell
  },
  ...WATER_BASIN_KINDS.map(id => ({
    id,
    category: "Wells" as const,
    name: PUBLIC_WATER_BASINS[id].name,
    author: PUBLIC_WATER_BASINS[id].author,
    create: () => createPublicWaterBasin(id)
  }))
];
export function placeableObject(id: string | undefined) {
  return PLACEABLE_OBJECTS.find(model => model.id === id);
}
const drawings = new Map<string, { plan: string; bounds: THREE.Box3 }>();
/** Cache only immutable drawings and bounds; release temporary BV meshes immediately. */
export function objectDrawing(definition: PlaceableObject) {
  let drawing = drawings.get(definition.id);
  if (!drawing) {
    const model = definition.create();
    try {
      drawing = { plan: model.plan, bounds: new THREE.Box3().setFromObject(model.group, true) };
      drawings.set(definition.id, drawing);
    } finally {
      model.dispose();
    }
  }
  return drawing;
}
