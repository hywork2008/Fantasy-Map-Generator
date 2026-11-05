/** Dry-trade planning metadata, independent of Three.js and model construction. */
import { WORKHOME_FORMS, type WorkhomeForm } from "./workhomeFormProfiles";
export const WORKHOME_TRADES = [
  {
    id: "tailoring",
    name: "Tailor",
    form: "standard",
    optional: ["narrow"],
    equipment: ["cutting-table", "sewing-stations", "garment-stock"],
    dependencies: [],
    complete: true
  },
  {
    id: "weaving",
    name: "Weaver",
    form: "wide",
    optional: [],
    equipment: ["loom", "weaving-bench", "cloth-stock"],
    dependencies: ["fulling-and-dyeing-or-supplied-cloth-chain"],
    complete: false
  },
  {
    id: "shoemaking",
    name: "Shoemaker",
    form: "standard",
    optional: ["narrow"],
    equipment: ["cobblers-bench", "lasts", "leather-stock"],
    dependencies: [],
    complete: true
  },
  {
    id: "furriery",
    name: "Furrier",
    form: "standard",
    optional: [],
    equipment: ["fur-cutting-table", "dry-hide-stock"],
    dependencies: ["supplied-dressed-fur"],
    complete: false
  },
  {
    id: "leatherGoods",
    name: "Leather goods maker",
    form: "standard",
    optional: ["narrow"],
    equipment: ["leather-cutting-table", "stitching-stations", "finished-goods"],
    dependencies: ["supplied-tanned-leather"],
    complete: true
  },
  {
    id: "saddlery",
    name: "Saddler",
    form: "wide",
    optional: [],
    equipment: ["saddle-stand", "cutting-table", "leather-stock"],
    dependencies: ["supplied-tanned-leather"],
    complete: true
  },
  {
    id: "goldsmithing",
    name: "Goldsmith",
    form: "standard",
    optional: [],
    equipment: ["fine-metal-bench", "secure-stock"],
    dependencies: ["external-hot-metal-processes"],
    complete: false
  },
  {
    id: "joinery",
    name: "Joiner",
    form: "wide",
    optional: [],
    equipment: ["joiners-bench", "saw-rack", "board-stock"],
    dependencies: [],
    complete: true
  },
  {
    id: "bowyery",
    name: "Bow and arrow maker",
    form: "wide",
    optional: [],
    equipment: ["long-bench", "stave-stock", "arrow-rack"],
    dependencies: [],
    complete: true
  },
  {
    id: "bookTrades",
    name: "Scribe and bookbinder",
    form: "standard",
    optional: [],
    equipment: ["writing-desk", "binding-bench", "book-stock"],
    dependencies: ["supplied-parchment-or-external-parchment-preparation"],
    complete: false
  }
] as const;
export type WorkhomeTrade = (typeof WORKHOME_TRADES)[number];
export type WorkhomeRole = WorkhomeTrade["id"];
export const tradeDefinition = (role: WorkhomeRole) => WORKHOME_TRADES.find(trade => trade.id === role)!;
export const WORKHOME_TRADE_COMBINATIONS = WORKHOME_TRADES.flatMap(trade =>
  ([trade.form, ...trade.optional] as WorkhomeForm[]).map(form => ({ role: trade.id, form }))
);

const STATION_TASKS: Record<WorkhomeRole, readonly string[]> = {
  tailoring: ["cutting", "sewing", "sewing"],
  weaving: ["weaving", "cloth-preparation", "cloth-preparation"],
  shoemaking: ["cutting", "lasting", "stitching"],
  furriery: ["dry-cutting", "trimming", "sewing"],
  leatherGoods: ["cutting", "stitching", "finishing"],
  saddlery: ["cutting", "saddle-fitting", "stitching"],
  goldsmithing: ["cold-finishing", "assembly", "inspection"],
  joinery: ["planing", "chiselling", "assembly"],
  bowyery: ["stave-shaping", "arrow-shaping", "fletching"],
  bookTrades: ["writing", "collating", "binding"]
};

export function workhomeTradeProfile(role: WorkhomeRole, form: WorkhomeForm) {
  const trade = tradeDefinition(role);
  if (!([trade.form, ...trade.optional] as readonly string[]).includes(form))
    throw new Error(`Unsupported workhome trade/form: ${role}/${form}`);
  const p = WORKHOME_FORMS[form],
    left = p.workZoneXZ[0],
    stations =
      role === "weaving"
        ? [
            { id: "weaving", task: "loom", x: -1.6, z: 1.7, base: 0.72, height: 1.15, posture: "seated" },
            {
              id: "preparation-1",
              task: "cloth-preparation",
              x: -2.25,
              z: -1.675,
              base: 0.15,
              height: 1.7,
              posture: "standing"
            },
            {
              id: "preparation-2",
              task: "cloth-preparation",
              x: -0.95,
              z: -1.675,
              base: 0.15,
              height: 1.7,
              posture: "standing"
            }
          ]
        : [-1, 0, 1].map((i, index) => ({
            id: `station-${index + 1}`,
            task: STATION_TASKS[role][index],
            x: role === "saddlery" && index === 1 ? -0.65 : left + 0.875,
            z: i * (role === "bowyery" ? 1.2 : 0.8),
            base: 0.15,
            height: 1.7,
            posture: "standing"
          }));
  return {
    ...structuredClone(p),
    role,
    equipmentLayoutVersion: 1,
    operationalStatus: "dry-equipment-preview",
    equipmentVerified: true,
    operations: {
      kind: "dry-workshop-only",
      equipment: [...trade.equipment],
      operatorWidth: 0.65,
      operatorDepth: 0.65,
      stations,
      externalDependencies: [...trade.dependencies],
      completeOccupationalRow: trade.complete,
      supplyChainVerified: false,
      delivery:
        role === "joinery" || role === "bowyery" ? "hand-carried-long-stock-routing-required" : "hand-carried-stock",
      verificationScope: "equipment-fit-and-static-workplaces; not production throughput or CE placement"
    }
  };
}
