import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "village-stable",
    name: "Stable with divided stalls",
    task: 4,
    size: [12, 10, 6],
    note: "Four horse stalls under a timber roof, central access, feed mangers, hayrack and tack pegs. Open front exposes the stall layout.",
    create() {
      const k = new ModelKit("village-stable");
      k.hall(0, -1, 10, 6, 3, 1.8, { open: true, roof: "wood" });
      for (let i = 0; i < 5; i++) k.box("stall-partition", [-4 + i * 2, 0.9, -1], [0.08, 1.8, 4], "wood");
      for (let i = 0; i < 4; i++) {
        k.box("feed-manger", [-3 + i * 2, 0.85, -3.3], [1.5, 0.45, 0.55], "wood");
        k.box("hay-in-manger", [-3 + i * 2, 1.08, -3.3], [1.3, 0.12, 0.4], "straw");
        k.ring("tether-ring", [-3 + i * 2, 1.3, -3], 0.08, 0.018, "iron", true);
      }
      k.fence([-5, 3], [-1, 3]);
      k.fence([1, 3], [5, 3]);
      return k.finish();
    }
  },
  {
    id: "cattle-byre",
    name: "Stone cattle byre",
    task: 4,
    size: [12, 9, 6],
    note: "Low stone-walled cattle byre, broad doors, rear fodder rack and an exterior muck channel. Roof ventilation leaves an open ridge gap.",
    create() {
      const k = new ModelKit("cattle-byre");
      k.hall(0, -1, 10, 5.5, 2.8, 1.7, { wall: "stone", roof: "thatch", door: 2.5 });
      for (let i = 0; i < 6; i++)
        k.beam("fodder-rack-bar", [-3 + i * 0.3, 0.8, 2.4], [-3 + i * 0.3, 1.7, 2.7], 0.055, "wood");
      k.box("fodder-rack-bottom", [-2.25, 0.75, 2.4], [2.1, 0.14, 0.6], "wood");
      k.box("muck-channel", [1.5, 0.04, 2.6], [3, 0.08, 0.45], "earth");
      return k.finish();
    }
  },
  {
    id: "pigsty",
    name: "Pigsty with exercise pen",
    task: 4,
    size: [7, 8, 4],
    note: "Low stone sty with a small animal opening, timber pen and feeding trough. The short entrance and low roof distinguish it from a human dwelling.",
    create() {
      const k = new ModelKit("pigsty");
      k.hall(0, -1.5, 4.5, 3, 1.4, 0.9, { wall: "stone", roof: "wood", door: 0.8, windows: false });
      k.fence([-2.2, 0], [-2.2, 3], 0.95);
      k.fence([2.2, 0], [2.2, 3], 0.95);
      k.fence([-2.2, 3], [2.2, 3], 0.95);
      k.box("feeding-trough-floor", [0, 0.12, 2.3], [1.4, 0.12, 0.5], "wood");
      for (const z of [2.05, 2.55]) k.box("trough-rim", [0, 0.27, z], [1.5, 0.3, 0.08], "wood");
      return k.finish();
    }
  },
  {
    id: "chicken-coop",
    name: "Raised chicken coop",
    task: 4,
    size: [4, 5, 4],
    note: "Raised timber coop on four posts, ventilated slats, nesting boxes and a cleated access ramp, with a wattle run.",
    create() {
      const k = new ModelKit("chicken-coop");
      for (const x of [-0.9, 0.9]) for (const z of [-0.8, 0.8]) k.box("coop-post", [x, 0.7, z], [0.14, 1.4, 0.14]);
      k.box("coop-floor", [0, 1, 0], [2.2, 0.14, 1.9], "wood");
      for (const x of [-1, 1]) k.box("coop-end", [x, 1.6, 0], [0.13, 1.2, 1.9], "wood");
      k.box("coop-back", [0, 1.6, -0.9], [2.2, 1.2, 0.12], "wood");
      for (let i = 0; i < 8; i++) {
        const x = -0.95 + i * 0.27,
          aboveEntrance = Math.abs(x) < 0.3;
        k.box("coop-front-slat", [x, aboveEntrance ? 2 : 1.6, 0.9], [0.18, aboveEntrance ? 0.4 : 1.2, 0.09], "wood");
      }
      k.roof(0, 0, 2.6, 2.4, 2.25, 0.65, "wood", true);
      k.beam("access-ramp", [0, 0.18, 2.1], [0, 1.02, 0.9], 0.4, "wood");
      for (let i = 0; i < 6; i++) k.box("ramp-cleat", [0, 0.25 + i * 0.13, 2 - i * 0.18], [0.46, 0.07, 0.07], "wood");
      k.box("nesting-box", [1.3, 1.3, 0], [0.7, 0.55, 1.1], "wood");
      return k.finish();
    }
  }
];
