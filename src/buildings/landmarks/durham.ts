import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

export const model: LandmarkModel = {
  author: "Codex GPT-6.1 Sol",
  id: "durham",
  task: "R02",
  name: "Durham Cathedral",
  style: "Romanesque",
  state: "Present exterior: Norman body with later Gothic east end and central tower",
  size: [151, 77, 69],
  dimensions:
    "Approximate 143 m overall church length and 66 m central tower study. Chapel, tower widths and bay spacing are estimated from the exterior layout; not a measured survey.",
  note: "Norman nave, broad transepts, two flat-topped west towers, later central tower, west Galilee chapel and east Chapel of the Nine Altars. Exterior study: the celebrated thick columns and early rib vaults are not modeled inside the solid massing. Castle, cloister and river cliff are excluded.",
  sources: [{ title: "UNESCO: Norman cathedral and innovative vaulting", url: "https://whc.unesco.org/en/list/370/" }],
  create() {
    const k = new ArchitectureKit(this.id, "stone", "iron");
    k.nave("norman-body", -12, 0, 112, 14, 26, 10);
    for (const s of [-1, 1]) {
      k.nave("norman-aisle", -12, s * 11, 112, 8, 12, 4);
      k.crossNave("transept", 9, s * 20, 32, 17, 25, 9);
      k.opening("transept-round-window", 9, 14, s * 36, 5, 8, s > 0 ? 0 : Math.PI, false);
    }
    k.bays([-56, -46, -36, -26, -16, 25, 35], 7, 26, 15, 12, false);
    for (const z of [-13, 13]) k.tower("west-tower", -60, z, 11, 43.3, 0, false);
    k.tower("later-central-tower", 9, 0, 15, 65.3);
    for (const x of [2, 16]) for (const z of [-7, 7]) k.pinnacle(x, 65, z, 0.8, 3);
    k.nave("galilee-chapel", -74, 0, 12, 28, 8, 4);
    k.nave("nine-altars-chapel", 54, 0, 20, 31, 18, 7);
    for (const z of [-10, -5, 0, 5, 10]) k.opening("east-gothic-lancet", 64, 3, z, 2, 9, Math.PI / 2);
    k.rose(64, 16, 0, 4, Math.PI / 2);
    for (const z of [-8, 0, 8]) k.opening("galilee-window", -80, 2, z, 3, 4, -Math.PI / 2, false);
    // Battlements distinguish the flat-topped towers from continental spired models.
    for (const [x, z, w, y] of [
      [-60, -13, 11, 44],
      [-60, 13, 11, 44],
      [9, 0, 15, 66]
    ])
      for (const side of [-1, 1])
        for (let i = -2; i <= 2; i++) {
          k.block("merlon", x + (i * w) / 5, z + (side * w) / 2, 0.9, 0.9, 1.4, y);
          k.block("merlon", x + (side * w) / 2, z + (i * w) / 5, 0.9, 0.9, 1.4, y);
        }
    return k.finish();
  }
};
