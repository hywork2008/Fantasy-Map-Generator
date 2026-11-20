import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type ForumBathsQuality = "low" | "high";

/**
 * Plan of the men's baths near the Forum at Pompeii, measured in meters from the scaled plan in A. Mau, Pompeii: Its
 * Life and Art (1899), fig. 86. X runs east, Z south; interiors only, walls are added round them.
 */
const PLAN = {
  apodyterium: { x0: 0.56, x1: 5.97, z0: 6.67, z1: 17.0 },
  frigidarium: { cx: 5.6, cz: 3.6, radius: 2.64, pool: 1.86 },
  tepidarium: { x0: 6.67, x1: 13.3, z0: 6.94, z1: 16.9 },
  caldarium: { x0: 14.3, x1: 19.2, z0: 4.44, z1: 18.1, apse: 2.4 },
  alveus: { x0: 13.5, x1: 18.3, z0: 15.4, z1: 17.6 },
  labrum: { radius: 1 },
  furnace: { x0: 19.95, x1: 22.8, z0: 8.3, z1: 18.9 },
  boilers: [
    [21.2, 13.4, 0.85],
    [21.2, 14.9, 0.85],
    [21.1, 17.2, 1.05]
  ]
} as const;
const WALL = 0.75;
/** Heights are not on the plan: vaults spring at these levels, proportioned to the room widths. */
const SPRING = { apodyterium: 4, frigidarium: 3.6, tepidarium: 4.5, caldarium: 5, furnace: 3.2 };
const ROOF_PITCH = 0.42;

const caldariumWidth = PLAN.caldarium.x1 - PLAN.caldarium.x0;

/**
 * The men's baths near the Forum at Pompeii (Terme del Foro, built soon after 80 BC), in meters: ground at y = 0,
 * X east and Z south; the block is centred on the origin by the viewer.
 */
export const FORUM_BATHS = {
  author: "Claude Opus 5.5" as Author,
  name: "Pompeii Forum Baths, men's section",
  plan: PLAN,
  wall: WALL,
  spring: SPRING,
  scale: "A. Mau, Pompeii: Its Life and Art (1899), fig. 86, scale bar 0–50 m",
  note: "Schematic men's baths of the Forum Baths at Pompeii, built soon after 80 BC by the duumvir L. Caesius and the aediles C. Occius and L. Niraemius from public funds, and the only baths working when Vesuvius erupted in AD 79. The circuit runs from the dressing room (apodyterium, I), which the plan shows with benches, to the small round cold room (frigidarium, II) with its central plunge basin and four semicircular niches, the warm room (tepidarium, III), heated only by a bronze brazier, and the hot room (caldarium, IV) with the hot bath (alveus) at its south end and the cold-water basin (labrum) in the apse at the north. A long, narrow furnace room (V) between the men's and the women's baths held the boilers. Room sizes are measured from the scaled plan in Mau (1899), fig. 86; the women's baths, the court with its colonnade and the shops round the block are left out. Heights, vault shapes, roofs and windows are not on the plan and are proportioned; the masonry is the quasi-reticulate facing Mau notes for these baths.",
  highNote:
    "High tier: the quasi-reticulate facing shown as diagonal joints on the street fronts, tile courses at the corners, the round room's oculus, high arched windows in the caldarium and tepidarium, doorways to the court, the roof tiles' ribs, the bronze boilers on their masonry bases in the furnace room and its stoking arch."
} as const;

