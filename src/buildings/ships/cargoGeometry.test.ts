import * as THREE from "three";
import { expect, it } from "vitest";
import { adopt } from "../../city3d/adoption";
import { SHIP_CARGO_GEOMETRY } from "./cargoGeometry";
import { SHIP_VARIANTS } from "./shipVariants";

it("keeps cargo coordinates tied to the hull and hatch of the model CE actually adopts", () => {
  const families = { small: "sloop", medium: "caravel", large: "galleon", barge: "barge" };
  const hatches = { small: "fore-hatch", medium: "cargo-hatch", large: "deck-hatch", barge: "cargo-deck" };
  for (const type of Object.keys(families) as (keyof typeof families)[]) {
    const definition = adopt(SHIP_VARIANTS, `ship.${families[type]}`, "default");
    expect(definition.author).toBe("Codex GPT-6.1 Sol");
    const model = definition.create();
    const hull = model.pickables.find(m => ["hull-sides", "hull-topsides"].includes(m.name))!;
    const box = new THREE.Box3().setFromObject(hull);
    const metadata = SHIP_CARGO_GEOMETRY[type];
    expect(box.max.x - box.min.x).toBeCloseTo(metadata.hullLength, 4);
    expect((box.max.x + box.min.x) / 2).toBeCloseTo(metadata.hullCenter, 4);
    const hatch = new THREE.Box3().setFromObject(model.pickables.find(m => m.name === hatches[type])!);
    expect(metadata.accessX).toBeGreaterThanOrEqual(hatch.min.x);
    expect(metadata.accessX).toBeLessThanOrEqual(hatch.max.x);
    if (type === "large")
      for (const mesh of model.pickables.filter(m => m.name === "hatch-grating"))
        hatch.union(new THREE.Box3().setFromObject(mesh));
    if (type !== "barge") {
      expect((hatch.min.x + hatch.max.x) / 2).toBeCloseTo(metadata.accessX, 4);
      expect(hatch.max.y).toBeCloseTo(metadata.deckY, 4);
    }
    model.dispose();
  }
});
