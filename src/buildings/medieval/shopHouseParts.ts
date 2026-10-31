import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { ModelKit } from "./modelKit";
import { createHighShopComponent, type HighShopPart, type ShopHouseKind } from "./shopHouseComponents";

export const SHOP_HOUSE_PRESETS = [
  { id: "standard", name: "Standard shop" },
  { id: "unstocked", name: "Without goods or tools" },
  { id: "open-front", name: "Without canopy" }
] as const;
export type ShopHousePreset = (typeof SHOP_HOUSE_PRESETS)[number]["id"];

function createLowShopComponent(kind: ShopHouseKind, part: HighShopPart) {
  const merchant = kind === "merchant-shop-house";
  const k = new ModelKit(`${kind}-${part}-low`);
  if (part === "shell") {
    if (merchant) {
      k.hall(0, -1.5, 6, 5, 5.2, 2, { storeys: 2, doorOffset: 2, windows: false });
      for (const x of [-1.8, 1.8]) k.window(x, 1.12, 4.3);
      k.box("shop-open-window", [-1, 1.35, 1.18], [2.7, 1.4, 0.15], "dark");
    } else {
      k.hall(0, -1, 6, 4.5, 4.8, 1.7, { storeys: 2, wall: "wood", doorOffset: 2, windows: false });
      for (const x of [-1.8, 1.8]) k.window(x, 1.37, 4.1);
      k.box("open-work-window", [-1, 1.5, 1.4], [2.6, 1.4, 0.12], "dark");
      k.chimney(1.8, -1.5, 5.8);
    }
  } else if (part === "shutters") {
    if (merchant) {
      k.box("lower-display-shutter", [-1, 0.8, 1.6], [2.9, 0.1, 1], "wood");
      const top = k.box("upper-hinged-shutter", [-1, 2.25, 1.6], [2.9, 0.08, 1], "wood");
      top.rotation.x = -0.2;
    } else k.box("fold-down-work-shutter", [-1, 0.9, 1.6], [2.8, 0.1, 0.8], "wood");
  } else if (part === "counter") k.table(-1, 2, merchant ? 2.8 : 2.5, merchant ? 0.75 : 0.9, merchant ? 0.8 : 0.9);
  else if (part === "canopy") {
    if (merchant) {
      for (const x of [-2.6, 2.6]) k.box("awning-post", [x, 1.35, 2.9], [0.12, 2.7, 0.12]);
      const awning = k.box("shop-awning", [0, 2.8, 2.3], [5.7, 0.05, 2], "cloth");
      awning.rotation.x = 0.12;
    } else k.roof(-1, 2.2, 3.5, 2.3, 2.8, 0.5, "wood");
  } else if (part === "stock") {
    if (merchant) {
      for (let i = 0; i < 6; i++)
        k.box("folded-goods", [-2 + i * 0.4, 0.95, 2], [0.33, 0.18, 0.5], i % 2 ? "cloth" : "white");
      k.attach(createMedievalContainerModel("crate", "closed"), [-1.8, 0, 3.1]);
    } else
      for (let i = 0; i < 5; i++)
        k.beam("hanging-tool", [-2 + i * 0.42, 1.2, 1.5], [-2 + i * 0.42, 1.9, 1.5], 0.04, "iron", true);
  }
  return k.finish();
}

/** The facade aperture belongs to the shell; optional furnishings never plug it with another wall. */
export function shopHousePartFactories(
  kind: ShopHouseKind,
  quality: "low" | "high" = "low",
  preset: ShopHousePreset = "standard"
): ModelPartFactory[] {
  if (!SHOP_HOUSE_PRESETS.some(entry => entry.id === preset)) throw new Error(`Unknown shop-house preset: ${preset}`);
  const roles: HighShopPart[] =
    quality === "high"
      ? ["shell", "shutters", "counter", "shelves", "canopy", "stock"]
      : ["shell", "shutters", "counter", "canopy", "stock"];
  return roles
    .filter(role => !(preset === "unstocked" && role === "stock") && !(preset === "open-front" && role === "canopy"))
    .map(role => ({
      id: `${kind}:${role}`,
      role,
      quality,
      author: DEFAULT_AUTHOR,
      ...(quality === "low" && role === "stock" && kind === "merchant-shop-house"
        ? { basedOn: [variantId("container.crate-closed", "default", DEFAULT_AUTHOR)] }
        : {}),
      create: () => (quality === "high" ? createHighShopComponent(kind, role) : createLowShopComponent(kind, role))
    }));
}

export function assembleShopHouseParts(name: string, parts: readonly ModelPartFactory[]) {
  const model = createModelAssembly(name, parts);
  return parts.some(part => part.quality === "high") ? compactModel(model, { mergeEquivalentMaterials: true }) : model;
}

export function createLowShopHouse(kind: ShopHouseKind) {
  return assembleShopHouseParts(kind, shopHousePartFactories(kind));
}

export function createHighShopHouse(kind: ShopHouseKind) {
  return assembleShopHouseParts(`${kind}-high`, shopHousePartFactories(kind, "high"));
}
