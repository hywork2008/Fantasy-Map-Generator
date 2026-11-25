import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type InsulaQuality = "low" | "high";

/** Roman foot (pes), m. */
const PES = 0.296;
/** Caseggiato di Diana, Ostia (I,III,3-4): a 40 × 22 m block, Hadrianic, perhaps four storeys. */
const SITE = { length: 40, depth: 22 };
/** Trajan's limit on the height of houses in Rome: 60 Roman feet. */
const HEIGHT_LIMIT = 60 * PES;
/** Ground floor with the shops' mezzanines, then three upper floors. */
const FLOORS = [5, 3.3, 3.3, 3.3] as const;
const EAVES = FLOORS.reduce((a, b) => a + b, 0);
const ROOF_RISE = 2.2;
/** The courtyard is entered only from the north and south; its size is not recorded. */
const COURT = { halfX: 7, halfZ: 4 };
const WALL = 0.95;
const BALCONY = { depth: 0.8, y: FLOORS[0] };
const SHOP = { width: 3, height: 3.1 };
const WINDOW = { width: 1, height: 1.5, spacing: 2.7 };

/**
 * A Roman apartment block (insula) after the Caseggiato di Diana at Ostia, in meters: ground at y = 0, the long
 * street front (Via dei Balconi) facing negative Z and the short front (Via di Diana) facing negative X.
 */
export const INSULA = {
  author: "Claude Opus 5.5" as Author,
  name: "Roman insula (Ostia, Caseggiato di Diana)",
  length: SITE.length,
  depth: SITE.depth,
  floors: FLOORS,
  eaves: EAVES,
  ridge: EAVES + ROOF_RISE,
  heightLimit: HEIGHT_LIMIT,
  court: COURT,
  wall: WALL,
  balcony: BALCONY,
  shops: 8,
  note: "Schematic Roman apartment block (insula) after the Caseggiato di Diana at Ostia (Regio I, Insula III, 3-4), built under Hadrian about AD 130: a 40 × 22 m block of yellow brick-faced concrete (opus latericium) round a central courtyard entered only from north and south, with shops (tabernae) and their mezzanine windows along Via dei Balconi and Via di Diana, travertine staircases from the street to the upper floors, and a narrow balcony along the first floor that fell into the street when the upper storeys were pulled down. Ground-floor walls are 0.90–1.00 m thick to carry several floors; the park gives perhaps four storeys, a structural study five. Trajan limited the height of houses in Rome to 60 Roman feet (17.75 m), and four storeys fit beneath it. The courtyard had a vaulted water reservoir against its east wall and, from about AD 150, a marble fountain. The courtyard's size, the storey heights, the window rows, the balcony's supports and the tiled roofs are proportioned, not recorded; only the ground floor and the start of the first survive.",
  highNote:
    "High tier: the tile bonding courses in the brick facing, relief arches over the windows and shop lintels, travertine thresholds and stair door jambs, the balcony's corbels and timber rail, shutters in some upper windows, the courtyard reservoir and marble fountain, and the roof tiles' ribs."
} as const;

