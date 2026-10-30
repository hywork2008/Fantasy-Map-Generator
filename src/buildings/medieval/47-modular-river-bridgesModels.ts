import { createModularBridge, MODULAR_BRIDGE } from "../bridges/modularBridge";
import { createSuspensionBridge, SUSPENSION_BRIDGE, type SuspensionBridgeSpec } from "../bridges/suspensionBridge";
import { SUSPENSION_BRIDGE_VARIANTS } from "../siteVariants";
import type { MedievalModel } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "modular-stone-arch-bridge",
    name: "Modular stone arch bridge · 96 m",
    task: 47,
    author: "Codex GPT-6.1 Sol",
    size: [98, 10, 12],
    note: MODULAR_BRIDGE.note,
    create: () => createModularBridge({ material: "stone", length: 96, width: 6, deckHeight: 8, waterHeight: 2 })
  },
  {
    id: "modular-stone-arch-bridge-long",
    name: "Modular stone arch bridge · 600 m",
    task: 47,
    author: "Codex GPT-6.1 Sol",
    size: [602, 10, 12],
    note: `Fifty repeated masonry bays share the same geometry and material buffers. ${MODULAR_BRIDGE.note}`,
    create: () => createModularBridge({ material: "stone", length: 600, width: 6, deckHeight: 8, waterHeight: 2 })
  },
  {
    id: "modular-timber-trestle-bridge",
    name: "Modular timber trestle bridge · 72 m",
    task: 47,
    author: "Codex GPT-6.1 Sol",
    size: [74, 10, 12],
    note: MODULAR_BRIDGE.note,
    create: () => createModularBridge({ material: "timber", length: 72, width: 5, deckHeight: 7, waterHeight: 2 })
  },
  {
    id: "modular-lifting-river-bridge",
    name: "Modular river bridge with lifting span · 96 m",
    task: 47,
    author: "Codex GPT-6.1 Sol",
    size: [98, 10, 12],
    note: `The navigation opening has no intermediate pier. Double lifting leaves and their gear are shown closed. ${MODULAR_BRIDGE.note}`,
    create: () =>
      createModularBridge({
        material: "stone",
        length: 96,
        width: 6,
        deckHeight: 8,
        waterHeight: 2,
        movableOpeningMeters: 12
      })
  },
  ...(
    [
      { length: 48, width: 2.6, id: "timber-rope-suspension-bridge", label: "Footbridge" },
      { length: 96, width: 3.4, id: "timber-rope-suspension-bridge-long", label: "Packhorse bridge" }
    ] as const
  ).map(preview => {
    const spec: SuspensionBridgeSpec = {
      length: preview.length,
      width: preview.width,
      deckHeight: 2,
      waterHeight: -18
    };
    return {
      id: preview.id,
      name: `Rope suspension bridge · ${preview.label} · ${preview.length} m`,
      task: 47,
      author: SUSPENSION_BRIDGE.author,
      size: [preview.length + 18, preview.width + 2, 14] as const,
      note: `${SUSPENSION_BRIDGE.note} Preview: bridge deck 20 m above the water datum.`,
      variants: SUSPENSION_BRIDGE_VARIANTS.map(variant => ({
        ...variant,
        label: variant.level === "high" ? "High" : "Low",
        createGeometry: undefined,
        create: () => variant.create(spec)
      })),
      create: () => createSuspensionBridge(spec)
    };
  })
];
