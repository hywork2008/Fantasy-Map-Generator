import { type MedievalModel, ModelKit } from "./modelKit";

function church(tower: boolean) {
  const k = new ModelKit(tower ? "parish-church" : "village-chapel");
  k.hall(0, 0, tower ? 12 : 8, tower ? 7 : 5, tower ? 4.3 : 3.2, tower ? 2.5 : 1.8, {
    wall: "stone",
    roof: "tile",
    windows: false,
    door: 1.4
  });
  k.hall(tower ? 6.5 : 5.2, 0, 3, 4.6, 3, 1.4, { wall: "stone", windows: false });
  for (const x of [-3, 0, 3])
    for (const z of [-1, 1]) {
      k.box("church-buttress", [x, 1.5, z * (tower ? 3.65 : 2.65)], [0.45, 3, 0.65], "stone");
      k.box("lancet-recess", [x, 2.6, z * (tower ? 3.52 : 2.52)], [0.35, 1.4, 0.04], "dark");
    }
  if (tower) {
    k.box("west-bell-tower", [-6, 3.8, 0], [3.1, 7.6, 3.1], "stone");
    for (const z of [-1.57, 1.57]) {
      k.box("belfry-opening", [-6, 6.5, z], [1.3, 1.5, 0.05], "dark");
      for (let i = 0; i < 5; i++) k.box("belfry-louvre", [-6, 6 + i * 0.23, z], [1.2, 0.08, 0.14], "wood");
    }
    k.roof(-6, 0, 3.5, 3.5, 7.65, 1.7, "wood");
  } else {
    k.hall(-3, 0, 1.8, 1.8, 5, 1, { open: true, roof: "wood" });
    k.cylinder("small-bell", [-3, 4.4, 0], 0.25, 0.4, "iron", 0.12);
  }
  const x = tower ? -6 : -3,
    y = tower ? 9.5 : 6.2;
  k.beam("roof-cross", [x, y, 0], [x, y + 0.8, 0], 0.065, "iron");
  k.beam("cross-arm", [x - 0.25, y + 0.55, 0], [x + 0.25, y + 0.55, 0], 0.065, "iron");
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    id: "parish-church",
    name: "Small parish church and bell tower",
    task: 14,
    size: [18, 10, 11],
    note: "Plain single nave, smaller chancel, stone buttresses, narrow windows and a square west bell tower. A parish-scale alternative to the large chapel models.",
    create: () => church(true)
  },
  {
    id: "village-chapel",
    name: "Village chapel with bellcote",
    task: 14,
    size: [15, 8, 8],
    note: "Small rural stone chapel with a simple nave, lower chancel, narrow windows and an open timber bellcote.",
    create: () => church(false)
  }
];
