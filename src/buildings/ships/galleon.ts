import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

/** An imagined sailing galleon, in meters, rather than a surveyed historical vessel. */
export const GALLEON = {
  author: "Codex GPT-6.1 Sol",
  name: "Galleon",
  length: 58,
  beam: 12,
  height: 40,
  draft: 3.2,
  note: "Idealized three-masted galleon with square courses and topsails, a lateen mizzen, beakhead, raised forecastle, stepped sterncastle, broadside guns and standing rigging. Dimensions are illustrative. Interiors, running rigging and individual hull planks are omitted."
} as const;

// Longitudinal stations: x, half beam, sheer height. The bow points along +X.
const STATIONS = [
  [-23, 3.3, 6.3],
  [-20, 4.6, 5.8],
  [-14, 5.7, 5.2],
  [-6, 6, 4.8],
  [4, 5.8, 4.8],
  [13, 4.7, 5.2],
  [20, 2.7, 6],
  [24, 0.12, 7]
] as const;
const MASTS = [
  {
    x: 11,
    top: 32,
    sails: [
      { y: 23, width: 15, drop: 10 },
      { y: 30, width: 10, drop: 6 }
    ]
  },
  {
    x: -3,
    top: 39,
    sails: [
      { y: 26, width: 19, drop: 12 },
      { y: 36, width: 12, drop: 8 }
    ]
  },
  { x: -17, top: 28, sails: [] }
] as const;

export interface GalleonMeshes extends CityStructureMeshes {
  plan: string;
  elevation: string;
}

