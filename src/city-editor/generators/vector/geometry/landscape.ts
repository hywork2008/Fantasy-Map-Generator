import type { VectorPolygon } from "../../../types/vector/generation";
import type { VectorLandscapeTree } from "../../../types/vector/landscape";

export const VECTOR_LANDSCAPE_TREE_LIMIT = 2048;
export const treeCrown = (tree: Pick<VectorLandscapeTree, "point" | "radiusMeters">): VectorPolygon => ({
  outer: Array.from({ length: 16 }, (_, i) => [
    tree.point[0] + Math.cos((i * Math.PI) / 8) * tree.radiusMeters,
    tree.point[1] + Math.sin((i * Math.PI) / 8) * tree.radiusMeters
  ]),
  holes: []
});
