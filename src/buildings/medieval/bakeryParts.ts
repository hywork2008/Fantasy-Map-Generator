import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { type BakeryKind, type BakeryPart, createHighBakeryComponent } from "./bakeryComponents";
import { ModelKit } from "./modelKit";

export const BAKERY_PRESETS = [
  { id: "standard", name: "Standard bakery" },
  { id: "core-site", name: "Without workstations" },
  { id: "oven-only", name: "Oven and fuel" }
] as const;
export type BakeryPreset = (typeof BAKERY_PRESETS)[number]["id"];

function createLowBakeryComponent(kind: BakeryKind, part: BakeryPart) {
  const k = new ModelKit(`${kind}-${part}-low`);
  const communal = kind === "communal-bread-oven",
    town = kind === "town-bakery";
  const x = communal ? 0 : town ? 4 : 3,
    z = communal || town ? -0.5 : 0;
  if (part === "shell" && !communal) {
    if (town) k.hall(-1, -1, 7, 5, 4.7, 1.8, { storeys: 2 });
    else k.hall(-1, -1, 6, 4.5, 2.7, 1.4, { wall: "stone", door: 1.4 });
  } else if (part === "shelter" && communal) k.hall(0, 0, 5, 4, 2.8, 1.2, { open: true, roof: "wood" });
  else if (part === "oven") {
    k.box("oven-stone-plinth", [x, 0.45, z], [2.2, 0.9, 2], "stone");
    k.sphere("masonry-oven-dome", [x, 0.95, z], [1, 0.85, 0.9], "stone");
    k.box("baking-mouth", [x, 0.95, z + 0.91], [0.68, 0.55, 0.08], "dark");
    k.box("oven-landing", [x, 0.65, z + 1.08], [1.1, 0.13, 0.5], "stone");
    k.chimney(x + 0.7, z - 0.4, 2.6);
  } else if (part === "fuel") {
    for (let i = 0; i < 7; i++)
      k.beam(
        "stacked-oven-fuel",
        [x - 0.7 + i * 0.18, 0.1, z + 1.6],
        [x - 0.7 + i * 0.18, 0.1, z + 2.1],
        0.15,
        "wood",
        true
      );
  } else if (part === "cooling-bench" && !communal) {
    k.table(town ? -3.3 : -3.1, town ? 2.8 : 2.5, town ? 3 : 2.5, town ? 0.9 : 0.8, town ? 0.9 : 0.85);
  } else if (part === "bread" && town) {
    for (let i = 0; i < 8; i++)
      k.sphere("bread-loaf", [-4.5 + (i % 4) * 0.75, 1.1, 2.6 + Math.floor(i / 4) * 0.4], [0.28, 0.14, 0.15], "straw");
  } else if (part === "tools") {
    if (communal) {
      k.beam("shared-bread-peel", [-2.2, 0.8, 1.3], [-2.2, 0.8, 3], 0.055, "wood", true);
      k.box("peel-head", [-2.2, 0.8, 3.2], [0.5, 0.04, 0.5], "wood");
    } else {
      k.beam("bread-peel-handle", [-4.1, 1, 2.5], [-2.1, 1, 2.5], 0.045, "wood", true);
      k.box("bread-peel-blade", [-1.8, 1, 2.5], [0.6, 0.04, 0.4], "wood");
    }
  }
  return k.finish();
}

/** Workstations leave as complete support groups; the oven always retains its pedestal and chimney. */
export function bakeryPartFactories(
  kind: BakeryKind,
  quality: "low" | "high" = "low",
  preset: BakeryPreset = "standard"
): ModelPartFactory[] {
  if (!BAKERY_PRESETS.some(entry => entry.id === preset)) throw new Error(`Unknown bakery preset: ${preset}`);
  const communal = kind === "communal-bread-oven";
  const roles: BakeryPart[] = communal
    ? ["shelter", "oven", "fuel", "tools"]
    : quality === "high"
      ? ["shell", "oven", "fuel", "cooling-bench", "bread", "tools", "kneading-station"]
      : ["shell", "oven", "fuel", "cooling-bench", kind === "town-bakery" ? "bread" : "tools"];
  return roles
    .filter(
      role =>
        preset === "standard" ||
        ["oven", "fuel"].includes(role) ||
        (preset === "core-site" && ["shell", "shelter"].includes(role))
    )
    .map(role => ({
      id: `${kind}:${role}`,
      role,
      quality,
      author: DEFAULT_AUTHOR,
      create: () => (quality === "high" ? createHighBakeryComponent(kind, role) : createLowBakeryComponent(kind, role))
    }));
}

export function assembleBakeryParts(name: string, parts: readonly ModelPartFactory[]) {
  const model = createModelAssembly(name, parts);
  return parts.some(part => part.quality === "high") ? compactModel(model, { mergeEquivalentMaterials: true }) : model;
}

export const createLowBakery = (kind: BakeryKind) => assembleBakeryParts(kind, bakeryPartFactories(kind));
export const createHighBakery = (kind: BakeryKind) =>
  assembleBakeryParts(`${kind}-high`, bakeryPartFactories(kind, "high"));
