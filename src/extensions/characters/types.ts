import type { Character, Dynasty } from "./characterTypes";

declare module "../../types/PackedGraph" {
  interface PackedGraph {
    characters: Character[];
    /** Lightweight house/lineage table — see docs/plan/characters/backstory-profile.md Phase E. */
    dynasties?: Dynasty[];
  }
}
