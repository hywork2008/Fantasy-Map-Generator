import { type Author, DEFAULT_AUTHOR } from "../../authors";
import { compactModel } from "../../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../../modelParts";
import type { ArchitectureKit } from "../architectureKit";

export interface LandmarkComponent<Kit extends ArchitectureKit = ArchitectureKit> {
  id: string;
  quality?: ModelPartFactory["quality"];
  build(kit: Kit): void;
}

/** Fixed landmark coordinates: enumerate without building; construct only the selected factories. */
export function landmarkPartFactories<Kit extends ArchitectureKit>(
  name: string,
  quality: "low" | "high",
  components: readonly LandmarkComponent<Kit>[],
  createKit: () => Kit,
  author: Author = DEFAULT_AUTHOR
): readonly ModelPartFactory[] {
  return components.map(({ id, build, quality: componentQuality }) => ({
    id: `${name}:${id}`,
    role: id,
    quality: componentQuality ?? quality,
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
