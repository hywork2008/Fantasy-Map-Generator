import { type Author, DEFAULT_AUTHOR } from "../../authors";
import { compactModel } from "../../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../../modelParts";
import type { ArchitectureKit } from "../architectureKit";

export interface LandmarkComponent {
  id: string;
  build(kit: ArchitectureKit): void;
}

/** Fixed landmark coordinates: enumerate without building; construct only the selected factories. */
export function landmarkPartFactories(
  name: string,
  quality: "low" | "high",
  components: readonly LandmarkComponent[],
  createKit: () => ArchitectureKit,
  author: Author = DEFAULT_AUTHOR
): readonly ModelPartFactory[] {
  return components.map(({ id, build }) => ({
    id: `${name}:${id}`,
    role: id,
    quality,
    author,
    create() {
      const kit = createKit();
      build(kit);
      return kit.finish();
    }
  }));
}

/** Pool equivalent ordinary materials while preserving the source ledger and vertex ranges. */
export function assembleLandmarkParts(name: string, parts: readonly ModelPartFactory[]) {
  return compactModel(createModelAssembly(name, parts), { mergeEquivalentMaterials: true });
}
