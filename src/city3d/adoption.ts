import type * as THREE from "three";
import type { TreeSpecies } from "../buildings/landscape/trees";
import { TREE_VARIANTS, treeFamily, treeLevel } from "../buildings/landscape/treeVariants";
import { MEDIEVAL_VARIANTS, medievalFamily } from "../buildings/medieval/medievalVariants";
import type { MedievalModel } from "../buildings/medieval/modelKit";
import type { ModelVariant, ModelVariantInfo } from "../buildings/modelVariants";
import { familyVariants } from "../buildings/variants";
import type { BvDefinition } from "./three/bvInstances";

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
    high: {
      variant: "tree.garden-parkland@high#codex-gpt-6.1-sol",
      since: "2026-10-28",
      note: "Kept while the Opus high tier and its light edition are compared in BV"
    },
    medium: {
      variant: "tree.garden-parkland@medium#claude-opus-5.5",
      since: "2026-10-29",
      note: "Matches the high-tier silhouette with fewer triangles (2,446 to 1,888)"
    }
  },
  "tree.norway-spruce": Object.fromEntries(
    (["low", "medium", "high", "ultra"] as const).map(level => [
      level,
      {
        variant: `tree.norway-spruce@${level}#claude-opus-5.5~plate`,
        since: "2026-10-29",
        note: "Opus plate spruce of boreal and high-montane stands at every tier"
      }
    ])
  ),
  ...Object.fromEntries(
    (
      [
        ["olive", "drupes", "Stalked olives in the shared fruit layer replace the triangle markers"],
        ["date-palm", "bunches", "Branched date bunches in the shared fruit layer replace the marker axes"]
      ] as const
    ).map(([species, edition, note]) => [
      `tree.${species}`,
      Object.fromEntries(
        (["low", "medium", "high", "ultra"] as const).map(level => [
          level,
          { variant: `tree.${species}@${level}#claude-opus-5.5~${edition}`, since: "2026-10-30", note }
        ])
      )
    ])
  ),
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

/** A prototype definition that draws the adopted variant and names it for the scene's author list. */
export function adoptedDefinition<Args extends unknown[]>(
  variants: readonly ModelVariant<Args>[],
  family: string,
  id: string,
  { level = "default", args, cacheKey }: { level?: string; args?: Args; cacheKey?: string } = {}
): BvDefinition {
  const variant = adopt(variants, family, level);
  const values = (args ?? []) as Args;
  const createGeometry = variant.createGeometry;
  return {
    id,
    ...(cacheKey ? { cacheKey } : {}),
    variant: variant.id,
    create: () => variant.create(...values),
    ...(createGeometry ? { createGeometry: () => createGeometry(...values) } : {})
  };
}

const medievalDefinitions = new Map<MedievalModel, BvDefinition>();
/** Medieval task models keep their ids as CE definitions; the adopted variant supplies the geometry. */
export function medievalDefinition(model: MedievalModel): BvDefinition {
  let result = medievalDefinitions.get(model);
  if (!result) {
    result = adoptedDefinition(MEDIEVAL_VARIANTS, medievalFamily(model), model.id);
    medievalDefinitions.set(model, result);
  }
  return result;
}

/** Record that an object draws a variant, so the scene can list the authors of what it shows. */
export function markVariant(object: THREE.Object3D, variant: string): void {
  const ids: string[] = object.userData.modelVariants ?? [];
  if (!ids.includes(variant)) ids.push(variant);
  object.userData.modelVariants = ids;
}

/** Variants drawn by visible objects; empty instanced meshes do not count. */
export function sceneVariants(root: THREE.Object3D): string[] {
  const ids = new Set<string>();
  root.traverseVisible(object => {
    if ((object as THREE.InstancedMesh).isInstancedMesh && (object as THREE.InstancedMesh).count === 0) return;
    for (const id of (object.userData.modelVariants as string[] | undefined) ?? []) ids.add(id);
  });
  return [...ids].sort();
}
