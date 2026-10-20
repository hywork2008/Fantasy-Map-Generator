import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PierSite } from "../../city-editor/renderers/pierSites";
import type { Point } from "../../city-editor/types/primitives";
import { planVertex } from "../core/planFrame";
import { LAND_Y } from "../core/waterGeometry";
import type { CityStructureMeshes } from "./structureMeshes";

const DECK_THICKNESS = 0.24;

/** Exact SVG deck outlines with level timber decking, piles and open mooring edges. */
export function createTownPiers(
  sites: readonly PierSite[],
  waterHeightAt: (point: Point) => number,
  groundHeightAt: (point: Point) => number
): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "ce-piers";
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const decks: THREE.BufferGeometry[] = [];
  const piles: THREE.Matrix4[] = [];
  const bollards: THREE.Matrix4[] = [];
  const seams: number[] = [];
  for (const site of sites) {
    if (site.deck.length !== 4) continue;
    const [a, b, c, d] = site.deck;
    const root: Point = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2];
    const head: Point = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const length = Math.hypot(head[0] - root[0], head[1] - root[1]);
    const width = Math.hypot(d[0] - a[0], d[1] - a[1]);
    if (length < 0.5 || width < 0.5) continue;
    const at = (t: number, u: number): Point => [
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(d[0], c[0], t), u),
      THREE.MathUtils.lerp(THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(d[1], c[1], t), u)
    ];
    // Probe slightly inland for fallback piers whose root is exactly on the shoreline.
    const shore: Point = [
      root[0] - ((head[0] - root[0]) * 0.4) / length,
      root[1] - ((head[1] - root[1]) * 0.4) / length
    ];
    const top = Math.max(
      LAND_Y + groundHeightAt(shore) + 0.15,
      ...[0.2, 0.5, 0.95].map(t => waterHeightAt(at(t, 0.5)) + 0.8)
    );
    const shape = new THREE.Shape(site.deck.map(point => new THREE.Vector2(...point)));
    const deck = new THREE.ExtrudeGeometry(shape, { depth: DECK_THICKNESS, bevelEnabled: false, steps: 1 });
    deck.rotateX(-Math.PI / 2);
    deck.translate(0, top - DECK_THICKNESS, 0);
    decks.push(deck);
    const bays = Math.max(1, Math.ceil(length / 4));
    const inset = Math.min(0.2, 0.3 / width);
    for (let i = 0; i <= bays; i++) {
      const t = THREE.MathUtils.lerp(0.06, 0.94, i / bays);
      for (const u of [inset, 1 - inset]) {
        const point = at(t, u);
        const bed = waterHeightAt(point) - Math.max(0.5, Number.isFinite(site.depth) ? site.depth : 3) - 0.3;
        piles.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(...planVertex(point, (bed + top - DECK_THICKNESS) / 2)),
            new THREE.Quaternion(),
            new THREE.Vector3(1, top - DECK_THICKNESS - bed, 1)
          )
        );
        if (i % 2 === 0 || i === bays) {
          bollards.push(new THREE.Matrix4().makeTranslation(...planVertex(point, top + 0.25)));
        }
      }
    }
    const boards = Math.ceil(length / 0.65);
    for (let i = 1; i < boards; i++) {
      seams.push(...planVertex(at(i / boards, 0.015), top + 0.006), ...planVertex(at(i / boards, 0.985), top + 0.006));
    }
  }
  if (decks.length) {
    const geometry = mergeGeometries(decks)!;
    for (const deck of decks) deck.dispose();
    geometries.push(geometry);
    const material = new THREE.MeshLambertMaterial({ color: 0xb59a71 });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "pier-decks";
    mesh.raycast = () => {};
    group.add(mesh);
  }
  function instances(name: string, geometry: THREE.BufferGeometry, matrices: THREE.Matrix4[], color: number) {
    geometries.push(geometry);
    const material = new THREE.MeshLambertMaterial({ color });
    materials.push(material);
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix, index) => {
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = name;
    mesh.raycast = () => {};
    group.add(mesh);
  }
  if (piles.length) instances("pier-piles", new THREE.CylinderGeometry(0.17, 0.21, 1, 8), piles, 0x58432e);
  if (bollards.length) instances("pier-bollards", new THREE.CylinderGeometry(0.19, 0.14, 0.5, 8), bollards, 0x423a2d);
  if (seams.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(seams, 3));
    geometries.push(geometry);
    const material = new THREE.LineBasicMaterial({ color: 0x786346 });
    materials.push(material);
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = "pier-planks";
    lines.raycast = () => {};
    group.add(lines);
  }
  return {
    group,
    pickables: [],
    dispose() {
      group.removeFromParent();
      for (const child of group.children) if (child instanceof THREE.InstancedMesh) child.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}
