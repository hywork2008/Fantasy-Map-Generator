import { type MedievalModel, ModelKit } from "./modelKit";

export function cloister(k: ModelKit, size = 10) {
  for (const side of [-1, 1]) {
    k.box("cloister-walk", [0, 0.08, (side * size) / 2], [size + 2.5, 0.16, 2], "stone");
    k.box("cloister-walk", [(side * size) / 2, 0.08, 0], [2, 0.16, size], "stone");
    k.roof(0, (side * size) / 2, size + 2.5, 2.3, 2.7, 0.55, "tile");
    const sideRoof = new ModelKit("cloister-side-roof");
    sideRoof.roof(0, 0, size, 2.3, 2.7, 0.55, "tile");
    sideRoof.group.rotation.y = Math.PI / 2;
    k.attach(sideRoof.finish(), [(side * size) / 2, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const p = -size / 2 + (i * size) / 5;
      k.cylinder("cloister-column", [p, 1.35, side * (size / 2 - 0.65)], 0.13, 2.7, "stone");
      k.cylinder("cloister-column", [side * (size / 2 - 0.65), 1.35, p], 0.13, 2.7, "stone");
    }
  }
  k.box("cloister-garden", [0, 0.035, 0], [size - 2, 0.07, size - 2], "green");
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.box("herb-bed", [x * 1.8, 0.15, z * 1.8], [2, 0.3, 2], "earth");
}
export const models: MedievalModel[] = [
  {
    id: "abbey-domestic-range",
    name: "Abbey cloister and domestic ranges",
    task: 32,
    size: [31, 29, 11],
    note: "Cloister, upper dormitory, refectory, kitchen with chimney and service range around a planted court. Domestic monastery buildings; the main abbey church is deliberately separate.",
    create() {
      const k = new ModelKit("abbey-domestic-range");
      cloister(k, 11);
      k.hall(0, -9, 19, 5, 5.4, 2, { wall: "stone", storeys: 2 });
      k.hall(-10, 0, 5, 12, 4.2, 1.8, { wall: "stone" });
      k.hall(10, 0, 5, 12, 4.8, 1.8, { wall: "stone", storeys: 2 });
      k.hall(-4, 9, 9, 5, 3.8, 1.5, { wall: "stone" });
      k.hall(5, 9, 6, 5, 3.5, 1.5, { wall: "stone" });
      k.chimney(-5, 9, 6.5);
      k.chimney(-3, 9, 6.2);
      k.table(-1, 9, 2.5, 1, 0.8);
      return k.finish();
    }
  }
];
