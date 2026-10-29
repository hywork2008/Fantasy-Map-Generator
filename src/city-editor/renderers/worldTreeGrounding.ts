import rootProfile from "../data/scenery/world-tree-branches-v1.roots.json";
import { SCENERY_PLAIN_HEIGHT } from "./skyPanoramaGeometry";

interface SceneryPixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** Fit every sampled root foot below its mountain silhouette, including the valleys. */
export function worldTreeAltitude(
  image: SceneryPixels,
  sceneryHeight: number,
  treeImageHeight: number,
  panoramaAngle: number,
  contacts: readonly (readonly number[])[] = rootProfile.contacts
): number {
  const columnHeight = (x: number) => {
    for (let y = image.height - 1; y >= 0; y--) {
      // Match the alpha threshold at which the landscape fully masks the tree.
      if (image.data[(y * image.width + x) * 4 + 3] < 6) continue;
      const v = y / (image.height - 1);
      return v <= 0.48
        ? (v / 0.48) * SCENERY_PLAIN_HEIGHT
        : SCENERY_PLAIN_HEIGHT + ((v - 0.48) / 0.52) * (sceneryHeight - SCENERY_PLAIN_HEIGHT);
    }
    return 0;
  };
  let altitude = Infinity;
  for (const [u, v] of contacts) {
    const theta = (u - 0.5) * panoramaAngle;
    const panoramaU = ((theta + Math.PI) / (2 * Math.PI)) * 4;
    const sample = (panoramaU - Math.floor(panoramaU)) * image.width - 0.5;
    const left = ((Math.floor(sample) % image.width) + image.width) % image.width;
    // Use the lower neighboring texel so interpolation cannot leave a gap.
    const ridge = Math.min(columnHeight(left), columnHeight((left + 1) % image.width));
    altitude = Math.min(altitude, ridge - v * treeImageHeight);
  }
  const margin = Math.max(1, ((sceneryHeight - SCENERY_PLAIN_HEIGHT) / (0.52 * (image.height - 1))) * 2);
  return Number.isFinite(altitude) ? altitude - margin : 0;
}
