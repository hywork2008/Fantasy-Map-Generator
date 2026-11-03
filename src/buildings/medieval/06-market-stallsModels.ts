import * as THREE from "three";
import { axisBoxFromBounds, footprintBox } from "../placementContract";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { isMarketPalette, MARKET_PALETTE_OPTIONS } from "./marketAppearance";
import { createHighGoodsBooth, createHighProduceStall } from "./marketDetails";
import { createMarketFoodStall, MARKET_FOOD_IDS } from "./marketFoodDetails";
import { createClosedMarketBooth, createDistantMarket, packedMarketPitch } from "./marketPresentation";
import { type MedievalModel, ModelKit } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "market-produce-stall",
    name: "Produce stall with cloth awning",
    task: 6,
    size: [5, 5, 4],
    note: "Braced demountable stall, alternating linen awning panels, display counter, loose produce and a loaded wicker basket.",
    create() {
      const k = new ModelKit("market-produce-stall");
      for (const z of [-1.3, 1.3]) {
        const height = 2.9 - Math.tan(0.12) * z;
        for (const x of [-1.8, 1.8]) k.box("stall-post", [x, height / 2, z], [0.12, height, 0.12]);
        k.box("awning-support-rail", [0, height - 0.06, z], [3.72, 0.12, 0.12]);
      }
      for (let i = 0; i < 6; i++) {
        const awning = k.box("awning-panel", [-1.7 + i * 0.68, 2.9, 0], [0.68, 0.045, 3.5], i % 2 ? "white" : "cloth");
        awning.rotation.x = 0.12;
      }
      k.table(0, 1, 3.8, 0.9, 0.9);
      for (let i = 0; i < 12; i++)
        k.sphere(
          "market-produce",
          [-1.45 + (i % 6) * 0.55, 1.05, 0.8 + Math.floor(i / 6) * 0.3],
          [0.15, 0.14, 0.13],
          i % 2 ? "straw" : "green"
        );
      k.attach(createMedievalContainerModel("basket", "loaded"), [-0.9, 0, -0.2]);
      k.beam("stall-cross-brace", [-1.8, 2, -1.3], [-1, 2.8, -1.3], 0.1);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "market-goods-booth",
    name: "Covered cloth and goods booth",
    task: 6,
    size: [5, 5, 4],
    note: "Market booth with folded textiles, hanging fabric, a pitched canvas cover, a timber counter and a closed stock crate.",
    create() {
      const k = new ModelKit("market-goods-booth");
      k.hall(0, 0, 3.8, 2.8, 2.5, 0.65, { open: true, roof: "cloth" });
      k.table(0, 1, 3.2, 0.8, 0.85);
      for (let i = 0; i < 5; i++)
        k.box("folded-cloth", [-1 + i * 0.5, 0.98 + (i % 2) * 0.08, 1], [0.45, 0.15, 0.5], i % 2 ? "white" : "cloth");
      k.box("hanging-textile", [0, 1.9, -1.3], [1.6, 1, 0.03], "cloth");
      k.attach(createMedievalContainerModel("crate", "closed"), [1, 0, -0.6]);
      return k.finish();
    }
  }
];

const foodNames = {
  "market-fish-table": "Fish on an open trestle table",
  "market-fish-booth": "Timber fish booth",
  "market-bread-stall": "Bread stall with linen awning",
  "market-grain-table": "Grain and cheese table"
};
const foodNotes = {
  "market-fish-table":
    "Open trestle counter with whole fish on shallow wooden trays, a stock barrel and a water tub. Illustrative late medieval European sale pitch, not a measured reconstruction. The customer side faces local +Z.",
  "market-fish-booth":
    "Braced plank-roof shelter with a rear doorway, a raised shutter, fish trays, a stock barrel and a water tub. Illustrative freestanding timber booth; the customer side faces local +Z.",
  "market-bread-stall":
    "Demountable linen awning over round loaves on a cloth-covered counter, with a tied sack and a low stock board. Optional muted palettes are art direction, not historical regional uniforms. The customer side faces local +Z.",
  "market-grain-table":
    "Open trestle counter with two bins of dry goods, cheese wheels, a wooden measure and a tied sack. Illustrative late medieval sale pitch; the customer side faces local +Z."
};
for (const id of MARKET_FOOD_IDS)
  models.push({
    author: "Codex GPT-6.1 Sol",
    id,
    name: foodNames[id],
    task: 6,
    size: [5, 5, 4],
    note: foodNotes[id],
    create: () => createMarketFoodStall(id, "low"),
    appearances: {
      default: "ochre",
      options: MARKET_PALETTE_OPTIONS,
      create: (variantId, palette) =>
        createMarketFoodStall(
          id,
          variantId.includes("@high#") ? "high" : "low",
          isMarketPalette(palette) ? palette : "ochre"
        )
    }
  });

registerHighVariants(models, {
  "market-produce-stall": createHighProduceStall,
  "market-goods-booth": createHighGoodsBooth,
  ...Object.fromEntries(MARKET_FOOD_IDS.map(id => [id, () => createMarketFoodStall(id, "high")]))
});

for (const model of models)
  model.marketDisplay = {
    create(variantId, palette, activity, detail) {
      const variant = model.variants!.find(v => v.id === variantId) ?? model.variants!.at(-1)!;
      const color = isMarketPalette(palette) ? palette : "ochre";
      if (packedMarketPitch(model.id, activity)) return new ModelKit(`${model.id}-packed`).finish();
      if (detail === "distant") {
        const source = variant.create();
        try {
          return createDistantMarket(
            model.id,
            footprintBox(axisBoxFromBounds(new THREE.Box3().setFromObject(source.group, true))),
            color,
            activity
          );
        } finally {
          source.dispose();
        }
      }
      if (activity === "closed") return createClosedMarketBooth(variant.level === "high" ? "high" : "low", color);
      return model.appearances ? model.appearances.create(variant.id, color) : variant.create();
    }
  };
