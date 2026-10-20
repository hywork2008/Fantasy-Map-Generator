import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

/** An illustrative merchant carrack, not a reconstruction of a specific vessel. */
export const CARRACK = {
  name: "Carrack",
  length: 44,
  beam: 12,
  height: 33,
  draft: 3.5,
  source: "https://exploration.marinersmuseum.org/watercraft/carrack-nao/",
  note: "Idealized three-masted merchant carrack with a broad round-bilged hull, high forecastle and stepped sterncastle, square fore and main sails, and a lateen mizzen. Dimensions are illustrative. Interiors and individual hull planks are omitted."
} as const;

// Bow faces +X; waterline is Y=0. Each station gives X, half beam and deck height.
const STATIONS = [
  [-18, 0.35, 7.4],
  [-16, 3.8, 6.6],
  [-12, 5.4, 5.7],
  [-6, 6, 5.1],
  [2, 6, 5.1],
  [9, 5.1, 5.6],
  [14, 3.4, 6.7],
  [18, 0.12, 8]
] as const;
const MASTS = [
  { x: 10, top: 27, sails: [{ y: 24, width: 13, drop: 10 }] },
  {
    x: -2,
    top: 33,
    sails: [
      { y: 24, width: 17, drop: 14 },
      { y: 31, width: 9, drop: 5 }
    ]
  },
  { x: -12.5, top: 24, sails: [] }
] as const;
const CASTLES = [
  { name: "forecastle", x: 12.5, base: 6.2, width: 8, height: 3, depth: 6.2 },
  { name: "sterncastle", x: -12.5, base: 5.8, width: 9, height: 3.2, depth: 8 },
  { name: "sterncastle-upper", x: -14, base: 9, width: 6, height: 2.3, depth: 6.6 }
] as const;

export interface CarrackMeshes extends CityStructureMeshes {
  plan: string;
  elevation: string;
}

