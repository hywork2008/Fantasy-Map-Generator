import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import { ModelKit } from "./modelKit";
import { createOpusTownTrade, OPUS_TOWN_TRADES } from "./opusTownTrades";

const OPUS = "Claude Opus 5.5" as const;

const OPUS_NOTES: Record<TradeId, string> = {
  chandlery:
    "Opus: tallow chandler's burgage. Gable-fronted jettied shop-house with candle bunches and soap cakes on the stall-board, a masonry rendering shed in the yard with the tallow copper under its own hood and stack, two broach dipping frames with rows of setting candles, a lye-leaching barrel for soft soap, tallow barrels and fuel.",
  metalwares:
    "Opus: pewterer and brazier. Eaves-fronted jettied shop-house showing chargers, flagons and candlesticks; a rear range with a closed finishing shop and an open casting bay holding a brick furnace with crucible and bellows, stone moulds, ingots and a pole lathe for skimming cast ware; charcoal bin and quench tub in the yard.",
  fishmongery:
    "Opus: fishmonger's open market hall on the street with stone slabs sloping toward the buyer, fresh fish, live-fish tubs, eel baskets and a hanging balance; behind it a timber-framed salting house, herring tuns stacked in the yard, a salt bin, a gutting table and a stockfish rack.",
  cutlery:
    "Opus: cutler's burgage. Gable-fronted jettied shop-house with knives, sheaths and hanging blades; a masonry forge shed with hearth, hood, bellows, anvil and quench tub; a grinding pentice with a crank-turned grindstone in its trough and a treadle whetstone; haft blanks and horn stock.",
  "lime-tile-yard":
    "Opus: suburban lime and tile works. Brick updraft tile kiln with two arched fire tunnels, a loaded chamber and a stoking shelter; a round lime kiln drawn at the foot and loaded from an earth ramp; a thatched drying shed with racks of green tiles, open brick hacks, a moulding shelter, clay pit and heaps, faggots and cordwood, fired stock by the cart gate.",
  "glaziers-workshop":
    "Opus: glazier's burgage. Eaves-fronted shop-house selling leaded panels and roundels; a rear timber-framed range lit by wide drop-and-lift shutters with a whitened glazing table and laid-out quarries, came rack, glass crates and a lead-melting stove; a small painting kiln, cullet heap and packing crates in the yard."
};

type TradeId = "chandlery" | "metalwares" | "fishmongery" | "cutlery" | "lime-tile-yard" | "glaziers-workshop";
const definitions: { id: TradeId; name: string; footprint: readonly [number, number]; note: string }[] = [
  {
    id: "chandlery",
    name: "Candle and soap chandlery",
    footprint: [12, 10],
    note: "Wax heating cauldron, dipping rack, cooling rails, soap bench and segregated finished stock."
  },
  {
    id: "metalwares",
    name: "Pewter, brass and iron smallwares workshop",
    footprint: [14, 12],
    note: "Small casting furnace, molds, finishing benches and sorted metal stock for pewter, brass, nails, locks and pins."
  },
  {
    id: "fishmongery",
    name: "Fishmonger's covered market and salting yard",
    footprint: [14, 12],
    note: "Street-facing fish counter, covered sorting table, salt tubs and separate cool storage."
  },
  {
    id: "cutlery",
    name: "Cutler's blade and haft workshop",
    footprint: [12, 10],
    note: "Small forge, grinding wheel, blade-finishing bench and haft stock; no full smelting plant."
  },
  {
    id: "lime-tile-yard",
    name: "Lime, brick and tile kiln yard",
    footprint: [20, 20],
    note: "Circular lime kiln, drying stacks, tile racks and brick setting yard."
  },
  {
    id: "glaziers-workshop",
    name: "Glazier's leaded-glass workshop",
    footprint: [12, 10],
    note: "Lead came bench, glass cutting table, panel rack and glazing supplies; glass production is external."
  }
];

