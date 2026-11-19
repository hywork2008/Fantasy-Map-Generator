import type * as THREE from "three";
import type { TreeSpecies } from "../buildings/landscape/trees";
import { TREE_VARIANTS, treeFamily, treeLevel } from "../buildings/landscape/treeVariants";
import { MEDIEVAL_VARIANTS, medievalFamily } from "../buildings/medieval/medievalVariants";
import type { MedievalModel } from "../buildings/medieval/modelKit";
import { WORKHOME_TRADE_COMBINATIONS } from "../buildings/medieval/workhomeTradeProfiles";
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
    low: {
      variant: "ship.galleon@low#codex-gpt-6.1-sol",
      since: "2026-11-03",
      note: "Explicit Low tier; CE ships still request the compatibility default"
    },
    high: {
      variant: "ship.galleon@high#codex-gpt-6.1-sol",
      since: "2026-11-03",
      note: "Codex High candidate; existing CE placement still requests default"
    },
    default: {
      variant: "ship.galleon@default#codex-gpt-6.1-sol",
      since: "2026-10-29",
      note: "Recorded as found. CE sizes ships by the hull-topsides mesh, which the Opus galleon does not name"
    }
  },
  ...Object.fromEntries(
    [
      "dedicated-butchery",
      "dedicated-chandlery",
      "dedicated-metalwares",
      "dedicated-fishmongery",
      "dedicated-cutlery",
      "dedicated-lime-tile-yard",
      "dedicated-glaziers-workshop"
    ].map(trade => [
      `medieval.trade-workshop.${trade}`,
      Object.fromEntries(
        (["low", "high"] as const).map(level => [
          level,
          {
            variant: `medieval.trade-workshop.${trade}@${level}#claude-opus-5.5`,
            since: "2026-11-12",
            note: "Opus fourteenth-century town-trade plot; the Codex block study failed the grounding and envelope contract"
          }
        ])
      )
    ])
  ),
  // The Opus smithy after Newington (docs/plan/ce-outskirts-workshop-sizes.md S2), on its smaller 10 x 8 m envelope.
  "medieval.trade-workshop.dedicated-smithy": Object.fromEntries(
    (["low", "high"] as const).map(level => [
      level,
      {
        variant: `medieval.trade-workshop.dedicated-smithy@${level}#claude-opus-5.5`,
        since: "2026-11-19",
        note: "Opus open-fronted smithy with two hearths at right angles, anvil on stone, trough and fuel store; 10 x 8 m"
      }
    ])
  ),
  // The Opus ropewalk rebuilt from the rope-makers' trade (docs/plan/opus-ropewalk.md), on the earlier plot.
  "medieval.trade-workshop.dedicated-ropewalk": Object.fromEntries(
    (["low", "high"] as const).map(level => [
      level,
      {
        variant: `medieval.trade-workshop.dedicated-ropewalk@${level}#claude-opus-5.5`,
        since: "2026-11-19",
        note: "Opus hand ropewalk with hemp house, wheel, tackle-board, stakes and traveller; same 6 x 54 m plot and door"
      }
    ])
  ),
  // The Opus shop-house (docs/plan/bv-workhome-facade-variation.md W3). A placement saved before it keeps the Codex
  // study it was sized on (placementDefinition's "codex" presentation).
  ...Object.fromEntries(
    WORKHOME_TRADE_COMBINATIONS.map(({ role, form }) => [
      `medieval.trade-workhome.workhome-${form}.${role}`,
      Object.fromEntries(
        (["low", "high"] as const).map(level => [
          level,
          {
            variant: `medieval.trade-workhome.workhome-${form}.${role}@${level}#claude-opus-5.5`,
            since: "2026-11-18",
            note: "Opus street-front shop-house on the Codex envelope; the Codex interior ledger is not drawn"
          }
        ])
      )
    ])
  ),
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
  ),
  "ship.ship-of-the-line": {
    high: {
      variant: "ship.ship-of-the-line@high#grok-4.7",
      since: "2026-11-19",
      note: "Claude Opus 5.5 High and Low are BV comparison editions. CE keeps the Grok 4.7 High it was sized on."
    }
  },
  "ship.trireme": {
    high: {
      variant: "ship.trireme@high#grok-4.7",
      since: "2026-11-19",
      note: "Claude Opus 5.5 High and Low are BV comparison editions. CE keeps the Grok 4.7 High it was sized on."
    }
  },
  "medieval.harbor-treadwheel-crane": {
    high: {
      variant: "medieval.harbor-treadwheel-crane@high#codex-gpt-6.1-sol",
      since: "2026-11-15",
      note: "Grok 4.7 High is a BV comparison edition. CE keeps the Codex High and its cargo-quay dimensions."
    }
  }
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