export function createCarrack(): CarrackMeshes {
  const group = new THREE.Group();
  group.name = "carrack";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = new THREE.MeshLambertMaterial({ color: 0x74482d });
  const lowerHull = new THREE.MeshLambertMaterial({ color: 0x38291e });
  const deck = new THREE.MeshLambertMaterial({ color: 0xc09a63 });
  const trim = new THREE.MeshLambertMaterial({ color: 0xd1b075 });
  const red = new THREE.MeshLambertMaterial({ color: 0x80392d });
  const dark = new THREE.MeshLambertMaterial({ color: 0x29231d });
  const sail = new THREE.MeshLambertMaterial({ color: 0xf1e4c5, side: THREE.DoubleSide });
  const flag = new THREE.MeshLambertMaterial({ color: 0x9c3e2e, side: THREE.DoubleSide });
  const rope = new THREE.LineBasicMaterial({ color: 0x514335 });
  const materials = [wood, lowerHull, deck, trim, red, dark, sail, flag, rope];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = wood) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function spar(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = wood) {
    const mesh = add(name, cylinder, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1), b.clone().sub(a).normalize());
    return mesh;
  }
  function surface(name: string, points: number[], indices: number[], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  const ropes: number[] = [];
  function line(a: THREE.Vector3, b: THREE.Vector3) {
    ropes.push(...a.toArray(), ...b.toArray());
  }
  const rings = STATIONS.map(([x, beam, sheer]) => [
    [x, sheer, -beam * 0.82],
    [x, 1.3, -beam],
    [x, -1.6, -beam * 0.78],
    [x, -CARRACK.draft, -beam * 0.12],
    [x, -CARRACK.draft, beam * 0.12],
    [x, -1.6, beam * 0.78],
    [x, 1.3, beam],
    [x, sheer, beam * 0.82]
  ]);
  const upper: number[] = [],
    lower: number[] = [],
    deckIndices: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < 7; j++) {
      const a = i * 8 + j,
        b = a + 8;
      (j === 0 || j === 6 ? upper : lower).push(a, b, a + 1, b, b + 1, a + 1);
    }
    const a = i * 2;
    deckIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  surface("hull-topsides", rings.flat(2), upper, wood);
  surface("hull-underwater", rings.flat(2), lower, lowerHull);
  surface("stern", rings[0].flat(), [0, 1, 7, 1, 6, 7, 1, 2, 6, 2, 5, 6, 2, 3, 5, 3, 4, 5], wood);
  surface("stem", rings.at(-1)!.flat(), [0, 7, 1, 1, 7, 6, 1, 6, 2, 2, 6, 5, 2, 5, 3, 3, 5, 4], wood);
  surface(
    "main-deck",
    STATIONS.flatMap(([x, b, y]) => [x, y, -b * 0.82, x, y, b * 0.82]),
    deckIndices,
    deck
  );
  for (const side of [-1, 1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const [x, b, y] = STATIONS[i],
        [nx, nb, ny] = STATIONS[i + 1];
      spar("bulwark", v(x, y + 0.3, side * b * 0.82), v(nx, ny + 0.3, side * nb * 0.82), 0.22, red);
      for (const offset of [1, 2.5, 4]) {
        // Interpolate along the topside slope so the wales sit on the hull.
        const z = b * (0.82 + (0.18 * offset) / (y - 1.3));
        const nz = nb * (0.82 + (0.18 * offset) / (ny - 1.3));
        spar("hull-wale", v(x, y - offset, side * z), v(nx, ny - offset, side * nz), 0.12, trim);
      }
    }
    for (const [x, b, y] of STATIONS.slice(1, -1)) {
      spar("vertical-fender", v(x, 1.4, side * b), v(x, y, side * b * 0.82), 0.13, trim);
    }
  }
  for (const c of CASTLES) {
    box(c.name, c.x, c.base + c.height / 2, 0, c.width, c.height, c.depth, red);
    const top = c.base + c.height;
    box(`${c.name}-deck`, c.x, top, 0, c.width + 0.2, 0.18, c.depth + 0.2, deck);
    for (const side of [-1, 1]) {
      spar(
        "castle-rail",
        v(c.x - c.width / 2, top + 1, (side * c.depth) / 2),
        v(c.x + c.width / 2, top + 1, (side * c.depth) / 2),
        0.09,
        trim
      );
      for (let dx = -c.width / 2; dx <= c.width / 2; dx += 1) {
        box("castle-post", c.x + dx, top + 0.5, (side * c.depth) / 2, 0.1, 1, 0.1, trim);
      }
      for (let dx = -c.width / 2 + 1; dx < c.width / 2; dx += 1.8) {
        box("castle-window", c.x + dx, top - 1, side * (c.depth / 2 + 0.02), 0.45, 0.65, 0.08, dark);
      }
      spar(
        "castle-end-rail",
        v(c.x + (side * c.width) / 2, top + 1, -c.depth / 2),
        v(c.x + (side * c.width) / 2, top + 1, c.depth / 2),
        0.09,
        trim
      );
    }
  }
  box("cargo-hatch", 2.2, 5.35, 0, 4.5, 0.45, 3.3, wood);
  for (let x = 0.3; x < 4.4; x += 0.4) box("hatch-grating", x, 5.6, 0, 0.1, 0.05, 3, dark);
  spar("bowsprit", v(12, 7.5), v(24, 14), 0.23);
  box("rudder-blade", -18.5, -0.4, 0, 0.8, 5.8, 0.28, lowerHull);
  spar("rudder-stock", v(-18.5, -2), v(-18.5, 7.4), 0.2);
  for (const mast of MASTS) {
    spar("mast", v(mast.x, 5.1), v(mast.x, mast.top - 0.1), 0.25);
    if (mast.sails.length) {
      const top = add("fighting-top", cylinder, wood);
      top.position.set(mast.x, 25.4, 0);
      top.scale.set(1.25, 0.4, 1.25);
    }
    const shroudTop = mast.top * 0.75;
    for (const side of [-1, 1]) {
      for (const dx of [-2, -1, 0, 1]) line(v(mast.x, shroudTop), v(mast.x + dx, 6, side * 4));
      for (let t = 0.1; t < 0.94; t += 0.055) {
        const y = THREE.MathUtils.lerp(6, shroudTop, t);
        line(v(mast.x - 2 * (1 - t), y, side * 4 * (1 - t)), v(mast.x + (1 - t), y, side * 4 * (1 - t)));
      }
    }
    for (const s of mast.sails) {
      spar("yard", v(mast.x, s.y, -s.width / 2 - 0.5), v(mast.x, s.y, s.width / 2 + 0.5), 0.14);
      const points: number[] = [],
        indices: number[] = [];
      const cols = 12,
        rows = 8;
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        for (let col = 0; col <= cols; col++) {
          const u = col / cols;
          points.push(
            mast.x + 2 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t),
            s.y - s.drop * t + 0.6 * Math.sin(Math.PI * u) * t,
            (u - 0.5) * s.width * (1 - 0.1 * t)
          );
        }
      }
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const a = r * (cols + 1) + c;
          indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
        }
      surface("square-sail", points, indices, sail);
      for (const side of [-1, 1]) {
        line(v(mast.x, s.y, (side * s.width) / 2), v(mast.x, s.y - s.drop, side * s.width * 0.45));
        line(v(mast.x, s.y - s.drop, side * s.width * 0.45), v(mast.x - 2, 7, side * 4));
      }
    }
    surface(
      "pennant",
      [
        mast.x,
        mast.top,
        0,
        mast.x - 3.5,
        mast.top - 0.6,
        0.25,
        mast.x - 2.5,
        mast.top - 0.9,
        0,
        mast.x - 3.5,
        mast.top - 1.3,
        0.25,
        mast.x,
        mast.top - 1.1,
        0
      ],
      [0, 1, 2, 0, 2, 4, 2, 3, 4],
      flag
    );
  }
  spar("lateen-yard", v(-18, 14), v(-8, 25), 0.13);
  surface("lateen-sail", [-18, 14, 0, -8, 25, 0, -7, 12.5, 0, -11, 17, 1.2], [0, 1, 3, 1, 2, 3, 2, 0, 3], sail);
  line(v(24, 14), v(10, 26.8));
  line(v(18, 8), v(10, 26.8));
  line(v(10, 26.8), v(-2, 32.8));
  line(v(-2, 32.8), v(-12.5, 23.8));
  const rigging = new THREE.BufferGeometry();
  rigging.setAttribute("position", new THREE.Float32BufferAttribute(ropes, 3));
  geometries.add(rigging);
  const lines = new THREE.LineSegments(rigging, rope);
  lines.name = "standing-rigging";
  group.add(lines);
  return {
    group,
    pickables,
    plan: carrackPlan(),
    elevation: carrackElevation(),
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

function carrackPlan(): string {
  const outline = [
    ...STATIONS.map(([x, b]) => `${x},${-b * 0.82}`),
    ...[...STATIONS].reverse().map(([x, b]) => `${x},${b * 0.82}`)
  ].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-21 -11 47 22"><g stroke="#604530" stroke-width="0.16"><polygon points="${outline}" fill="#c09a63"/>${CASTLES.map(c => `<rect x="${c.x - c.width / 2}" y="${-c.depth / 2}" width="${c.width}" height="${c.depth}" fill="#d1b075"/>`).join("")}<rect x="-0.05" y="-1.65" width="4.5" height="3.3" fill="#74482d"/><path d="M12,0 H24" stroke-width="0.45"/>${MASTS.map(m => `<circle cx="${m.x}" r="0.5" fill="#74482d"/>${m.sails.map(s => `<path d="M${m.x},${-s.width / 2} V${s.width / 2}" stroke-width="0.3"/>`).join("")}`).join("")}</g></svg>`;
}

function carrackElevation(): string {
  const sheer = STATIONS.map(([x, , y]) => `${x},${-y}`).join(" L");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-21 -35 47 40"><g stroke="#604530" stroke-width="0.2"><path d="M${sheer} L14,0 L9,2 L2,3.5 L-6,3.5 L-12,2 L-18,0 Z" fill="#74482d"/>${CASTLES.map(c => `<rect x="${c.x - c.width / 2}" y="${-c.base - c.height}" width="${c.width}" height="${c.height}" fill="#80392d"/>`).join("")}<path d="M12,-7.5 L24,-14 L10,-26.8 L-2,-32.8 L-12.5,-23.8" fill="none"/>${MASTS.map(m => `<path d="M${m.x},-5.1 V${-m.top}" stroke-width="0.4"/>${m.sails.map(s => `<path d="M${m.x},${-s.y} Q${m.x + 4},${-s.y + s.drop / 2} ${m.x},${-s.y + s.drop}" fill="none" stroke="#d1b075" stroke-width="0.8"/>`).join("")}`).join("")}<path d="M-18,-14 L-8,-25 L-7,-12.5 Z" fill="#f1e4c5"/><path d="M-18.5,-3 V3" stroke-width="0.8"/></g><path d="M-20,0 H25" stroke="#8faeb4" stroke-width="0.15" stroke-dasharray="1 1"/></svg>`;
}
