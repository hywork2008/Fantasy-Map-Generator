import type * as THREE from "three";
import type { CityStructureMeshes } from "../city3d/three/structureMeshes";
import { type Author, authorSlug } from "./authors";

/** One piece of work on a variant, oldest first. */
export interface ModelCredit {
  author: Author;
  date: string;
  note: string;
  commit?: string;
}

/**
 * One author's implementation of one quality level of a model family. CE picks among variants
 * through its adoption table; BV shows all of them.
 */
export interface ModelVariant<Args extends unknown[] = []> {
  /** `${family}@${level}#${author slug}` plus `~${edition}` for editions, unique across BV. */
  id: string;
  family: string;
  /** Quality level within the family; "default" for families that ship a single level. */
  level: string;
  author: Author;
  /** Distinguishes one author's alternatives at the same level, e.g. a light edition; absent for the standard one. */
  edition?: string;
  /** Variants whose code this one reuses, e.g. a reduced tier built on a higher tier's skeleton. */
  basedOn?: readonly string[];
  credits?: readonly ModelCredit[];
  /** Family-specific parameters, e.g. a town wall's appearance profile. */
  create(...args: Args): CityStructureMeshes;
  /** Single vertex-colored geometry for CE prototypes, when the family offers one. */
  createGeometry?(...args: Args): THREE.BufferGeometry;
}

/** A variant without its factory: what listings, BV labels and adoption checks need. */
export type ModelVariantInfo = Omit<ModelVariant, "create" | "createGeometry">;

export function variantId(family: string, level: string, author: Author, edition?: string): string {
  return `${family}@${level}#${authorSlug(author)}${edition ? `~${edition}` : ""}`;
}
