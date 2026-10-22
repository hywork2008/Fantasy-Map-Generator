import type { BuildingAppearanceProfile } from "../../buildings/appearance/types";
import type { CityDocument } from "../types/document";
import { assignBuildingAppearances } from "./buildingAppearance";
import type { BuildingLot } from "./buildingLots.types";
import { assignBuildingMassing } from "./buildingMassing";

/** Small deterministic sample using the same CE massing and appearance passes as a city. */
export function buildingAppearancePreview(profile: BuildingAppearanceProfile): BuildingLot[] {
  const rural = profile === "northern-wooded";
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 2,
    historicalPeriod: "highMedieval",
    generationSeed: "regional-house-preview",
    buildingAppearanceVersion: 1,
    buildingAppearanceProfile: profile,
    buildingAppearanceContext: { period: "highMedieval", forest: rural, arid: false, wetland: rural },
    frame: { extentMeters: 40, cityRadiusMeters: 15, blockSizeMeters: 50 },
    mesh: {
      vertices: {},
      edges: {},
      faces: {
        sample: {
          id: "sample",
          boundary: [],
          properties: {
            water: "land",
            elevation: 0,
            ward: "craftsmen",
            locked: false,
            buildable: true,
            settlement: rural ? "outskirts" : "core"
          }
        }
      }
    },
    featureGroups: [],
    gates: [],
    elements: []
  };
  const lots: BuildingLot[] = [-8, 0, 8].map((x, i) => ({
    id: `sample-${i}`,
    faceId: "sample",
    polygon: [
      [x - 2.5, -4],
      [x + 2.5, -4],
      [x + 2.5, 4],
      [x - 2.5, 4]
    ],
    landmark: false,
    role: "main",
    uses: ["residential"],
    storeys: 2
  }));
  return assignBuildingAppearances(document, assignBuildingMassing(document, lots));
}
