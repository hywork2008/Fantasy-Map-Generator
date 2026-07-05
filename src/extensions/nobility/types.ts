import type { Character } from "./generators/characters-generator";

declare module "../../types/PackedGraph" {
  interface PackedGraph {
    characters: Character[];
  }
}

declare module "../../types/models" {
  interface State {
    /** Denormalized pointer to the primary ruling Character.i, for O(1) lookup. */
    rulerId?: number;
  }
}