export interface ForumBathsMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createForumBathsModel(quality: ForumBathsQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `forum-baths-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const masonry = new THREE.MeshLambertMaterial({ color: 0xc7b38f });
  const tufa = new THREE.MeshLambertMaterial({ color: 0x9c8f78 });
  const tile = new THREE.MeshLambertMaterial({ color: 0xa4553a, side: THREE.DoubleSide });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2421 });
  const bronze = new THREE.MeshLambertMaterial({ color: 0x7a5a32 });
  const brick = new THREE.MeshLambertMaterial({ color: 0xa8683f });
  const materials = [masonry, tufa, tile, dark, bronze, brick];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material = masonry
  ) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function surface(name: string, corners: THREE.Vector3[], material: THREE.Material) {
    // Wind roof faces upward; the plan projection draws front faces only.
    const n = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]));
    const pts = n.y < 0 ? [...corners].reverse() : corners;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        pts.flatMap(p => [p.x, p.y, p.z]),
        3
      )
    );
    geometry.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  /** A hall's masonry block with a gabled tile roof whose ridge runs along Z. */
  function hall(name: string, r: { x0: number; x1: number; z0: number; z1: number }, spring: number) {
    const x0 = r.x0 - WALL,
      x1 = r.x1 + WALL,
      z0 = r.z0 - WALL,
      z1 = r.z1 + WALL;
    const half = (r.x1 - r.x0) / 2;
    // The vault rises a half-width above its springing; the roof sits over the vault's crown.
    const eaves = spring + half * 0.6;
    box(name, (x0 + x1) / 2, eaves / 2, (z0 + z1) / 2, x1 - x0, eaves, z1 - z0);
    const xc = (x0 + x1) / 2,
      ridge = eaves + ((x1 - x0) / 2) * ROOF_PITCH;
    for (const [a, b] of [
      [x0, xc],
      [x1, xc]
    ])
      surface(
        "roof",
        [v(a, eaves, z0 - 0.2), v(a, eaves, z1 + 0.2), v(b, ridge, z1 + 0.2), v(b, ridge, z0 - 0.2)],
        tile
      );
    for (const z of [z0 - 0.2, z1 + 0.2])
      surface("gable", [v(x0, eaves, z), v(x1, eaves, z), v(xc, ridge, z)], masonry);
    return { x0, x1, z0, z1, eaves, ridge };
  }

  const apodyterium = hall("apodyterium", PLAN.apodyterium, SPRING.apodyterium);
  const tepidarium = hall("tepidarium", PLAN.tepidarium, SPRING.tepidarium);
  const caldarium = hall("caldarium", PLAN.caldarium, SPRING.caldarium);
  // The caldarium's apse at its north end under a half-cone of tiles; theta runs from +Z toward +X, so the north
  // half starts at a quarter turn.
  const c = PLAN.caldarium;
  const apseCentre = v((c.x0 + c.x1) / 2, 0, c.z0);
  const apseOuter = caldariumWidth / 2 + WALL;
  const apseWall = add(
    "caldarium-apse",
    new THREE.CylinderGeometry(apseOuter, apseOuter, caldarium.eaves, 24, 1, false, Math.PI / 2, Math.PI),
    masonry
  );
  apseWall.position.copy(apseCentre).setY(caldarium.eaves / 2);
  const apseRoof = add(
    "roof",
    new THREE.ConeGeometry(apseOuter + 0.2, caldarium.ridge - caldarium.eaves, 24, 1, true, Math.PI / 2, Math.PI),
    tile
  );
  apseRoof.position.copy(apseCentre).setY((caldarium.eaves + caldarium.ridge) / 2);
  // The round frigidarium inside a square block, under a conical roof with its oculus.
  const f = PLAN.frigidarium;
  const fOuter = f.radius + WALL;
  box("frigidarium", f.cx, SPRING.frigidarium / 2, f.cz, 2 * fOuter, SPRING.frigidarium, 2 * fOuter);
  const cone = 2.4;
  const roof = add("roof", new THREE.ConeGeometry(fOuter * Math.SQRT2, cone, 4, 1, true, Math.PI / 4), tile);
  roof.position.set(f.cx, SPRING.frigidarium + cone / 2, f.cz);
  // The furnace room: a lower block with a lean-to roof against the caldarium.
  const fr = PLAN.furnace;
  const fx0 = caldarium.x1,
    fx1 = fr.x1 + WALL,
    fz0 = fr.z0 - WALL,
    fz1 = fr.z1 + WALL;
  box("furnace-room", (fx0 + fx1) / 2, SPRING.furnace / 2, (fz0 + fz1) / 2, fx1 - fx0, SPRING.furnace, fz1 - fz0);
  surface(
    "roof",
    [
      v(fx0, SPRING.furnace + 1, fz0),
      v(fx0, SPRING.furnace + 1, fz1),
      v(fx1, SPRING.furnace, fz1),
      v(fx1, SPRING.furnace, fz0)
    ],
    tile
  );

  // Doorways from the court and the street.
  const door = (x: number, z: number, alongX: boolean, w = 1.4, h = 2.6) =>
    box("doorway", x, h / 2, z, alongX ? w : 0.06, h, alongX ? 0.06 : w, dark);
  door(apodyterium.x0 - 0.03, (PLAN.apodyterium.z0 + PLAN.apodyterium.z1) / 2 - 2, false);
  door((apodyterium.x0 + apodyterium.x1) / 2 - 0.6, apodyterium.z1 + 0.03, true);

  if (high) {
    const oculus = add("oculus", new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16), dark);
    oculus.position.set(f.cx, SPRING.frigidarium + cone - 0.35, f.cz);
    // High arched windows in the south ends of the tepidarium and caldarium; their long sides are shared walls.
    for (const [r, h] of [
      [tepidarium, SPRING.tepidarium],
      [caldarium, SPRING.caldarium]
    ] as const) {
      const x = (r.x0 + r.x1) / 2;
      box("window", x, h - 0.4, r.z1 + 0.03, 1.2, 1.4, 0.06, dark);
      box("window-arch", x, h + 0.4, r.z1 + 0.05, 1.5, 0.2, 0.06, brick);
    }
    // Quasi-reticulate facing: diagonal joints on the west front of the dressing room.
    const ap = apodyterium;
    for (let s = -12; s <= 12; s += 0.6)
      for (const dir of [-1, 1]) {
        const a = v(ap.x0 - 0.01, 0.4, (ap.z0 + ap.z1) / 2 + s),
          b = v(ap.x0 - 0.01, ap.eaves - 0.3, (ap.z0 + ap.z1) / 2 + s + dir * (ap.eaves - 0.7));
        const zMin = ap.z0 + 0.3,
          zMax = ap.z1 - 0.3;
        if (Math.min(a.z, b.z) < zMin || Math.max(a.z, b.z) > zMax) continue;
        const joint = add("reticulate-joint", cube, tufa);
        joint.position.copy(a).add(b).multiplyScalar(0.5);
        joint.scale.set(0.01, a.distanceTo(b), 0.03);
        joint.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);
      }
    for (const [x, z] of [
      [ap.x0, ap.z0],
      [ap.x0, ap.z1]
    ])
      for (let y = 0.3; y < ap.eaves; y += 0.6)
        box("tile-course", x - 0.01, y, z + (z === ap.z0 ? 0.3 : -0.3), 0.03, 0.08, 0.6, brick);
    // Furnace room: the bronze boilers on their masonry bases, and the stoking arch.
    for (const [x, z, r] of PLAN.boilers) {
      box("boiler-base", x, 0.6, z, 2 * r + 0.3, 1.2, 2 * r + 0.3, masonry);
      const boiler = add("bronze-boiler", new THREE.CylinderGeometry(r, r, 1.4, 16), bronze);
      boiler.position.set(x, 1.9, z);
    }
    box("stoking-arch", fx1 + 0.03, 0.8, (fz0 + fz1) / 2 + 2, 0.06, 1.6, 1.2, dark);
    // Roof tile ribs on the caldarium.
    for (let z = caldarium.z0; z <= caldarium.z1; z += 0.5)
      for (const side of [-1, 1]) {
        const xc = (caldarium.x0 + caldarium.x1) / 2;
        const a = v(side < 0 ? caldarium.x0 : caldarium.x1, caldarium.eaves + 0.04, z),
          b = v(xc + side * 0.15, caldarium.ridge - 0.02, z);
        const rib = add("imbrex", cube, tile);
        rib.position.copy(a).add(b).multiplyScalar(0.5);
        rib.scale.set(0.12, 0.06, a.distanceTo(b));
        rib.lookAt(b);
      }
  }

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createForumBaths(quality: ForumBathsQuality = "low"): ForumBathsMeshes {
  const model = createForumBathsModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