export function createGalleon(): GalleonMeshes {
  const group = new THREE.Group();
  group.name = "galleon";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = new THREE.MeshLambertMaterial({ color: 0x68432e });
  const lowerHull = new THREE.MeshLambertMaterial({ color: 0x38291f });
  const deck = new THREE.MeshLambertMaterial({ color: 0xb58e59 });
  const trim = new THREE.MeshLambertMaterial({ color: 0xd1ad60 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x274956 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x242b2d });
  const dark = new THREE.MeshLambertMaterial({ color: 0x171e20 });
  const sail = new THREE.MeshLambertMaterial({ color: 0xeee1bf, side: THREE.DoubleSide });
  const blueFlag = new THREE.MeshLambertMaterial({ color: 0x274956, side: THREE.DoubleSide });
  const rope = new THREE.LineBasicMaterial({ color: 0x514538 });
  const materials = [wood, lowerHull, deck, trim, blue, iron, dark, sail, blueFlag, rope];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
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
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const ropes: number[] = [];
  function line(a: THREE.Vector3, b: THREE.Vector3) {
    ropes.push(...a.toArray(), ...b.toArray());
  }
  function surface(name: string, points: number[], indices: number[], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  // Closed cross-section with a narrow keel, rounded bilges and inward-tapering topsides.
  const rings = STATIONS.map(([x, beam, sheer]) => [
    [x, sheer, -beam * 0.88],
    [x, 1.2, -beam],
    [x, -1.6, -beam * 0.7],
    [x, -GALLEON.draft, -beam * 0.13],
    [x, -GALLEON.draft, beam * 0.13],
    [x, -1.6, beam * 0.7],
    [x, 1.2, beam],
    [x, sheer, beam * 0.88]
  ]);
  const vertices = rings.flat(2);
  const upper: number[] = [],
    lower: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < 7; j++) {
      const a = i * 8 + j,
        b = a + 8;
      (j === 0 || j === 6 ? upper : lower).push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  // Outward winding follows the station cross-section; end caps close the hull.
  surface("hull-topsides", vertices, upper, wood);
  surface("hull-underwater", vertices, lower, lowerHull);
  surface("transom", rings[0].flat(), [0, 1, 7, 1, 6, 7, 1, 2, 6, 2, 5, 6, 2, 3, 5, 3, 4, 5], blue);
  surface("stem", rings.at(-1)!.flat(), [0, 7, 1, 1, 7, 6, 1, 6, 2, 2, 6, 5, 2, 5, 3, 3, 5, 4], wood);
  const deckPoints = STATIONS.flatMap(([x, beam, y]) => [x, y, -beam * 0.88, x, y, beam * 0.88]);
  const deckIndices: number[] = [];
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = i * 2;
    deckIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  surface("main-deck", deckPoints, deckIndices, deck);
  for (const side of [-1, 1]) {
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const [x, beam, y] = STATIONS[i],
        [nx, nb, ny] = STATIONS[i + 1];
      spar("bulwark", v(x, y + 0.35, side * beam * 0.88), v(nx, ny + 0.35, side * nb * 0.88), 0.2, blue);
      for (const offset of [0.75, 2.6]) {
        spar("hull-wale", v(x, y - offset, side * beam * 0.93), v(nx, ny - offset, side * nb * 0.93), 0.1, trim);
      }
    }
  }
  function raisedDeck(name: string, x: number, base: number, w: number, h: number, d: number) {
    box(name, x, base + h / 2, 0, w, h, d, blue);
    box(`${name}-deck`, x, base + h, 0, w + 0.3, 0.2, d + 0.3, deck);
    for (const side of [-1, 1]) {
      box(`${name}-rail`, x, base + h + 0.95, (side * d) / 2, w, 0.13, 0.14, trim);
      for (let dx = -w / 2; dx <= w / 2; dx += 1.2)
        box("rail-post", x + dx, base + h + 0.5, (side * d) / 2, 0.1, 0.9, 0.1, trim);
    }
  }
  raisedDeck("forecastle", 16, 5.4, 7, 1.3, 6.5);
  raisedDeck("quarterdeck", -16.5, 5.4, 12, 2.3, 8.4);
  raisedDeck("poop-deck", -20, 7.8, 5.5, 2, 7.2);
  for (const side of [-1, 1]) {
    for (const x of [-17, -12, -7, -2, 3, 8, 13]) {
      const station = STATIONS.findIndex(s => s[0] >= x);
      const [ax, ab] = STATIONS[station - 1],
        [bx, bb] = STATIONS[station];
      const beam = ab + ((bb - ab) * (x - ax)) / (bx - ax);
      box("gunport", x, 2.9, side * beam * 0.95, 1.15, 0.95, 0.12, dark);
      spar("cannon", v(x, 2.9, side * (beam * 0.95 - 0.2)), v(x, 2.9, side * (beam + 0.8)), 0.18, iron);
      const lid = box("gunport-lid", x, 3.65, side * (beam * 0.95 + 0.3), 1.25, 0.12, 0.9, wood);
      lid.rotation.x = side * 0.35;
    }
  }
  for (const z of [-2.4, -1.2, 0, 1.2, 2.4]) {
    box("stern-window", -23.06, 8.7, z, 0.12, 1, 0.75, trim);
    box("stern-glass", -23.14, 8.7, z, 0.08, 0.72, 0.48, dark);
  }
  surface("beakhead-deck", [21, 6.8, -1.8, 21, 6.8, 1.8, 28, 7.8, -0.6, 28, 7.8, 0.6], [0, 1, 2, 1, 3, 2], deck);
  for (const side of [-1, 1]) {
    spar("beakhead-rail", v(21, 7.8, side * 1.8), v(28, 8.8, side * 0.6), 0.1, trim);
    for (let t = 0; t <= 1; t += 0.2) {
      const x = 21 + 7 * t,
        y = 6.8 + t,
        z = side * (1.8 - 1.2 * t);
      spar("beakhead-post", v(x, y, z), v(x, y + 1, z), 0.07, trim);
    }
  }
  spar("bowsprit", v(18, 6), v(33, 14), 0.22);
  spar("rudder", v(-23.5, -2), v(-23.5, 3), 0.5);
  box("deck-hatch", 3, 5.05, 0, 4, 0.35, 3, wood);
  for (let x = 1.4; x < 5; x += 0.4) box("hatch-grating", x, 5.24, 0, 0.12, 0.05, 2.7, dark);
  box("capstan", 15, 7.3, 0, 0.8, 1, 0.8, wood);
  spar("capstan-bar", v(15, 7.7, -1.5), v(15, 7.7, 1.5), 0.09);
  for (const mast of MASTS) {
    spar("mast", v(mast.x, 5), v(mast.x, mast.top), 0.26);
    if (mast.sails.length) {
      const fightingTop = add("fighting-top", cylinder, wood);
      fightingTop.position.set(mast.x, mast.sails[0].y + 1.1, 0);
      fightingTop.scale.set(1.35, 0.3, 1.35);
    }
    for (const side of [-1, 1]) {
      for (const dx of [-3, -1.5, 0, 1.5]) {
        line(v(mast.x, mast.top * 0.65), v(mast.x + dx, 5.5, side * 4.8));
      }
      for (let t = 0.12; t < 0.9; t += 0.055) {
        const y = THREE.MathUtils.lerp(5.5, mast.top * 0.65, t);
        line(v(mast.x - 3 * (1 - t), y, side * 4.8 * (1 - t)), v(mast.x + 1.5 * (1 - t), y, side * 4.8 * (1 - t)));
      }
    }
    for (const s of mast.sails) {
      spar("yard", v(mast.x, s.y, -s.width / 2 - 0.7), v(mast.x, s.y, s.width / 2 + 0.7), 0.14);
      const points: number[] = [],
        indices: number[] = [];
      const cols = 12,
        rows = 8;
      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        for (let col = 0; col <= cols; col++) {
          const u = col / cols;
          points.push(
            mast.x + 2.2 * Math.sin(Math.PI * u) * Math.sin(Math.PI * t),
            s.y - s.drop * t + 0.8 * Math.sin(Math.PI * u) * t,
            (u - 0.5) * s.width * (1 - 0.12 * t)
          );
        }
      }
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const a = r * (cols + 1) + c;
          indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
        }
      surface("square-sail", points, indices, sail);
      for (const side of [-1, 1])
        line(v(mast.x, s.y, (side * s.width) / 2), v(mast.x, s.y - s.drop, side * s.width * 0.44));
    }
    // Long, forked pennants provide a readable silhouette above the rig.
    surface(
      "pennant",
      [
        mast.x,
        mast.top,
        0,
        mast.x - 4,
        mast.top - 0.4,
        0.3,
        mast.x - 2.8,
        mast.top - 0.8,
        0,
        mast.x - 4,
        mast.top - 1.3,
        0.3,
        mast.x,
        mast.top - 1.1,
        0
      ],
      [0, 1, 2, 0, 2, 4, 2, 3, 4],
      blueFlag
    );
  }
  function lateen() {
    spar("lateen-yard", v(-23, 15), v(-13, 28), 0.13);
    surface("lateen-sail", [-23, 15, 0, -13, 28, 0, -12, 13, 0, -16, 18, 1.3], [0, 1, 3, 1, 2, 3, 2, 0, 3], sail);
  }
  lateen();
  line(v(33, 14), v(11, 32));
  line(v(24, 7), v(11, 31));
  line(v(11, 32), v(-3, 38));
  line(v(-3, 38), v(-17, 27));
  const rigging = new THREE.BufferGeometry();
  rigging.setAttribute("position", new THREE.Float32BufferAttribute(ropes, 3));
  geometries.add(rigging);
  const lines = new THREE.LineSegments(rigging, rope);
  lines.name = "standing-rigging";
  group.add(lines);
  return {
    group,
    pickables,
    plan: galleonPlan(),
    elevation: galleonElevation(),
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

function galleonPlan(): string {
  const outline = [
    ...STATIONS.map(([x, b]) => `${x},${-b * 0.88}`),
    ...[...STATIONS].reverse().map(([x, b]) => `${x},${b * 0.88}`)
  ].join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-26 -12 62 24"><g stroke="#604530" stroke-width="0.16"><polygon points="${outline}" fill="#b58e59"/><path d="M-22.5,-4.2 H-10.5 V4.2 H-22.5 Z M-22.75,-3.6 H-17.25 V3.6 H-22.75 Z M12.5,-3.25 H19.5 V3.25 H12.5 Z" fill="#d1ad60"/><rect x="1" y="-1.5" width="4" height="3" fill="#68432e"/><path d="M18,0 H33" stroke-width="0.45"/>${MASTS.map(m => `<circle cx="${m.x}" r="0.6" fill="#68432e"/>${m.sails.map(s => `<path d="M${m.x},${-s.width / 2} V${s.width / 2}" stroke-width="0.3"/>`).join("")}`).join("")}</g></svg>`;
}

function galleonElevation(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-28 -42 65 48"><g stroke="#604530" stroke-width="0.2"><path d="M-23,-6.3 L-20,-5.8 L-14,-5.2 L-6,-4.8 L4,-4.8 L13,-5.2 L20,-6 L24,-7 L20,0 L13,2 L4,3.2 L-14,3.2 L-23,1 Z" fill="#68432e"/><path d="M-22.5,-5.4 V-7.7 H-10.5 V-5.4 M-22.75,-7.8 V-9.8 H-17.25 V-7.8 M12.5,-5.4 V-6.7 H19.5 V-5.4" fill="#274956"/><path d="M18,-6 L33,-14 M33,-14 L11,-32 L-3,-38 L-17,-27" fill="none"/>${MASTS.map(m => `<path d="M${m.x},-5 V${-m.top}" stroke-width="0.4"/>${m.sails.map(s => `<path d="M${m.x},${-s.y} Q${m.x + 5},${-s.y + s.drop / 2} ${m.x},${-s.y + s.drop}" fill="none" stroke="#d1ad60" stroke-width="0.8"/>`).join("")}`).join("")}<path d="M-23,-15 L-13,-28 L-12,-13 Z" fill="#eee1bf"/>${[-17, -12, -7, -2, 3, 8, 13].map(x => `<rect x="${x - 0.55}" y="-3.4" width="1.1" height="1" fill="#171e20"/>`).join("")}</g><path d="M-27,0 H36" stroke="#8faeb4" stroke-width="0.15" stroke-dasharray="1 1"/></svg>`;
}
