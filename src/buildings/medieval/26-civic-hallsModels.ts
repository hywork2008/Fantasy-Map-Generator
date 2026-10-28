import { assemblyHall } from "./civicParts";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "medieval-town-hall",
    name: "Town hall with assembly loggia",
    task: 26,
    size: [20, 14, 15],
    note: "Civic assembly room above an open arched loggia, exterior stair, bell turret, municipal banners and a meeting balcony. Illustrative medieval town hall, not a reconstructed monument.",
    create() {
      const k = assemblyHall("medieval-town-hall", 13, 8);
      const turret = new ModelKit("town-bell-turret");
      turret.hall(0, 0, 1.8, 1.8, 2.6, 1.2, { open: true, roof: "tile" });
      for (const x of [-0.78, 0.78]) turret.beam("bell-support", [x, 1.85, -0.9], [x, 1.85, 0.9], 0.2);
      turret.beam("bell-yoke", [-0.78, 1.85, 0], [0.78, 1.85, 0], 0.2);
      turret.cylinder("civic-bell", [0, 1.5, 0], 0.35, 0.5, "iron", 0.18);
      k.attach(turret.finish(), [0, 8.6, 0]);
      for (const x of [-2, 2]) {
        k.box("municipal-banner", [x, 5.4, 4.2], [0.65, 1.8, 0.04], "cloth");
        k.box("banner-emblem", [x, 5.4, 4.23], [0.3, 0.4, 0.02], "tile");
      }
      k.box("civic-balcony", [0, 3.2, 4.8], [3, 0.18, 1.5], "stone");
      k.box("balcony-access-walk", [3.4, 3.2, 4.3], [3.8, 0.18, 0.6], "stone");
      for (let i = 0; i < 7; i++) k.box("balcony-baluster", [-1.4 + i * 0.47, 3.7, 5.45], [0.09, 0.9, 0.09], "stone");
      k.box("balcony-rail", [0, 4.2, 5.45], [3.1, 0.12, 0.15], "stone");
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "covered-market-hall",
    name: "Open market hall and meeting loft",
    task: 26,
    size: [20, 12, 10],
    note: "Long covered trading floor on timber posts, fixed vendor counters and an upper meeting chamber reached by an exterior stair. A civic market building distinct from demountable stalls.",
    create() {
      const k = assemblyHall("covered-market-hall", 15, 6);
      for (const x of [-5, -1, 3]) k.table(x, 0, 2.6, 1, 0.85);
      k.box("market-charter-board", [0, 5.3, 3.15], [1.1, 0.8, 0.06], "wood");
      return k.finish();
    }
  }
];
