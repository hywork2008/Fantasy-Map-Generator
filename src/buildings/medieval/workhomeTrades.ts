import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { ModelKit, type Surface } from "./modelKit";
import { addTextileLoom, shears } from "./textileWorkshopDetails";
import { WORKHOME_FORMS, type WorkhomeForm, type WorkhomeQuality, workhomeShellParts } from "./workhomeShell";
import { type WorkhomeRole, workhomeTradeProfile } from "./workhomeTradeProfiles";
import { addCraftBench } from "./workshopDetailKit";

export {
  tradeDefinition,
  WORKHOME_TRADE_COMBINATIONS,
  WORKHOME_TRADES,
  type WorkhomeRole,
  type WorkhomeTrade,
  workhomeTradeProfile
} from "./workhomeTradeProfiles";

function bench(k: ModelKit, x: number, z: number, length: number, name: string, rotate = true) {
  const kit = new ModelKit(name);
  addCraftBench(kit, 0, 0, length, 0.55, 0.8);
  const model = kit.finish();
  if (rotate) model.group.rotation.y = Math.PI / 2;
  k.attach(model, [x, 0.15, z]);
}
function equipment(role: WorkhomeRole, form: WorkhomeForm, quality: WorkhomeQuality) {
  const p = WORKHOME_FORMS[form],
    left = p.workZoneXZ[0],
    x = left + 0.275,
    k = new ModelKit(`${role}-workhome-equipment`),
    high = quality === "high";
  if (role === "weaving") {
    const kit = new ModelKit("reused-textile-loom");
    addTextileLoom(kit, quality);
    k.attach(kit.finish(), [-1.6, 0.15, -0.15]);
    bench(k, -1.6, -2.3, 2.4, "cloth-preparation-bench", false);
    for (const xx of [-2.25, -0.95]) k.box("preparation-cloth", [xx, 0.98, -2.3], [0.55, 0.025, 0.4], "cloth");
  } else {
    bench(k, x, 0, role === "bowyery" ? 3.8 : 2.4, `${role}-bench`);
    if (["tailoring", "furriery", "leatherGoods", "saddlery"].includes(role)) {
      k.box(
        role === "tailoring" ? "cut-cloth" : "dry-cutting-hide",
        [x, 0.975, -0.35],
        [0.48, 0.025, 1.1],
        role === "tailoring" ? "cloth" : "leather"
      );
      if (high) {
        const tool = new ModelKit("reused-spring-shears");
        shears(tool, 0, 0, 0);
        const m = tool.finish();
        m.group.rotation.y = Math.PI / 2;
        k.attach(m, [x, 1.02, 0.4]);
      }
      for (const z of [-0.8, 0, 0.8]) {
        k.box("stitching-thread", [x, 1.01, z], [0.1, 0.08, 0.1], "white");
        if (high) k.beam("sewing-awl", [x - 0.1, 1.025, z], [x + 0.1, 1.025, z], 0.015, "iron");
      }
    }
    if (role === "shoemaking")
      for (const z of [-0.8, 0, 0.8]) {
        k.sphere("wooden-shoe-last", [x, 0.995, z], [0.12, 0.08, 0.25], "wood");
        k.box("shoe-sole", [x, 0.965, z], [0.2, 0.025, 0.45], "leather");
        if (high) k.beam("cobbler-awl", [x - 0.15, 1.05, z - 0.18], [x + 0.15, 1.05, z - 0.18], 0.018, "iron");
      }
    if (role === "saddlery") {
      k.box("saddle-stand-foot", [-1.4, 0.21, 0], [0.55, 0.12, 0.65], "oak");
      k.box("saddle-stand-post", [-1.4, 0.65, 0], [0.15, 0.9, 0.15], "oak");
      k.box("saddle-tree", [-1.4, 1.12, 0], [0.6, 0.15, 0.6], "wood");
      for (const side of [-1, 1]) k.box("saddle-skirt", [-1.4 + side * 0.23, 0.98, 0], [0.1, 0.5, 0.55], "leather");
    }
    if (role === "goldsmithing") {
      for (const z of [-0.8, 0, 0.8]) {
        k.box("fine-metal-pad", [x, 0.98, z], [0.4, 0.04, 0.35], "stone");
        k.ring("cold-work-jewellery", [x, 1.025, z], 0.075, 0.012, "iron");
        if (high) k.beam("fine-file", [x - 0.12, 1.025, z - 0.16], [x + 0.12, 1.025, z - 0.16], 0.018, "iron");
      }
    }
    if (role === "joinery") {
      k.box("wooden-vice-jaw", [x, 0.99, -0.95], [0.45, 0.15, 0.18], "oak");
      k.beam("vice-screw", [x - 0.18, 0.98, -0.85], [x + 0.18, 0.98, -0.85], 0.045, "wood", true);
      k.box("hand-plane", [x, 1.035, 0.6], [0.18, 0.15, 0.4], "wood");
      if (high)
        for (const z of [-0.5, 0, 0.5]) k.beam("bench-chisel", [x - 0.15, 1.02, z], [x + 0.15, 1.02, z], 0.025, "iron");
    }
    if (role === "bowyery") {
      k.beam("working-bow-stave", [x, 1.01, -1.65], [x, 1.01, 1.65], 0.055, "wood");
      for (const z of [-1.2, 0, 1.2])
        for (let i = 0; i < 3; i++)
          k.beam(
            "arrow-shaft",
            [x - 0.12 + i * 0.12, 1.06, z - 0.3],
            [x - 0.12 + i * 0.12, 1.06, z + 0.3],
            0.012,
            "wood"
          );
    }
    if (role === "bookTrades") {
      const desk = k.box("writing-desk-slope", [x, 1.04, -0.7], [0.5, 0.05, 0.8], "wood");
      desk.rotation.x = 0.12;
      k.box("open-manuscript", [x, 1.1, -0.7], [0.38, 0.035, 0.45], "white");
      k.box("binding-press-bed", [x, 1.02, 0.7], [0.5, 0.12, 0.55], "wood");
      for (const z of [0.48, 0.92]) k.box("binding-press-post", [x, 1.31, z], [0.08, 0.58, 0.08], "oak");
      k.box("binding-press-crossbar", [x, 1.57, 0.7], [0.13, 0.1, 0.6], "oak");
      k.box("binding-press-platen", [x, 1.2, 0.7], [0.45, 0.08, 0.4], "wood");
      k.beam("bookbinding-screw", [x, 1.23, 0.7], [x, 1.64, 0.7], 0.055, "wood", true);
      if (high) k.beam("quill", [x - 0.12, 1.16, -0.8], [x + 0.12, 1.16, -0.5], 0.018, "white");
    }
  }
  return k.finish();
}
function stock(role: WorkhomeRole, form: WorkhomeForm, quality: WorkhomeQuality) {
  const p = WORKHOME_FORMS[form],
    x = p.workZoneXZ[0] + 0.6,
    k = new ModelKit(`${role}-stock`),
    rear = -p.depth / 2 + 0.7,
    front = p.depth / 2 - 0.4;
  // Both storage footprints stay inside the shell's explicitly deducted storage cells.
  const longStock = role === "joinery" || role === "bowyery";
  k.box("rear-stock-plinth", [longStock ? -1.6 : x, 0.25, rear], [longStock ? 3.1 : 0.95, 0.2, 0.55], "wood");
  k.box(
    "front-stock-cabinet",
    [x, role === "tailoring" ? 0.65 : 0.75, front],
    [0.95, role === "tailoring" ? 1 : 1.2, 0.35],
    "wood"
  );
  const material: Surface = ["shoemaking", "furriery", "leatherGoods", "saddlery"].includes(role)
    ? "leather"
    : role === "bookTrades"
      ? "white"
      : "cloth";
  if (role === "joinery" || role === "bowyery") {
    // Long stock lies crosswise in the wide rear storage bay, beyond the work zone.
    for (let i = 0; i < 4; i++)
      k.box(
        role === "joinery" ? "dressed-board-stock" : "bow-stave-stock",
        [-1.6, 0.42 + i * 0.09, rear],
        [3, 0.07, 0.12],
        "wood"
      );
    if (role === "joinery") {
      for (const xx of [-2.35, -0.85]) k.box("saw-rack-post", [xx, 1.1, rear], [0.1, 1.9, 0.1]);
      k.box("saw-rack-rail", [-1.6, 2.03, rear], [1.6, 0.1, 0.1]);
      for (const xx of [-2.15, -1.05]) k.box("frame-saw-upright", [xx, 1.42, rear + 0.08], [0.07, 0.8, 0.07]);
      k.beam("frame-saw-blade", [-2.15, 1.08, rear + 0.08], [-1.05, 1.08, rear + 0.08], 0.025, "iron");
      k.beam("frame-saw-stretcher", [-2.15, 1.55, rear + 0.08], [-1.05, 1.55, rear + 0.08], 0.07, "wood");
    } else
      for (let i = 0; i < 8; i++) {
        k.beam(
          "stored-arrow",
          [x - 0.35 + i * 0.1, 0.9, front + 0.18],
          [x - 0.35 + i * 0.1, 1.5, front + 0.18],
          0.012,
          "wood"
        );
        if (quality === "high")
          k.box("arrow-fletching", [x - 0.35 + i * 0.1, 1.43, front + 0.18], [0.05, 0.12, 0.025], "white");
      }
  } else if (role === "goldsmithing") {
    k.box("secure-stock-chest", [x, 0.6, rear], [0.8, 0.5, 0.45], "oak");
    k.box("chest-lock", [x, 0.6, rear + 0.235], [0.1, 0.13, 0.035], "iron");
  } else {
    for (let i = 0; i < 3; i++)
      k.box(
        role === "bookTrades" ? "book-stock" : role === "furriery" ? "dressed-fur-stock" : "material-stock",
        [x, 0.4 + i * 0.12, rear],
        [0.8, 0.1, 0.4],
        material
      );
  }
  if (role === "tailoring") {
    k.box("garment-rail", [x, 1.8, front], [0.85, 0.08, 0.08], "oak");
    for (const dx of [-0.25, 0, 0.25]) k.box("hanging-garment", [x + dx, 1.52, front], [0.2, 0.5, 0.055], "cloth");
    for (const dx of [-0.4, 0.4]) k.box("garment-rail-support", [x + dx, 0.975, front], [0.06, 1.65, 0.06]);
  }
  if (role === "shoemaking")
    for (const dx of [-0.25, 0, 0.25]) k.sphere("finished-shoe", [x + dx, 1.43, front], [0.1, 0.08, 0.15], "leather");
  if (role === "leatherGoods")
    for (const dx of [-0.25, 0, 0.25]) {
      k.box("finished-leather-bag", [x + dx, 1.46, front], [0.2, 0.18, 0.12], "leather");
      if (quality === "high") k.ring("bag-handle", [x + dx, 1.59, front], 0.055, 0.012, "leather");
    }
  return k.finish();
}
export function workhomeTradeParts(
  role: WorkhomeRole,
  form: WorkhomeForm,
  quality: WorkhomeQuality
): ModelPartFactory[] {
  workhomeTradeProfile(role, form);
  return [
    ...workhomeShellParts(form, quality),
    {
      id: `${role}:trade-equipment`,
      role: "trade-equipment",
      quality,
      author: DEFAULT_AUTHOR,
      create: () => equipment(role, form, quality)
    },
    {
      id: `${role}:trade-stock`,
      role: "trade-stock",
      quality,
      author: DEFAULT_AUTHOR,
      create: () => stock(role, form, quality)
    }
  ];
}
export function assembleWorkhomeTrade(
  role: WorkhomeRole,
  form: WorkhomeForm,
  quality: WorkhomeQuality,
  parts: readonly ModelPartFactory[] = workhomeTradeParts(role, form, quality)
) {
  const output = compactModel(createModelAssembly(`${form}-${role}-workhome-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  output.group.userData.placementSpec = workhomeTradeProfile(role, form);
  return output;
}
