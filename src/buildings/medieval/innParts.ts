import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { createHighInnComponent, type InnKind, type InnPart } from "./innComponents";
import { ModelKit } from "./modelKit";

export const INN_PRESETS = [
  { id: "standard", name: "Standard inn" },
  { id: "unfurnished", name: "Without yard furniture" },
  { id: "lodging-only", name: "Lodging and courtyard" }
] as const;
export type InnPreset = (typeof INN_PRESETS)[number]["id"];

function createLowInnComponent(kind: InnKind, part: InnPart) {
  const large = kind === "courtyard-hostelry";
  const k = new ModelKit(`${kind}-${part}-low`);
  if (part === "lodging") {
    k.hall(0, -3, large ? 13 : 9, 5, 5.2, 2, { storeys: 2 });
    k.chimney(-2, -3, 6.9);
  } else if (part === "courtyard") k.box("courtyard-paving", [0, 0.035, 2], [large ? 14 : 10, 0.07, 7], "stone");
  else if (part === "stable") {
    k.hall(-6, 2, 3, 5, 2.7, 1.1, { open: true, roof: "wood" });
    for (const z of [0.2, 1.8, 3.4]) k.box("stable-partition", [-6, 0.7, z], [2.7, 1.4, 0.08], "wood");
  } else if (part === "yard-furniture") {
    k.table(0, 2, 2.5, 1, 0.8);
    for (const z of [1.15, 2.85]) {
      k.box("yard-bench", [0, 0.5, z], [2.7, 0.15, 0.3], "wood");
      for (const x of [-1, 1]) k.box("bench-leg", [x, 0.23, z], [0.12, 0.46, 0.24]);
    }
  } else if (part === "barrel") k.attach(createMedievalContainerModel("barrel", "closed"), [3, 0, 0.5]);
  else if (part === "sign") {
    k.beam("inn-sign-arm", [2, 3, -0.3], [2, 3, 1], 0.08, "iron");
    k.box("inn-signboard", [2, 2.55, 1], [0.75, 0.65, 0.09], "wood");
    k.ring("inn-sign-symbol", [2, 2.55, 1.06], 0.18, 0.035, "straw", true);
  } else if (part === "service-wing" && large) k.hall(6, 2, 3, 5, 4.6, 1.5, { storeys: 2 });
  else if (part === "gate" && large) {
    k.fence([-4.3, 5.2], [-1.5, 5.2]);
    k.fence([1.5, 5.2], [4.3, 5.2]);
  }
  return k.finish();
}

/** Structural parts are self-contained; furnishings keep their tables, benches and cups together. */
export function innPartFactories(
  kind: InnKind,
  quality: "low" | "high" = "low",
  preset: InnPreset = "standard"
): ModelPartFactory[] {
  if (!INN_PRESETS.some(entry => entry.id === preset)) throw new Error(`Unknown inn preset: ${preset}`);
  const large = kind === "courtyard-hostelry";
  const roles: InnPart[] = [
    "courtyard",
    "lodging",
    "stable",
    ...(large ? ["service-wing" as const] : []),
    "yard-furniture",
    "barrel",
    "sign",
    ...(large ? ["gate" as const] : [])
  ];
  return roles
    .filter(
      role =>
        preset === "standard" ||
        (preset === "unfurnished"
          ? !["yard-furniture", "barrel"].includes(role)
          : ["lodging", "courtyard", "sign", "gate"].includes(role))
    )
    .map(role => ({
      id: `${kind}:${role}`,
      role,
      // This shared prop has one registered default edition, treated as Low rather than an Inn High asset.
      quality: role === "barrel" ? "low" : quality,
      author: DEFAULT_AUTHOR,
      ...(role === "barrel" ? { basedOn: [variantId("container.barrel-closed", "default", DEFAULT_AUTHOR)] } : {}),
      create: () => (quality === "high" ? createHighInnComponent(kind, role) : createLowInnComponent(kind, role))
    }));
}

export function assembleInnParts(name: string, parts: readonly ModelPartFactory[]) {
  const model = createModelAssembly(name, parts);
  return parts.some(part => part.quality === "high") ? compactModel(model, { mergeEquivalentMaterials: true }) : model;
}

export const createLowInn = (kind: InnKind) =>
  assembleInnParts(kind === "courtyard-hostelry" ? "courtyard-inn" : kind, innPartFactories(kind));
export const createHighInn = (kind: InnKind) => assembleInnParts(`${kind}-high`, innPartFactories(kind, "high"));
