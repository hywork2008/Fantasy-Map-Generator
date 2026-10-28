import * as THREE from "three";

const WORLD_TREE_URL = new URL("../data/scenery/world-tree-branches-v1.png", import.meta.url).href;

/** Load the illustrated cutout once; opacity and sky tint are applied by the backdrop. */
export function createWorldTreeTexture(onLoad?: () => void): THREE.Texture {
  const texture = new THREE.TextureLoader().load(WORLD_TREE_URL, () => onLoad?.());
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
