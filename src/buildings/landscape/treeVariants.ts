import type { Author } from "../authors";
import { type ModelCredit, type ModelVariant, variantId } from "../modelVariants";
import { createNorwaySpruceOpus } from "./norwaySpruceOpus";
import { createSmallLeavedLimeOpus } from "./smallLeavedLimeOpus";
import { createTemperateTreeCodexMedium } from "./temperateTreeCodexMedium";
import { TREE_QUALITIES } from "./treeQuality";
import { createLandscapeTree, hasTreeQualityLevels, TREE_SPECIES, type TreeSpecies } from "./trees";

/** Author of each species' model; reduced tiers credit their own authors below. */
export const TREE_AUTHORS: Record<TreeSpecies, Author> = {
  european_beech: "Codex GPT-6.1 Sol",
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
  // Historical comparison models are explicit overrides, never a fallback for a new species.
  const comparisonMedium = COMPARISON_MEDIUM[species];
  const author = TREE_AUTHORS[species];
  const boreal = species === "norway_spruce" || species === "silver_birch";
  const conifer = species === "western_red_cedar" || species === "silver_fir";
  const arid = species === "date_palm" || species === "umbrella_thorn";
  const dryland = species === "saxaul" || species === "tamarisk" || species === "olive";
  const tropical = species === "kapok" || species === "red_mangrove";
  const upland = species === "black_alder" || species === "rowan" || species === "canary_pine";
  const garden =
    species === "mediterranean_cypress" ||
    species === "oriental_evergreen" ||
    species === "sacred_bodhi_and_fig" ||
    species === "peaceful_willow";
  const expanded = conifer || arid || dryland || tropical || upland || garden;
  const variants: ModelVariant[] = TREE_QUALITIES.map(level => {
    const levelAuthor = expanded && level !== "ultra" ? "Codex GPT-6.1 Sol" : author;
    return {
      id: variantId(family, level, levelAuthor),
      family,
      level,
      author: levelAuthor,
      ...(boreal && level !== "ultra" ? { basedOn: [variantId(family, "ultra", author)] } : {}),
      ...(expanded && level !== "ultra"
        ? {
            basedOn: [
              variantId(family, level === "high" ? "ultra" : "high", level === "high" ? author : "Codex GPT-6.1 Sol")
            ]
          }
        : {}),
      credits: expanded
        ? [
            {
              author: levelAuthor,
              date: "2026-10-29",
              note:
                level === "ultra"
                  ? "Existing Opus default geometry retained as the ultra reference"
                  : level === "high"
                    ? "Reduced sprays on the original Opus branch skeleton, preserving its random sequence"
                    : arid && level === "low"
                      ? "Original curved palm frond ribbons or fitted flat umbrella canopy; reduced trunk tessellation"
                      : "Fitted high-tier foliage vertices; shared canopy-envelope normals, vertex AO, tint variation and hidden-face removal"
            }
          ]
        : boreal
          ? [
              {
                author,
                date: "2026-10-29",
                note:
                  level === "ultra"
                    ? "Existing default model retained as the detailed reference"
                    : level === "high"
                      ? "Reduced foliage on the unchanged ultra branch skeleton"
                      : level === "medium"
                        ? "Whorled needle sprays or fitted pendulous leaf lobes on structural limbs"
                        : "Species-specific whorled or white-barked distant silhouette"
              }
            ]
          : species === "european_beech"
            ? [
                {
                  author,
                  date: "2026-10-29",
                  note: "New Fagus sylvatica: smooth grey bole, ascending limbs, oval folded leaves and fitted foliage tiers; illustrative woodland dimensions"
                }
              ]
            : comparisonMedium && level === "low"
              ? [
                  { ...TIERS_ADDED, note: "Seven-lobe canopy silhouette" },
                  {
                    author: "Claude Opus 5.5",
                    date: "2026-10-29",
                    note: "Crown-envelope normals, interior occlusion and leaf speckle; geometry unchanged",
                    commit: "eb36c33b8"
                  },
                  {
                    author: "Codex GPT-6.1 Sol",
                    date: "2026-10-29",
                    note: "Spread the seven crown lobes into a broad lower whorl and two leaders to match high-tier dimensions"
                  }
                ]
              : comparisonMedium && level === "medium"
                ? [{ ...TIERS_ADDED, note: "Twenty-four independent lobes on short branches" }]
                : undefined,
      create: () => (level === "medium" && comparisonMedium ? comparisonMedium() : createLandscapeTree(species, level))
    };
  });
  const high = variantId(family, "high", "Codex GPT-6.1 Sol");
  if (comparisonMedium)
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
        },
        {
          author: "Codex GPT-6.1 Sol",
          date: "2026-10-29",
          note: "Calibrated lime lobe coverage; fitted yew lobes to the four high-tier fans with horizontal orientation, preserving Opus authorship and adoption"
        }
      ],
      create: () => createLandscapeTree(species, "medium")
    });
  if (species === "norway_spruce") {
    const opusHigh = variantId(family, "high", "Claude Opus 5.5");
    variants.splice(
      variants.findIndex(variant => variant.level === "ultra"),
      0,
      {
        id: opusHigh,
        family,
        level: "high",
        author: "Claude Opus 5.5",
        credits: [
          {
            author: "Claude Opus 5.5",
            date: "2026-10-29",
            note: "Rebuilt from the tree itself: whorled and interwhorl limbs that dip and turn up, needles only on their outer part as fringed sprays with hanging comb branchlets (comb spruce), a needled spire, cones and dead lower stubs"
          }
        ],
        create: () => createNorwaySpruceOpus("comb")
      },
      ...(
        [
          ["brush", "Brush spruce: limbs climb from the stem, short sparse branchlets, narrower crown"],
          [
            "plate",
            "Plate spruce of boreal and high-montane stands: limbs 15-45 degrees above horizontal, flat sprays, no hanging branchlets, narrow snow-shedding crown"
          ]
        ] as const
      ).map(([form, note]) => ({
        id: variantId(family, "high", "Claude Opus 5.5", form),
        family,
        level: "high" as const,
        author: "Claude Opus 5.5" as const,
        edition: form,
        basedOn: [opusHigh],
        credits: [{ author: "Claude Opus 5.5" as const, date: "2026-10-29", note }],
        create: () => createNorwaySpruceOpus(form)
      }))
    );
    const opusPlate = variantId(family, "high", "Claude Opus 5.5", "plate");
    variants.unshift(
      {
        id: variantId(family, "low", "Claude Opus 5.5", "plate"),
        family,
        level: "low",
        author: "Claude Opus 5.5",
        edition: "plate",
        basedOn: [opusPlate],
        credits: [
          {
            author: "Claude Opus 5.5",
            date: "2026-10-29",
            note: "Plate-spruce silhouette: eight open cones whose star-shaped rims follow the climbing limb tips"
          }
        ],
        create: () => createNorwaySpruceOpus("plate", "low")
      },
      {
        id: variantId(family, "medium", "Claude Opus 5.5", "plate"),
        family,
        level: "medium",
        author: "Claude Opus 5.5",
        edition: "plate",
        basedOn: [opusPlate],
        credits: [
          {
            author: "Claude Opus 5.5",
            date: "2026-10-29",
            note: "The plate-spruce high tier on its own whorls with one fringe tooth per segment, no interwhorl limbs, limb wood, cones or dead stubs"
          }
        ],
        create: () => createNorwaySpruceOpus("plate", "medium")
      }
    );
    variants.push({
      id: variantId(family, "ultra", "Claude Opus 5.5", "plate"),
      family,
      level: "ultra",
      author: "Claude Opus 5.5",
      edition: "plate",
      basedOn: [opusPlate],
      credits: [
        {
          author: "Claude Opus 5.5",
          date: "2026-10-29",
          note: "Plate spruce at full detail: finer fringed sprays, second-order shoots fanned in each limb's plane, a fourth interwhorl limb, rounder wood and more cones"
        }
      ],
      create: () => createNorwaySpruceOpus("plate", "ultra")
    });
  }
  if (species === "garden_parkland") {
    const opusHigh = variantId(family, "high", "Claude Opus 5.5");
    variants.splice(
      variants.findIndex(variant => variant.level === "ultra"),
      0,
      {
        id: opusHigh,
        family,
        level: "high",
        author: "Claude Opus 5.5",
        credits: [
          {
            author: "Claude Opus 5.5",
            date: "2026-10-29",
            note: "Own open-grown skeleton: ascending limbs to a two-layer ovoid leaf shell, outward-facing cordate leaves, sun and shade leaf colours, crown-envelope normals"
          }
        ],
        create: () => createSmallLeavedLimeOpus("standard")
      },
      {
        id: variantId(family, "high", "Claude Opus 5.5", "light"),
        family,
        level: "high",
        author: "Claude Opus 5.5",
        edition: "light",
        basedOn: [opusHigh],
        credits: [
          {
            author: "Claude Opus 5.5",
            date: "2026-10-29",
            note: "The Opus medium treatment applied to the Opus high tier: one fitted lobe per leaf spray on the same limbs"
          }
        ],
        create: () => createSmallLeavedLimeOpus("light")
      }
    );
  }
  return variants;
}

const COMPARISON_MEDIUM: Partial<Record<TreeSpecies, () => ReturnType<typeof createLandscapeTree>>> = {
  garden_parkland: () => createTemperateTreeCodexMedium("lime"),
  sacred_yew: () => createTemperateTreeCodexMedium("yew")
};

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
