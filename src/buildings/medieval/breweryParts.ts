import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { type BreweryKind, type BreweryPart, createHighBreweryComponent } from "./breweryComponents";
import { ModelKit } from "./modelKit";

export const BREWERY_PRESETS = [
  { id: "standard", name: "Standard brewery" },
  { id: "without-casks", name: "Without storage casks" },
  { id: "brewing-yard", name: "Brewing yard only" }
] as const;
export type BreweryPreset = (typeof BREWERY_PRESETS)[number]["id"];

function createLowBreweryComponent(kind: BreweryKind, part: BreweryPart) {
  const large = kind === "town-brewery",
    width = large ? 8 : 5.5;
  const k = new ModelKit(`${kind}-${part}-low`);
  if (part === "hall") k.hall(-2, -1, width, 5, large ? 4.7 : 2.8, 1.5, { wall: "stone", storeys: large ? 2 : 1 });
  else if (["shelter", "heating-unit", "mash-tun"].includes(part)) {
    const kit = new ModelKit("copper-shelter");
    if (part === "shelter") kit.hall(0, 0, 4, 5, 3, 1.1, { open: true, roof: "wood" });
    else if (part === "heating-unit") {
      kit.box("brewing-furnace", [-0.5, 0.5, 0], [1.8, 1, 1.8], "stone");
      kit.box("furnace-mouth", [-0.5, 0.35, 0.92], [0.6, 0.5, 0.04], "dark");
      kit.vessel("brewing-copper", [-0.5, 1, 0], 0.85, 0.65, "tile", true);
      kit.chimney(-1, -1.8, 4.7);
    } else {
      kit.vessel("mash-tun", [1.5, 0, 1], 0.7, 1.2, "wood", true);
      for (const y of [0.2, 1]) kit.ring("tun-hoop", [1.5, y, 1], 0.71, 0.035);
      kit.beam("mash-paddle", [1, 1.5, 1], [1.6, 0.8, 1], 0.06, "wood", true);
    }
    k.attach(kit.finish(), [-2 + width / 2 + 3.2, 0, 0]);
  } else if (part === "malt-station") {
    k.table(0, 3, 2.2, 1, 0.85);
    k.box("malt-cooling-tray", [0, 0.97, 3], [2, 0.1, 0.8], "straw");
  } else if (part === "casks")
    for (let i = 0; i < 3; i++) k.attach(createMedievalContainerModel("barrel", "closed"), [-4.4 + i * 0.75, 0, 2.2]);
  return k.finish();
}

/** The heated copper stays with its furnace and chimney; the tun retains paddle, tap and liquid. */
export function breweryPartFactories(
  kind: BreweryKind,
  quality: "low" | "high" = "low",
  preset: BreweryPreset = "standard"
): ModelPartFactory[] {
  if (!BREWERY_PRESETS.some(entry => entry.id === preset)) throw new Error(`Unknown brewery preset: ${preset}`);
  const roles: BreweryPart[] = ["hall", "shelter", "heating-unit", "mash-tun", "malt-station", "casks"];
  return roles
    .filter(
      role =>
        preset === "standard" || (preset === "without-casks" ? role !== "casks" : !["hall", "casks"].includes(role))
    )
    .map(role => ({
      id: `${kind}:${role}`,
      role,
      quality: role === "casks" ? "low" : quality,
      author: DEFAULT_AUTHOR,
      ...(role === "casks" ? { basedOn: [variantId("container.barrel-closed", "default", DEFAULT_AUTHOR)] } : {}),
      create: () =>
        quality === "high" ? createHighBreweryComponent(kind, role) : createLowBreweryComponent(kind, role)
    }));
}

export function assembleBreweryParts(name: string, parts: readonly ModelPartFactory[]) {
  const model = createModelAssembly(name, parts);
  return parts.some(part => part.quality === "high") ? compactModel(model, { mergeEquivalentMaterials: true }) : model;
}

export const createLowBrewery = (kind: BreweryKind) => assembleBreweryParts(kind, breweryPartFactories(kind));
export const createHighBrewery = (kind: BreweryKind) =>
  assembleBreweryParts(`${kind}-high`, breweryPartFactories(kind, "high"));
