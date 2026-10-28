import {
  createCitadelRavelin,
  createCourtyardLodging,
  createGarrisonBuilding,
  DEFAULT_CARAVANSERAI,
  type GarrisonBuildingKind
} from "../facilities/siteFacilities";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "citadel-ravelin",
    name: "Citadel ravelin with open gateways · high detail",
    author: "Codex GPT-6.1 Sol",
    task: 46,
    size: [14, 13, 6],
    note: "Stone-faced detached gate work with two open connections and coursed masonry; CE supplies its saved polygon and gate locations.",
    create: () =>
      createCitadelRavelin({
        polygon: [
          [0, 9],
          [-6, 0],
          [0, -2],
          [6, 0]
        ],
        openings: [0, 2]
      })
  },
  ...(["barracks", "command", "service", "magazine"] as const).map(
    (kind: GarrisonBuildingKind): MedievalModel => ({
      id: `citadel-${kind}`,
      name: `Citadel ${kind} · high detail`,
      author: "Codex GPT-6.1 Sol",
      task: 46,
      size: [20, 10, 10],
      note: "Measured masonry range with a real doorway, dressed corners, window reveals, timber joinery and coursed tile roof. CE uses the saved facility footprint and base elevation.",
      create: () => createGarrisonBuilding({ kind, width: 18, depth: 8, height: kind === "magazine" ? 4 : 6 })
    })
  ),
  {
    id: "earthen-courtyard-caravanserai",
    name: "Earthen courtyard caravanserai · high detail",
    author: "Codex GPT-6.1 Sol",
    task: 46,
    size: [30, 28, 8],
    note: "Earthen lodging ranges around an open court, a clear entrance passage, raised galleries, stable divisions and a trough. CE retains the saved outer and court dimensions.",
    create: () => createCourtyardLodging(DEFAULT_CARAVANSERAI)
  },
  {
    id: "wayside-courtyard-inn",
    name: "Wayside courtyard inn · high detail",
    author: "Codex GPT-6.1 Sol",
    task: 46,
    size: [26, 24, 9],
    note: "Plastered lodging ranges, pitched roofs, open stable court and a real street entrance, using the same factory as CE.",
    create: () => createCourtyardLodging({ ...DEFAULT_CARAVANSERAI, kind: "inn", width: 25, depth: 23, earthen: false })
  }
];
