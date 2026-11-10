import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { addCurvedMasonryBay } from "./curvedMasonry";
import { HouseDetailKit } from "./houseDetailKit";
import { ModelKit } from "./modelKit";
import { addOpenParishDoor, addParishMasonryWall } from "./parishChurchDetails";
import { addDressedStoneBlock } from "./preachingCrossParts";

export const MAUSOLEUM_PROFILE = {
  radius: 3,
  wallTop: 3.78,
  floorTop: 0.32,
  domeBase: 3.7,
  domeRadius: 3.05,
  domeThickness: 0.2
};
const halfBay = Math.PI / 8;
export const MAUSOLEUM_PORTAL_Z = MAUSOLEUM_PROFILE.radius * Math.cos(halfBay);
const entry = { u: 0, base: MAUSOLEUM_PROFILE.floorTop, width: 1.2, height: 2.15, pointed: false };

function platform() {
  const k = new ModelKit("mausoleum-circular-plinth");
  k.cylinder("mausoleum-lower-step", [0, 0.09, 0], 3.3, 0.18, "stone", 3.3, 64);
  k.cylinder("continuous-mausoleum-floor", [0, 0.25, 0], 3.12, 0.14, "stone", 3.12, 64);
  return k.finish();
}
function rotunda() {
  const k = new HouseDetailKit("mausoleum-open-rotunda"),
    p = MAUSOLEUM_PROFILE;
  addParishMasonryWall(k, 0, MAUSOLEUM_PORTAL_Z, 2 * p.radius * Math.sin(halfBay), p.wallTop, 0, [entry], 0.24);
  for (let i = 1; i < 8; i++) {
    const windows = i % 2 === 0 ? [{ u: 0, base: 1.55, width: 0.65, height: 1.25, pointed: false, glass: true }] : [];
    addCurvedMasonryBay(k, p.radius, (i * Math.PI) / 4, Math.PI / 4, p.wallTop, windows, 0.24);
  }
  const profile = [
    [2.72, 3.5],
    [3.1, 3.5],
    [3.16, 3.57],
    [3.16, 3.7],
    [3.1, 3.84],
    [2.72, 3.84],
    [2.72, 3.5]
  ];
  k.add(
    "continuous-annular-cornice",
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      64
    ),
    "white"
  );
  return k.finish();
}
function dome() {
  const k = new ModelKit("mausoleum-hollow-dome"),
    p = MAUSOLEUM_PROFILE,
    R = p.domeRadius,
    inner = R - p.domeThickness;
  const outer = Array.from({ length: 25 }, (_, i) => {
    const a = (i * Math.PI) / 48;
    return new THREE.Vector2(i === 24 ? 0 : R * Math.cos(a), R * Math.sin(a));
  });
  const inside = Array.from({ length: 25 }, (_, i) => {
    const a = ((24 - i) * Math.PI) / 48;
    return new THREE.Vector2(i === 0 ? 0 : inner * Math.cos(a), inner * Math.sin(a));
  });
  // A closed shell lip sits inside the continuous cornice without cutting a mounting socket.
  const shell = k.add(
    "hollow-stone-dome",
    new THREE.LatheGeometry([...outer, ...inside, outer[0].clone()], 64),
    "stone"
  );
  shell.position.y = p.domeBase;
  for (let row = 1; row <= 7; row++) {
    const a = (row * Math.PI) / 16,
      r = (R + 0.006) * Math.cos(a);
    const band = k.add("dome-mortar-course", new THREE.TorusGeometry(r, 0.007, 4, 64), "white");
    band.rotation.x = Math.PI / 2;
    band.position.y = p.domeBase + (R + 0.006) * Math.sin(a);
  }
  k.sphere("plain-dome-capstone", [0, p.domeBase + R, 0], [0.14, 0.08, 0.14], "stone");
  return k.finish();
}
function door() {
  const k = new HouseDetailKit("mausoleum-portal-door");
  addOpenParishDoor(k, 0, MAUSOLEUM_PORTAL_Z, 0, { ...entry, door: true });
  return k.finish();
}
function memorialChest() {
  const k = new ModelKit("mausoleum-memorial-chest");
  addDressedStoneBlock(k, "chest-foot", 1.6, 2.2, 0.32, 0.12);
  addDressedStoneBlock(k, "stone-chest-body", 1.35, 2, 0.44, 0.6);
  addDressedStoneBlock(k, "dressed-chest-lid", 1.5, 2.15, 1.04, 0.16);
  for (const side of [-1, 1])
    for (const y of [0.54, 0.94])
      k.beam("chest-course-moulding", [side * 0.686, y, -0.85], [side * 0.686, y, 0.85], 0.018, "white");
  const result = new ModelKit("fitted-mausoleum-chest");
  result.attach(k.finish(), [0, 0, -0.4]);
  return result.finish();
}
export function mausoleumPartFactories(): ModelPartFactory[] {
  return (
    [
      ["platform", platform],
      ["rotunda", rotunda],
      ["dome", dome],
      ["door", door],
      ["memorial-chest", memorialChest]
    ] as const
  ).map(([role, create]) => ({ id: `mausoleum:${role}`, role, quality: "high", author: DEFAULT_AUTHOR, create }));
}
