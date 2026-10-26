import * as THREE from "three";

interface HipThatchOptions {
  run: number;
  rise: number;
  zBack: number;
  zFront: number;
  detailed: boolean;
}

/** The same four planes used by CE's detailed hipped houses, before the covering thickness. */
export function hipRoofHeight(run: number, rise: number, zBack: number, zFront: number, x: number, z: number): number {
  const inset = Math.min(run, (zFront - zBack) / 2);
  return Math.min(rise * (1 - Math.abs(x) / run), (rise * (z - zBack)) / inset, (rise * (zFront - z)) / inset);
}

/** One continuous thatch coat: rounded plane junctions, cut edges, and fine downhill fibres. No ridge cylinders. */
export function createHipThatchRoof({ run, rise, zBack, zFront, detailed }: HipThatchOptions) {
  const thickness = 0.3;
  const inset = Math.min(run, (zFront - zBack) / 2);
  const smoothMin = (a: number, b: number) => {
    const k = 0.12;
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  const surface = (x: number, z: number) => {
    const side = rise * (1 - Math.sqrt(x * x + Math.min(0.12, (0.1 * run) / Math.max(0.1, rise)) ** 2) / run);
    return smoothMin(smoothMin(side, (rise * (z - zBack)) / inset), (rise * (zFront - z)) / inset) + thickness;
  };
  const nx = Math.min(detailed ? 40 : 16, Math.max(8, 2 * Math.ceil(run / (detailed ? 0.22 : 0.65))));
  const nz = Math.min(detailed ? 64 : 24, Math.max(8, Math.ceil((zFront - zBack) / (detailed ? 0.28 : 0.8))));
  const positions: number[] = [],
    indices: number[] = [];
  const row = nx + 1;
  for (let iz = 0; iz <= nz; iz++) {
    const z = zBack + ((zFront - zBack) * iz) / nz;
    for (let ix = 0; ix <= nx; ix++) {
      const x = -run + (2 * run * ix) / nx;
      positions.push(x, surface(x, z), z);
    }
  }
  const gridVertices = positions.length / 3;
  for (let iz = 0; iz <= nz; iz++) {
    const z = zBack + ((zFront - zBack) * iz) / nz;
    for (let ix = 0; ix <= nx; ix++) {
      const x = -run + (2 * run * ix) / nx;
      positions.push(x, hipRoofHeight(run, rise, zBack, zFront, x, z) - 0.02, z);
    }
  }
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const a = iz * row + ix,
        b = a + 1,
        c = a + row,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
      indices.push(
        a + gridVertices,
        b + gridVertices,
        c + gridVertices,
        b + gridVertices,
        d + gridVertices,
        c + gridVertices
      );
    }
  // Separate edge vertices keep the cut faces from rounding the whole roof into a balloon.
  const perimeter: number[] = [];
  for (let ix = 0; ix <= nx; ix++) perimeter.push(ix);
  for (let iz = 1; iz <= nz; iz++) perimeter.push(iz * row + nx);
  for (let ix = nx - 1; ix >= 0; ix--) perimeter.push(nz * row + ix);
  for (let iz = nz - 1; iz > 0; iz--) perimeter.push(iz * row);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i],
      b = perimeter[(i + 1) % perimeter.length];
    const offset = positions.length / 3;
    for (const index of [a, b, b + gridVertices, a + gridVertices])
      positions.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  body.setIndex(indices);
  body.computeVertexNormals();

  const strands: number[][] = [[], []];
  if (detailed) {
    // Keep wide roofs bounded and place the fibres on the actual triangulated coat, not above it.
    const spacing = Math.max(1, Math.sqrt((2 * run * (zFront - zBack)) / (0.15 * 0.18 * 1200)));
    const meshSurface = (x: number, z: number) => {
      const gx = Math.max(0, Math.min(nx, ((x + run) / (2 * run)) * nx));
      const gz = Math.max(0, Math.min(nz, ((z - zBack) / (zFront - zBack)) * nz));
      const ix = Math.min(nx - 1, Math.floor(gx)),
        iz = Math.min(nz - 1, Math.floor(gz));
      const tx = gx - ix,
        tz = gz - iz,
        a = iz * row + ix;
      const heights = [a, a + 1, a + row, a + row + 1].map(index => positions[index * 3 + 1]);
      return tx + tz <= 1
        ? heights[0] + (heights[1] - heights[0]) * tx + (heights[2] - heights[0]) * tz
        : heights[3] + (heights[2] - heights[3]) * (1 - tx) + (heights[1] - heights[3]) * (1 - tz);
    };
    let iz = 0;
    for (let z = zBack + 0.06; z < zFront - 0.06; z += 0.18 * spacing, iz++) {
      let ix = 0;
      for (let x = -run + 0.06; x < run - 0.06; x += 0.15 * spacing, ix++) {
        const hash = ((Math.imul(ix + 1, 73856093) ^ Math.imul(iz + 1, 19349663)) >>> 0) / 0xffffffff;
        const px = x + hash * 0.07,
          pz = z + (hash - 0.5) * 0.09;
        let dx = surface(px - 0.01, pz) - surface(px + 0.01, pz);
        let dz = surface(px, pz - 0.01) - surface(px, pz + 0.01);
        const gradient = Math.hypot(dx, dz);
        if (gradient < 1e-5) continue;
        const length = 0.07 + hash * 0.19;
        dx = (dx / gradient) * length;
        dz = (dz / gradient) * length;
        const ex = px + dx,
          ez = pz + dz;
        if (Math.abs(ex) >= run - 0.02 || ez <= zBack + 0.02 || ez >= zFront - 0.02) continue;
        const width = 0.003 + hash * 0.003;
        const wx = (-dz / length) * width,
          wz = (dx / length) * width;
        const points = [
          [px - wx, pz - wz],
          [px + wx, pz + wz],
          [ex + wx, ez + wz],
          [ex - wx, ez - wz]
        ];
        const bucket = strands[hash < 0.55 ? 0 : 1];
        // Wind the fine flat strokes upward; their width is millimetres, not ridge-sized timber.
        for (const index of [0, 1, 2, 0, 2, 3]) {
          const [sx, sz] = points[index];
          bucket.push(sx, meshSurface(sx, sz) + 0.002, sz);
        }
      }
    }
  }
  const grain = strands.map(values => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
    geometry.computeVertexNormals();
    return geometry;
  });
  return { body, grain };
}
