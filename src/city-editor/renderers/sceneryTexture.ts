import * as THREE from "three";

export type SceneryStyle = "none" | "countryside" | "mountains";

/** A periodic landscape shared by all four walls; generated only when the style changes. */
export function createSceneryTexture(style: Exclude<SceneryStyle, "none">): THREE.DataTexture {
  const width = 1024,
    height = 256;
  const pixels = new Uint8Array(width * height * 4);
  const noise = (x: number, count: number, seed: number) => {
    const cell = Math.floor(x * count),
      t = x * count - cell;
    const hash = (i: number) => {
      const value = Math.sin((i % count) * 127.1 + seed * 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    return THREE.MathUtils.lerp(hash(cell), hash(cell + 1), t * t * (3 - 2 * t));
  };
  const foliage = (u: number, v: number) => {
    const row = Math.floor(v * 80),
      t = v * 80 - row;
    return THREE.MathUtils.lerp(noise(u, 256, row + 8), noise(u, 256, row + 9), t * t * (3 - 2 * t));
  };
  for (let x = 0; x < width; x++) {
    const u = x / (width - 1);
    const ridges = [0, 1, 2].map(
      layer => 0.16 + layer * 0.12 + noise(u, 8 + layer * 4, layer + 1) * 0.16 + noise(u, 32, layer + 7) * 0.025
    );
    const treeLine = 0.56 + noise(u, 24, 9) * 0.08 - noise(u, 256, 2) * 0.045;
    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      let color: number[] | undefined;
      if (style === "mountains") {
        for (let layer = 0; layer < ridges.length; layer++)
          if (v > ridges[layer])
            color = [
              [164, 187, 199],
              [145, 168, 177],
              [124, 151, 151]
            ][layer];
      }
      if (v > 0.52) {
        const depth = (v - 0.52) / 0.48;
        // Fields widen toward the foreground, with subdued distant colors.
        const row = Math.floor(Math.log1p(depth * 12) * 5);
        const columns = 40 - row * 2;
        const column = Math.floor(u * columns + row * 0.73) % columns;
        const field = Math.abs(Math.sin(column * 17.31 + row * 41.7));
        const palette = [
          [160, 153, 104],
          [173, 157, 102],
          [143, 151, 106],
          [153, 148, 111]
        ];
        color = palette[Math.min(3, Math.floor(field * 4))].map(value => value + (1 - depth) * 18);
        const forest = noise(u + Math.sin(v * 25) * 0.03, 16, 21) + foliage(u, v) * 0.2;
        if (v > treeLine && (v < treeLine + 0.07 || forest > 0.6 + depth * 0.1)) {
          const detail = foliage(u, v) * 36;
          color = [77 + detail, 99 + detail, 72 + detail];
        }
        // Atmospheric perspective keeps the horizon soft without hiding the foreground.
        color = color.map((value, channel) =>
          THREE.MathUtils.lerp(value, [217, 236, 246][channel], (1 - depth) * 0.38)
        );
      }
      if (!color) continue;
      const offset = ((height - 1 - y) * width + x) * 4;
      pixels.set([...color.map(Math.round), Math.round(255 * THREE.MathUtils.smoothstep(v, 0.12, 0.54))], offset);
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