function create(id: TradeId, quality: "low" | "high") {
  const d = definitions.find(item => item.id === id)!;
  const high = quality === "high";
  const [width, depth] = d.footprint;
  const k = new ModelKit(`${id}-${quality}`);
  k.box("work-yard", [0, 0.05, 0], [width, 0.1, depth], id === "lime-tile-yard" ? "earth" : "stone");
  const hallWidth = Math.min(width - 4, 8);
  const hallDepth = Math.min(depth - 4, 7);
  k.box(
    "workshop-hall",
    [-width / 2 + hallWidth / 2 + 1, 1.65, -depth / 2 + hallDepth / 2 + 1],
    [hallWidth, 3.3, hallDepth],
    "stone"
  );
  k.roof(
    -width / 2 + hallWidth / 2 + 1,
    -depth / 2 + hallDepth / 2 + 1,
    hallWidth + 0.6,
    hallDepth + 0.6,
    3.25,
    1.15,
    "tile",
    true
  );
  const frontZ = depth / 2 - 1.2;
  switch (id) {
    case "chandlery":
      k.cylinder("wax-heating-copper", [2.7, 0.65, -2], 0.7, 1.1, "iron");
      k.cylinder("melted-wax", [2.7, 1.22, -2], 0.55, 0.03, "white");
      k.box("dipping-rack", [2.5, 1.6, 0.3], [2.5, 0.12, 1.2], "oak");
      for (let i = 0; i < 8; i++)
        k.beam(
          "cooling-candle",
          [1.5 + (i % 4) * 0.55, 1.62, 0.1 + Math.floor(i / 4) * 0.6],
          [1.5 + (i % 4) * 0.55, 1.95, 0.1 + Math.floor(i / 4) * 0.6],
          0.07,
          "white"
        );
      k.box("soap-cutting-bench", [2.8, 0.9, 2.4], [2.5, 0.15, 1.1], "wood");
      break;
    case "metalwares":
      k.box("small-casting-furnace", [2.8, 1, -2], [1.5, 2, 1.5], "stone");
      k.box("furnace-mouth", [2.8, 0.75, -1.2], [0.6, 0.65, 0.08], "dark");
      k.table(2.8, 1.4, 2.4, 1.3, 0.8);
      for (const x of [1.9, 2.5, 3.1, 3.7]) k.box("smallwares-mold", [x, 0.95, 1.4], [0.32, 0.18, 0.3], "iron");
      k.box("metal-stock-rack", [4.9, 1, 0], [1.1, 2, 3], "wood");
      break;
    case "fishmongery":
      k.box("fish-counter", [0, 0.75, frontZ - 1], [5, 1.5, 1], "oak");
      k.roof(0, frontZ - 1, 5.8, 3.2, 2.25, 0.5, "wood", false);
      for (let i = 0; i < 5; i++)
        k.box("fish-display", [-1.8 + i * 0.9, 1.53, frontZ - 1], [0.65, 0.12, 0.48], i % 2 ? "dark" : "stone");
      for (const x of [-3, -1.5, 0, 1.5, 3]) k.vessel("salted-fish-tub", [x, 0, -2], 0.48, 0.9, "wood", true);
      break;
    case "cutlery":
      k.box("cutlers-forge", [2.7, 0.85, -2], [1.5, 1.7, 1.5], "stone");
      k.box("forge-mouth", [2.7, 0.7, -1.2], [0.55, 0.5, 0.08], "dark");
      k.table(2.6, 1.4, 2.4, 1.1, 0.75);
      k.ring("grinding-wheel", [4.4, 0.8, 1.5], 0.65, 0.18, "stone", true);
      k.beam("grinding-wheel-axle", [4.4, 0.8, 1.1], [4.4, 0.8, 1.9], 0.09, "iron");
      for (let i = 0; i < 4; i++)
        k.beam("unfinished-knife", [1.7 + i * 0.45, 0.95, 1.4], [2 + i * 0.45, 0.95, 1.4], 0.06, "iron");
      break;
    case "lime-tile-yard":
      k.cylinder("lime-kiln", [5.5, 1.5, -4], 2.2, 3, "stone");
      k.cylinder("kiln-mouth", [5.5, 0.65, -1.9], 0.65, 0.1, "dark");
      for (let i = 0; i < 6; i++)
        k.box(
          "drying-tile-stack",
          [-7 + (i % 3) * 2.1, 0.35 + Math.floor(i / 3) * 0.35, -5 + (i % 2) * 1.5],
          [1.6, 0.55, 1.1],
          "tile"
        );
      k.box("brick-setting-bed", [-4, 0.12, 4], [7, 0.2, 4], "earth");
      for (let i = 0; i < 8; i++)
        k.box("drying-brick", [-6.5 + (i % 4) * 1.5, 0.28, 3 + Math.floor(i / 4) * 1.1], [1.3, 0.25, 0.8], "stone");
      break;
    case "glaziers-workshop":
      k.table(2.5, 1.4, 2.5, 1.5, 0.8);
      for (let i = 0; i < 4; i++)
        k.box(
          "colored-glass-piece",
          [1.6 + (i % 2) * 0.8, 0.9, 1.1 + Math.floor(i / 2) * 0.6],
          [0.55, 0.025, 0.45],
          i % 2 ? "green" : "white"
        );
      k.box("leaded-panel-rack", [4.7, 1.4, -1], [0.18, 2.8, 2.5], "oak");
      for (let i = 0; i < 4; i++) k.box("leaded-window-panel", [4.58, 0.5 + i * 0.55, -1], [0.04, 0.45, 1.8], "white");
      break;
  }
  if (high) {
    for (const x of [-width / 2 + 0.3, width / 2 - 0.3])
      k.box("yard-gate-post", [x, 1, frontZ], [0.18, 2, 0.18], "oak");
    k.box("street-sign", [0, 2.2, frontZ], [1.8, 0.35, 0.08], "wood");
  }
  return k.finish();
}

export const models: MedievalModel[] = definitions.map((d, index) => {
  const id = `trade-workshop.dedicated-${d.id}`;
  const family = `medieval.${id}`;
  return {
    id,
    task: 58 + index,
    author: OPUS,
    name: d.name,
    size: [OPUS_TOWN_TRADES[d.id].width, OPUS_TOWN_TRADES[d.id].depth, OPUS_TOWN_TRADES[d.id].height],
    note: `${OPUS_NOTES[d.id]} Low keeps every envelope, opening and fitting; High adds the exposed frame, tile courses, joinery and small stock. The earlier Codex study (${d.note}) remains selectable. Staffing, supply and throughput remain unverified.`,
    create: () => createOpusTownTrade(d.id, "low"),
    variants: [
      ...(["low", "high"] as const).map(level => ({
        id: variantId(family, level, DEFAULT_AUTHOR),
        family,
        author: DEFAULT_AUTHOR,
        level,
        label: level === "low" ? "Low" : "High",
        create: () => create(d.id, level)
      })),
      ...(["low", "high"] as const).map(level => ({
        id: variantId(family, level, OPUS),
        family,
        author: OPUS,
        level,
        label: level === "low" ? "Low" : "High",
        create: () => createOpusTownTrade(d.id, level)
      }))
    ]
  };
});
