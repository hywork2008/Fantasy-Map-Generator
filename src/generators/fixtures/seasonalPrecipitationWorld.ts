import type { WorldContext } from "../../context/worldContext";

/** Synthetic continent surrounded by mapped ocean; coordinates are not a real station's terrain. */
export function seasonalPrecipitationWorld(width = 48, height = 24): WorldContext {
  const n = width * height;
  const points: [number, number][] = [],
    c: number[][] = [];
  const h = new Uint8Array(n),
    f = new Uint8Array(n);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const id = y * width + x;
      points.push([x + 0.5, y + 0.5]);
      c.push(
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1]
        ]
          .filter(([dx, dy]) => x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height)
          .map(([dx, dy]) => (y + dy) * width + x + dx)
      );
      const land = x >= width / 4 && x < (width * 3) / 4 && y > height / 6 - 1 && y < (height * 5) / 6;
      h[id] = land ? 30 : 5;
      f[id] = land ? 1 : 0;
    }
  return {
    mapId: 201,
    graphWidth: width,
    graphHeight: height,
    distanceScale: (150 * 48) / width,
    mapCoordinates: { latN: 90, latT: 180, lonW: -180, lonT: 360 },
    options: { axialTilt: 23.5, winds: [225, 45, 225, 315, 135, 315] },
    grid: {
      points,
      cellsX: width,
      cellsY: height,
      spacing: 1,
      features: [{ type: "ocean" }, { type: "island" }, { type: "lake" }],
      cells: {
        i: Uint32Array.from({ length: n }, (_, i) => i),
        c,
        h,
        f,
        temp: new Int8Array(n).fill(20),
        prec: new Uint8Array(n).fill(15)
      }
    }
  } as unknown as WorldContext;
}
