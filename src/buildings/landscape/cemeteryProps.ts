import * as THREE from "three";
import { ModelKit } from "../medieval/modelKit";

export const CEMETERY_PROP_KINDS = [
  "ossuary_charnel_house",
  "preaching_cross_calvary",
  "mausoleum_dome",
  "stupa_chorten",
  "cremation_pyre_platform",
  "tower_of_silence",
  "ancestral_hall",
  "stepped_tumuli_mounds",
  "columbarium_walls",
  "cairns_and_steles",
  "flat_ground_markers",
  "terrace_horseshoe",
  "linear_avenue_monuments",
  "bone_cleaning_table",
  "incense_candle_stand",
  "skull_shelf",
  "high_stone_wall",
  "low_curb_or_hedge",
  "ditch_and_rampart",
  "monumental_gate_pylon",
  "mourning_cloister"
] as const;
export type CemeteryPropKind = (typeof CEMETERY_PROP_KINDS)[number];

/** Independent, reusable schematic models. CE scales footprints, never substitutes religious symbols. */
export function createCemeteryProp(kind: CemeteryPropKind) {
  const k = new ModelKit(kind);
  switch (kind) {
    case "preaching_cross_calvary":
      k.box("plinth", [0, 0.2, 0], [2, 0.4, 2], "stone");
      k.box("stone-cross", [0, 2.4, 0], [0.32, 4, 0.3], "stone");
      k.box("cross-arm", [0, 3.4, 0], [2, 0.3, 0.3], "stone");
      break;
    case "mausoleum_dome":
      k.cylinder("rotunda", [0, 1.8, 0], 3, 3.6, "stone", 3, 24);
      k.add("dome", new THREE.SphereGeometry(3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), "stone").position.y = 3.6;
      k.box("door", [0, 1.1, 3.01], [1.2, 2.2, 0.04], "dark");
      break;
    case "stupa_chorten":
      for (let i = 0; i < 3; i++) k.box("stepped-base", [0, 0.3 + i * 0.6, 0], [6 - i, 0.6, 6 - i], "stone");
      k.sphere("reliquary", [0, 2.2, 0], [1.8, 1.8, 1.8], "white");
      k.cylinder("spire", [0, 5, 0], 0.75, 3, "stone", 0.02);
      break;
    case "tower_of_silence":
      {
        const annulus = (outer: number, inner: number, height: number, name: string) => {
          const shape = new THREE.Shape();
          shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
          const hole = new THREE.Path();
          hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
          shape.holes.push(hole);
          const mesh = k.add(
            name,
            new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 }),
            "stone"
          );
          mesh.rotation.x = -Math.PI / 2;
        };
        annulus(5, 4.6, 3, "roofless-ring");
        annulus(4.6, 1, 0.1, "exposure-platform");
        annulus(1.2, 1, 0.5, "central-well");
      }
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        k.beam(
          "radial-channel",
          [Math.cos(a), 0.12, Math.sin(a)],
          [Math.cos(a) * 4.8, 0.12, Math.sin(a) * 4.8],
          0.08,
          "dark"
        );
      }
      break;
    case "ossuary_charnel_house":
    case "ancestral_hall":
      k.hall(0, 0, 6, 4, 3, 1.8, { wall: "stone", roof: "tile", door: 1.2 });
      if (kind === "ossuary_charnel_house")
        for (const x of [-1.8, 1.8]) k.box("vent", [x, 1.7, 2.02], [0.6, 0.6, 0.04], "dark");
      else for (const x of [-2, 0, 2]) k.box("ancestral-tablet", [x, 1.3, 1.5], [0.35, 0.9, 0.15], "wood");
      break;
    case "cremation_pyre_platform":
      k.box("stone-platform", [0, 0.35, 0], [6, 0.7, 3], "stone");
      for (let i = 0; i < 4; i++)
        for (const z of [-0.6, 0.6])
          k.beam("pyre-log", [-1.6, 0.85 + i * 0.22, z], [1.6, 0.85 + i * 0.22, z], 0.2, "wood", true);
      break;
    case "stepped_tumuli_mounds":
      k.add("earth-mound", new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), "green").scale.y =
        0.65;
      k.box("entrance-stone", [0, 0.35, 1.9], [0.8, 0.7, 0.3], "stone");
      break;
    case "cairns_and_steles":
      for (let i = 0; i < 3; i++)
        k.sphere("cairn-stone", [0, 0.25 + i * 0.25, 0], [0.8 - i * 0.2, 0.25, 0.65 - i * 0.15], "stone");
      k.box("stele", [0, 1.3, 0], [0.35, 1.6, 0.25], "stone");
      break;
    case "flat_ground_markers":
      k.box("flush-slab", [0, 0.04, 0], [0.8, 0.08, 1.3], "stone");
      break;
    case "linear_avenue_monuments":
      k.box("tomb-plinth", [0, 0.2, 0], [2.8, 0.4, 2.8], "stone");
      k.box("sarcophagus", [0, 0.9, 0], [2.2, 1, 1.3], "stone");
      k.roof(0, 0, 2.4, 1.5, 1.4, 0.4, "stone", true);
      break;
    case "columbarium_walls":
      k.box("niche-wall", [0, 1.5, 0], [4, 3, 0.8], "stone");
      for (const x of [-1.4, -0.5, 0.5, 1.4])
        for (const y of [0.6, 1.5, 2.4]) k.box("urn-niche", [x, y, 0.41], [0.55, 0.55, 0.02], "dark");
      break;
    case "terrace_horseshoe": {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 2.2, 0, Math.PI, false);
      shape.absarc(0, 0, 1.5, Math.PI, 0, true);
      shape.closePath();
      const mesh = k.add(
        "horseshoe-wall",
        new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false, curveSegments: 12 }),
        "stone"
      );
      mesh.rotation.x = -Math.PI / 2;
      break;
    }
    case "bone_cleaning_table":
      k.box("washing-slab", [0, 1, 0], [2.2, 0.2, 1.2], "stone");
      for (const x of [-0.8, 0.8]) k.box("table-leg", [x, 0.45, 0], [0.3, 0.9, 0.9], "stone");
      break;
    case "incense_candle_stand":
      k.cylinder("stand-base", [0, 0.15, 0], 0.6, 0.3, "stone");
      k.cylinder("stand-stem", [0, 0.8, 0], 0.12, 1.3, "iron");
      k.vessel("incense-bowl", [0, 1.4, 0], 0.6, 0.3, "iron");
      break;
    case "skull_shelf":
      for (const x of [-1, 1]) k.box("shelf-post", [x, 1, 0], [0.15, 2, 0.2], "wood");
      for (const y of [0.5, 1.2, 1.9]) {
        k.box("shelf", [0, y, 0], [2.2, 0.12, 0.6], "wood");
        for (const x of [-0.6, 0, 0.6]) k.sphere("schematic-skull", [x, y + 0.23, 0], [0.16, 0.17, 0.15], "white");
      }
      break;
    case "high_stone_wall":
      k.box("precinct-wall", [0, 1.1, 0], [4, 2.2, 0.5], "stone");
      k.box("coping", [0, 2.3, 0], [4, 0.2, 0.65], "stone");
      break;
    case "low_curb_or_hedge":
      k.box("curb", [0, 0.15, 0], [4, 0.3, 0.5], "stone");
      k.box("hedge", [0, 0.7, 0], [4, 0.8, 0.65], "green");
      break;
    case "ditch_and_rampart":
      k.cylinder("earth-bank", [0, 0.45, 0], 1, 0.9, "earth", 0.5, 4).scale.set(2, 1, 1);
      k.box("ditch-bed", [0, 0.025, 1.3], [4, 0.05, 0.7], "dark");
      break;
    case "monumental_gate_pylon":
      k.box("pylon-foot", [0, 0.2, 0], [1.5, 0.4, 1.5], "stone");
      k.box("pylon", [0, 2.1, 0], [1.1, 3.8, 1.1], "stone");
      k.box("pylon-cap", [0, 4.1, 0], [1.5, 0.2, 1.5], "stone");
      break;
    case "mourning_cloister":
      for (const z of [-2, 2]) {
        k.box("walkway", [0, 0.08, z], [6, 0.16, 1.5], "stone");
        k.roof(0, z, 6, 1.6, 2.8, 0.6, "tile");
        for (const x of [-2.7, -0.9, 0.9, 2.7]) k.cylinder("column", [x, 1.4, z], 0.12, 2.8, "stone");
      }
      break;
  }
  return k.finish();
}
