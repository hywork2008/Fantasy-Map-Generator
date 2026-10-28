import type { Author } from "../authors";
import { type ModelCredit, type ModelVariant, variantId } from "../modelVariants";
import { createTemperateTreeCodexMedium } from "./temperateTreeCodexMedium";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, hasTreeQualityLevels, TREE_SPECIES, type TreeSpecies } from "./trees";

/** Author of each species' model; reduced tiers credit their own authors below. */
export const TREE_AUTHORS: Record<TreeSpecies, Author> = {
  garden_parkland: "Codex GPT-6.1 Sol",
  norway_spruce: "Codex GPT-6.1 Sol",
  silver_birch: "Codex GPT-6.1 Sol",
  sacred_yew: "Codex GPT-6.1 Sol",
  date_palm: "Claude Opus 5.5",
  umbrella_thorn: "Claude Opus 5.5",
  saxaul: "Claude Opus 5.5",
  kapok: "Claude Opus 5.5",
  western_red_cedar: "Claude Opus 5.5",
  black_alder: "Claude Opus 5.5",
  olive: "Claude Opus 5.5",
  silver_fir: "Claude Opus 5.5",
  red_mangrove: "Claude Opus 5.5",
  tamarisk: "Claude Opus 5.5",
  rowan: "Claude Opus 5.5",
  canary_pine: "Claude Opus 5.5",
  mediterranean_cypress: "Claude Opus 5.5",
  oriental_evergreen: "Claude Opus 5.5",
  sacred_bodhi_and_fig: "Claude Opus 5.5",
  peaceful_willow: "Claude Opus 5.5"
};

export function treeFamily(species: TreeSpecies): string {
  return `tree.${species.replaceAll("_", "-")}`;
}

/** Level key for CE requests: species without tiers ship one model. */
export function treeLevel(species: TreeSpecies, quality: string): string {
  return hasTreeQualityLevels(species) ? quality : "default";
}

const TIERS_ADDED: ModelCredit = {
  author: "Codex GPT-6.1 Sol",
  date: "2026-10-29",
  note: "Four quality tiers",
  commit: "45e24d51d"
};

function tieredVariants(species: TreeSpecies): ModelVariant[] {
  const family = treeFamily(species);
  const lod = species === "garden_parkland" ? "lime" : "yew";
  const variants: ModelVariant[] = TREE_QUALITIES.map(level => ({
    id: variantId(family, level, "Codex GPT-6.1 Sol"),
    family,
    level,
    author: "Codex GPT-6.1 Sol",
    credits:
      level === "low"
        ? [
            { ...TIERS_ADDED, note: "Seven-lobe canopy silhouette" },
            {
              author: "Claude Opus 5.5",
              date: "2026-10-29",
              note: "Crown-envelope normals, interior occlusion and leaf speckle; geometry unchanged",
              commit: "eb36c33b8"
            }
          ]
        : level === "medium"
          ? [{ ...TIERS_ADDED, note: "Twenty-four independent lobes on short branches" }]
          : undefined,
    create: () => (level === "medium" ? createTemperateTreeCodexMedium(lod) : createLandscapeTree(species, level))
  }));
  const high = variantId(family, "high", "Codex GPT-6.1 Sol");
  variants.splice(2, 0, {
    id: variantId(family, "medium", "Claude Opus 5.5"),
    family,
    level: "medium",
    author: "Claude Opus 5.5",
    basedOn: [high],
    credits: [
      {
        author: "Claude Opus 5.5",
        date: "2026-10-29",
        note: "One fitted lobe per high-tier leaf spray on the high-tier branches, with the low tier's shading",
        commit: "eb36c33b8"
      }
    ],
    create: () => createLandscapeTree(species, "medium")
  });
  return variants;
}

export const TREE_VARIANTS: readonly ModelVariant[] = TREE_SPECIES.flatMap(species =>
  hasTreeQualityLevels(species)
    ? tieredVariants(species)
    : [
        {
          id: variantId(treeFamily(species), "default", TREE_AUTHORS[species]),
          family: treeFamily(species),
          level: "default",
          author: TREE_AUTHORS[species],
          create: () => createLandscapeTree(species)
        }
      ]
);