export interface InsulaMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createInsulaModel(quality: InsulaQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `insula-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const brick = new THREE.MeshLambertMaterial({ color: 0xc89a5b });
  const bonding = new THREE.MeshLambertMaterial({ color: 0xa8683f });
  const travertine = new THREE.MeshLambertMaterial({ color: 0xd9d1bd });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2421 });
  const tile = new THREE.MeshLambertMaterial({ color: 0xa4553a, side: THREE.DoubleSide });
  const timber = new THREE.MeshLambertMaterial({ color: 0x6d4e33 });
  const marble = new THREE.MeshLambertMaterial({ color: 0xece8e0 });
  const water = new THREE.MeshLambertMaterial({ color: 0x5d7f8f });
  const paving = new THREE.MeshLambertMaterial({ color: 0xb5a58c });
  const materials = [brick, bonding, travertine, dark, tile, timber, marble, water, paving];
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
    material: THREE.Material = brick
  ) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function surface(name: string, corners: THREE.Vector3[], material: THREE.Material) {
    // Wind roof faces so that they face up; the plan projection draws front faces only.
    const normal = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0]));
    if (normal.y < 0) corners = [...corners].reverse();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        corners.flatMap(p => [p.x, p.y, p.z]),
        3
      )
    );
    geometry.setIndex(corners.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  /** Hipped roof over a rectangle, ridge along its longer side. */
  function hipRoof(x0: number, x1: number, z0: number, z1: number) {
    const y = EAVES,
      top = EAVES + ROOF_RISE;
    const alongX = x1 - x0 >= z1 - z0;
    const inset = (alongX ? z1 - z0 : x1 - x0) / 2;
    if (alongX) {
      const zc = (z0 + z1) / 2;
      surface("roof", [v(x0, y, z0), v(x1, y, z0), v(x1 - inset, top, zc), v(x0 + inset, top, zc)], tile);
      surface("roof", [v(x1, y, z1), v(x0, y, z1), v(x0 + inset, top, zc), v(x1 - inset, top, zc)], tile);
      surface("roof", [v(x0, y, z1), v(x0, y, z0), v(x0 + inset, top, zc)], tile);
      surface("roof", [v(x1, y, z0), v(x1, y, z1), v(x1 - inset, top, zc)], tile);
    } else {
      const xc = (x0 + x1) / 2;
      surface("roof", [v(x1, y, z0), v(x1, y, z1), v(xc, top, z1 - inset), v(xc, top, z0 + inset)], tile);
      surface("roof", [v(x0, y, z1), v(x0, y, z0), v(xc, top, z0 + inset), v(xc, top, z1 - inset)], tile);
      surface("roof", [v(x0, y, z0), v(x1, y, z0), v(xc, top, z0 + inset)], tile);
      surface("roof", [v(x1, y, z1), v(x0, y, z1), v(xc, top, z1 - inset)], tile);
    }
  }

  // Four wings round the courtyard: the long wings run the full length.
  const L = SITE.length / 2,
    D = SITE.depth / 2;
  for (const side of [-1, 1]) {
    box("wing", 0, EAVES / 2, (side * (COURT.halfZ + D)) / 2, SITE.length, EAVES, D - COURT.halfZ);
    box("wing", (side * (COURT.halfX + L)) / 2, EAVES / 2, 0, L - COURT.halfX, EAVES, 2 * COURT.halfZ);
    hipRoof(-L, L, side > 0 ? COURT.halfZ : -D, side > 0 ? D : -COURT.halfZ);
    hipRoof(side > 0 ? COURT.halfX : -L, side > 0 ? L : -COURT.halfX, -COURT.halfZ, COURT.halfZ);
  }
  box("courtyard-floor", 0, 0.03, 0, 2 * COURT.halfX, 0.06, 2 * COURT.halfZ, paving);

  /** An opening drawn as a dark recess on a facade; `normal` points out of the wall. */
  function opening(name: string, centre: THREE.Vector3, normal: THREE.Vector3, w: number, h: number, material = dark) {
    const along = normal.x !== 0;
    const mesh = box(
      name,
      centre.x + normal.x * 0.01,
      centre.y,
      centre.z + normal.z * 0.01,
      along ? 0.04 : w,
      h,
      along ? w : 0.04,
      material
    );
    return mesh;
  }
  /** Positions spaced along a facade, keeping clear of the corners. */
  const spaced = (length: number, step: number, margin: number) => {
    const n = Math.floor((length - 2 * margin) / step) + 1;
    const start = -((n - 1) * step) / 2;
    return Array.from({ length: n }, (_, i) => start + i * step);
  };

  // Long street front (Via dei Balconi, -Z): six shops and a stair door.
  const longFront = -D;
  const longNormal = v(0, 0, -1);
  const longBays = [-16.5, -11, -5.5, 0.5, 6, 11.5, 17];
  longBays.forEach((x, i) => {
    if (i === 3) {
      opening("stair-door", v(x, 1.3, longFront), longNormal, 1.4, 2.6);
      if (high)
        for (const dx of [-0.8, 0.8]) box("door-jamb", x + dx, 1.3, longFront - 0.08, 0.2, 2.6, 0.16, travertine);
      return;
    }
    opening("shop-opening", v(x, SHOP.height / 2, longFront), longNormal, SHOP.width, SHOP.height);
    opening("mezzanine-window", v(x, SHOP.height + 0.85, longFront), longNormal, 1.2, 0.7);
    if (high) {
      box("shop-threshold", x, 0.06, longFront - 0.2, SHOP.width + 0.2, 0.12, 0.4, travertine);
      box("relief-arch", x, SHOP.height + 0.2, longFront - 0.03, SHOP.width + 0.5, 0.35, 0.06, bonding);
    }
  });
  // Short street front (Via di Diana, -X): the south passage to the courtyard, two shops and the corner stair.
  const shortFront = -L;
  const shortNormal = v(-1, 0, 0);
  opening("courtyard-passage", v(shortFront, 1.6, 0), shortNormal, 2.4, 3.2);
  for (const z of [-6, 6]) {
    opening("shop-opening", v(shortFront, SHOP.height / 2, z), shortNormal, SHOP.width, SHOP.height);
    opening("mezzanine-window", v(shortFront, SHOP.height + 0.85, z), shortNormal, 1.2, 0.7);
  }
  opening("stair-door", v(shortFront, 1.3, -9.6), shortNormal, 1.3, 2.6);
  // The north passage on the far short front.
  opening("courtyard-passage", v(L, 1.6, 0), v(1, 0, 0), 2.4, 3.2);

  // Upper-floor windows on all four street fronts.
  let floorY = FLOORS[0];
  for (let f = 1; f < FLOORS.length; f++) {
    const sill = floorY + 0.9;
    for (const z of [-D, D])
      for (const x of spaced(SITE.length, WINDOW.spacing, 1.6)) {
        const n = v(0, 0, Math.sign(z));
        opening("window", v(x, sill + WINDOW.height / 2, z), n, WINDOW.width, WINDOW.height);
        if (high)
          box(
            "window-arch",
            x,
            sill + WINDOW.height + 0.12,
            z + Math.sign(z) * 0.03,
            WINDOW.width + 0.3,
            0.2,
            0.06,
            bonding
          );
      }
    for (const x of [-L, L])
      for (const z of spaced(SITE.depth, WINDOW.spacing, 1.6)) {
        const n = v(Math.sign(x), 0, 0);
        opening("window", v(x, sill + WINDOW.height / 2, z), n, WINDOW.width, WINDOW.height);
        if (high)
          box(
            "window-arch",
            x + Math.sign(x) * 0.03,
            sill + WINDOW.height + 0.12,
            z,
            0.06,
            0.2,
            WINDOW.width + 0.3,
            bonding
          );
      }
    floorY += FLOORS[f];
  }
  // Courtyard windows on the inner faces.
  if (high) {
    floorY = FLOORS[0];
    for (let f = 1; f < FLOORS.length; f++) {
      const y = floorY + 0.9 + WINDOW.height / 2;
      for (const z of [-COURT.halfZ, COURT.halfZ])
        for (const x of spaced(2 * COURT.halfX, WINDOW.spacing, 1.2))
          opening("court-window", v(x, y, z), v(0, 0, -Math.sign(z)), WINDOW.width, WINDOW.height);
      floorY += FLOORS[f];
    }
  }

  // The narrow first-floor balcony along Via dei Balconi; the first-floor windows open onto it.
  const balconyY = BALCONY.y;
  box("balcony", 0, balconyY, longFront - BALCONY.depth / 2, SITE.length - 1, 0.14, BALCONY.depth, timber);
  if (high) {
    for (const x of spaced(SITE.length - 1, 2, 0.4))
      box(
        "balcony-corbel",
        x,
        balconyY - 0.25,
        longFront - BALCONY.depth / 2 + 0.05,
        0.25,
        0.36,
        BALCONY.depth - 0.1,
        travertine
      );
    box("balcony-rail", 0, balconyY + 0.95, longFront - BALCONY.depth + 0.04, SITE.length - 1, 0.07, 0.07, timber);
    for (const x of spaced(SITE.length - 1, 0.9, 0.2))
      box("balcony-baluster", x, balconyY + 0.5, longFront - BALCONY.depth + 0.04, 0.05, 0.85, 0.05, timber);
    // Tile bonding courses in the facing every few feet.
    for (let y = 1.2; y < EAVES - 0.3; y += 1.2) {
      for (const z of [-D, D]) box("bonding-course", 0, y, z + Math.sign(z) * 0.005, SITE.length, 0.06, 0.01, bonding);
      for (const x of [-L, L]) box("bonding-course", x + Math.sign(x) * 0.005, y, 0, 0.01, 0.06, SITE.depth, bonding);
    }
    // Courtyard: the vaulted reservoir against the east wall and the marble fountain.
    box("reservoir", COURT.halfX - 1.1, 1, 0, 2.2, 2, 5, brick);
    const vault = add("reservoir-vault", new THREE.CylinderGeometry(1.1, 1.1, 5, 12, 1, false, 0, Math.PI), brick);
    vault.rotation.x = Math.PI / 2;
    vault.rotation.y = Math.PI / 2;
    vault.position.set(COURT.halfX - 1.1, 2, 0);
    box("fountain-basin", -2, 0.3, 0, 2.4, 0.6, 1.6, marble);
    box("fountain-water", -2, 0.55, 0, 2.2, 0.06, 1.4, water);
    box("fountain-pillar", -2, 0.9, 0, 0.3, 0.6, 0.3, marble);
    // Roof tile ribs (imbrices) on the long street pitch.
    for (const x of spaced(SITE.length - 8, 0.5, 0.1)) {
      const a = v(x, EAVES + 0.03, -D),
        // Stop short of the ridge, which the ridge tiles cover.
        b = a.clone().lerp(v(x, EAVES + ROOF_RISE + 0.03, -(COURT.halfZ + D) / 2), 0.92);
      const rib = add("imbrex", cube, tile);
      rib.position.copy(a).add(b).multiplyScalar(0.5);
      rib.scale.set(0.12, 0.06, a.distanceTo(b));
      rib.lookAt(b);
    }
    // Shutters on some upper windows.
    const windowXs = spaced(SITE.length, WINDOW.spacing, 1.6);
    for (const x of [windowXs[1], windowXs[5], windowXs[10]])
      for (const dx of [-0.75, 0.75])
        box(
          "shutter",
          x + dx,
          FLOORS[0] + FLOORS[1] + 0.9 + WINDOW.height / 2,
          -D - 0.05,
          0.5,
          WINDOW.height,
          0.04,
          timber
        );
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

export function createInsula(quality: InsulaQuality = "low"): InsulaMeshes {
  const model = createInsulaModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
