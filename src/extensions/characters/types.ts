import type { Character } from "./characterTypes";

declare module "../../types/PackedGraph" {
  interface PackedGraph {
    characters: Character[];
  }
}
