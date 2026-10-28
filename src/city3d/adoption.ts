import type { TreeSpecies } from "../buildings/landscape/trees";
import { TREE_VARIANTS, treeFamily, treeLevel } from "../buildings/landscape/treeVariants";
import type { ModelVariantInfo } from "../buildings/modelVariants";
import { familyVariants } from "../buildings/variants";

export interface Adoption {
  variant: string;
  since: string;
  note?: string;
}

/**
 * The developer's choice of BV variant for each family and level CE draws. Only levels with
 * competing variants need an entry; a level with a single variant adopts it implicitly.
 */
export const CE_ADOPTION: Record<string, Record<string, Adoption>> = {
  "tree.garden-parkland": {
    medium: {
      variant: "tree.garden-parkland@medium#claude-opus-5.5",
      since: "2026-10-29",
      note: "Matches the high-tier silhouette with fewer triangles (2,446 to 1,888)"
    }
  },
  "tree.sacred-yew": {
    medium: {
      variant: "tree.sacred-yew@medium#claude-opus-5.5",
      since: "2026-10-29",
      note: "Matches the high-tier silhouette with fewer triangles (2,446 to 1,827)"
    }
  },
  "ship.galleon": {
    default: {
      variant: "ship.galleon@default#codex-gpt-6.1-sol",
      since: "2026-10-29",
      note: "Recorded as found. CE sizes ships by the hull-topsides mesh, which the Opus galleon does not name"
    }
  },
  ...Object.fromEntries(
    ["town-curtain-wall", "town-mural-tower", "town-gate"].map(study => [
      `town-wall.${study}`,
      {
        default: {
          variant: `town-wall.${study}@default#codex-gpt-6.1-sol`,
          since: "2026-10-29",
          note: "Recorded as found. CE's circuit parts are cut from the Codex studies; Grok's are BV-only"
        }
      }
    ])
  )
};

/** The variant CE draws for a family and level. Throws when competing variants have no adoption. */
export function adopt<V extends ModelVariantInfo>(variants: readonly V[], family: string, level: string): V {
  const candidates = variants.filter(variant => variant.family === family && variant.level === level);
  const chosen = CE_ADOPTION[family]?.[level]?.variant;
  if (chosen) {
    const variant = candidates.find(candidate => candidate.id === chosen);
    if (variant) return variant;
    throw new Error(`Adopted variant ${chosen} is not registered`);
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error(`${family}@${level} has ${candidates.length} variants and no CE adoption`);
}

export function adoptedVariant(family: string, level: string): ModelVariantInfo {
  return adopt(familyVariants(family), family, level);
}

export function adoptedTree(species: TreeSpecies, quality = "ultra") {
  return adopt(TREE_VARIANTS, treeFamily(species), treeLevel(species, quality));
}
