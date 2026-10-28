import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "half-timber-farmhouse",
    name: "Half-timbered farmhouse",
    task: 7,
    size: [12, 11, 8],
    note: "Two-storey farmhouse with plaster infill, exposed oak framing, shuttered windows, chimney, a side woodshed and a fenced kitchen garden.",
    create() {
      const k = new ModelKit("half-timber-farmhouse");
      k.hall(-1, -1, 7, 6, 5.1, 2, { storeys: 2 });
      for (const z of [-4, 2]) {
        k.box("storey-beam", [-1, 2.6, z], [7, 0.18, 0.18]);
        for (const x of [-3.8, -1, 1.8]) k.beam("facade-brace", [x, 2.75, z + 0.02], [x + 1, 4, z + 0.02], 0.12);
      }
      k.chimney(-2, -2, 6.6);
      k.hall(3.7, -1, 2.3, 4, 2.2, 0.8, { open: true, roof: "wood" });
      k.fence([-4, 3], [-4, 5], 0.9);
      k.fence([-4, 5], [1, 5], 0.9);
      for (let i = 0; i < 5; i++) k.box("vegetable-row", [-3.4 + i, 0.08, 4], [0.45, 0.16, 1.5], "green");
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "stone-cottage",
    name: "Stone cottage and lean-to",
    task: 7,
    size: [11, 9, 6],
    note: "Single-storey rubble-stone cottage with a thatched roof, small timber shutters, boarded door, stone chimney and a timber lean-to.",
    create() {
      const k = new ModelKit("stone-cottage");
      k.hall(-1, 0, 6.5, 5, 2.5, 1.7, { wall: "stone", roof: "thatch" });
      k.chimney(-2, -1, 5);
      k.hall(3.7, 0, 2.6, 3.5, 2, 0.6, { open: true, roof: "wood" });
      for (let i = 0; i < 6; i++)
        k.beam("stored-firewood", [3.1, 0.16 + i * 0.17, -0.7], [4.1, 0.16 + i * 0.17, -0.7], 0.13, "wood", true);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "plastered-small-house",
    name: "Small plastered town house",
    task: 7,
    size: [7, 7, 7],
    note: "Modest two-storey plastered house on a stone sill, tiled roof, upper shutters, street door, narrow chimney and a rear service annex.",
    create() {
      const k = new ModelKit("plastered-small-house");
      k.hall(0, 0, 4.5, 4.3, 4.6, 1.5, { storeys: 2 });
      k.box("upper-floor-band", [0, 2.4, 2.2], [4.5, 0.15, 0.2]);
      k.chimney(1, -1, 5.9);
      k.hall(0, -2.5, 3, 1.5, 2, 0.6, { wall: "stone", roof: "wood" });
      return k.finish();
    }
  }
];
