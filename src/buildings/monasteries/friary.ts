import * as THREE from "three";
import { fitMonastery, type Monastery } from "../../city-editor/generators/monasteryLayout";
import { makeRng } from "../../city-editor/generators/prng";
import type { StructureMassing } from "../../city-editor/types/contracts/structureMassing";
import type { Point } from "../../city-editor/types/document";
import { planVertex } from "../../city3d/core/planFrame";
import { createStructureMassing } from "../../city3d/three/structureMeshes";
import { createLandscapeTree } from "../landscape/trees";
import { ModelKit, type Surface } from "../medieval/modelKit";
import { createMedievalWellModel } from "../wells/medievalWell";

/** A fixed example of the same fitted programme used by generated CE friaries. */
export function friaryPreviewPlan(): Monastery {
  return fitMonastery({
    kind: "friary",
    id: "mendicant-friary",
    faceId: "preview",
    ring: [
      [-40, -35],
      [40, -35],
      [40, 35],
      [-40, 35]
    ],
    margin: 5,
    rng: makeRng("bv-friary"),
    maxScale: 1,
    minScale: 1
  })!.monastery;
}

function shape(ring: Point[], holes: Point[][] = []): THREE.Shape {
  const result = new THREE.Shape(ring.map(p => new THREE.Vector2(...p)));
  result.holes = holes.map(hole => new THREE.Path(hole.map(p => new THREE.Vector2(...p))));
  return result;
}

/** The actual CE footprints determine every wing, opening and roof ridge. No assembly-wide stretching. */
export function createFriary(plan: Monastery = friaryPreviewPlan(), elevation = 0, foundationBottom = elevation) {
  const k = new ModelKit("mendicant-friary");
  const nave = plan.buildings.find(building => building.role === "church");
  const ridge = nave?.ridge;
  const azimuth = ridge ? Math.atan2(ridge[1][1] - ridge[0][1], ridge[1][0] - ridge[0][0]) : 0;
  const across = nave?.polygon.map(p => -p[0] * Math.sin(azimuth) + p[1] * Math.cos(azimuth)) ?? [0, 10];
  const scale = (Math.max(...across) - Math.min(...across)) / 10;
  const churchHeight = 7.2 * scale;
  const churchTop = churchHeight + 5 * scale * Math.tan((32 * Math.PI) / 180);
  const slab = (name: string, ring: Point[], holes: Point[][], y: number, height: number, surface: Surface) => {
    const mesh = k.add(
      name,
      new THREE.ExtrudeGeometry(shape(ring, holes), { depth: height, bevelEnabled: false }),
      surface
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
  };
  if (foundationBottom < elevation - 0.01)
    slab("precinct-foundation", plan.precinct, [], foundationBottom, elevation - foundationBottom, "stone");
  for (const court of plan.courts)
    slab(`friary-${court.kind}`, court.polygon, [], elevation + 0.01, 0.03, court.kind === "yard" ? "earth" : "green");
  for (const bed of plan.beds) slab("herb-bed", bed, [], elevation + 0.04, 0.15 * scale, "earth");
  for (const [index, building] of plan.buildings.entries()) {
    if (building.role === "crossing-tower") {
      const center = building.polygon.reduce<Point>(
        (a, p) => [a[0] + p[0] / building.polygon.length, a[1] + p[1] / building.polygon.length],
        [0, 0]
      );
      const bellcote = new ModelKit("friary-bellcote");
      const top = churchTop + 2 * scale;
      for (const x of [-1.2, 1.2])
        for (const z of [-1.2, 1.2])
          bellcote.box(
            "bellcote-post",
            [x * scale, (churchHeight + top) / 2, z * scale],
            [0.18 * scale, top - churchHeight, 0.18 * scale]
          );
      bellcote.beam(
        "bell-yoke",
        [-1.2 * scale, top - 0.2 * scale, 0],
        [1.2 * scale, top - 0.2 * scale, 0],
        0.15 * scale
      );
      bellcote.roof(0, 0, 3 * scale, 3 * scale, top, 0.65 * scale, "tile");
      bellcote.cylinder("friary-bell", [0, churchTop + scale, 0], 0.3 * scale, 0.6 * scale, "iron", 0.18 * scale);
      const model = bellcote.finish();
      model.group.rotation.y = azimuth;
      k.attach(model, planVertex(center, elevation));
      continue;
    }
    const sacred = building.role === "church" || building.role === "apse";
    const direction = building.ridge
      ? Math.atan2(building.ridge[1][1] - building.ridge[0][1], building.ridge[1][0] - building.ridge[0][0])
      : Math.atan2(building.polygon[1][1] - building.polygon[0][1], building.polygon[1][0] - building.polygon[0][0]);
    const gatehouse = building.role === "gatehouse";
    const clearance = gatehouse ? Math.max(2.1, 2.6 * scale) : 0;
    if (gatehouse) {
      const center = building.polygon.reduce<Point>((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
      const width = Math.hypot(
        building.polygon[1][0] - building.polygon[0][0],
        building.polygon[1][1] - building.polygon[0][1]
      );
      const depth = Math.hypot(
        building.polygon[2][0] - building.polygon[1][0],
        building.polygon[2][1] - building.polygon[1][1]
      );
      const pier = (width - Math.min(3.4, width * 0.65)) / 2;
      for (const side of [-1, 1]) {
        const x = (side * (width - pier)) / 2;
        const column = k.box(
          "gatehouse-pier",
          planVertex(
            [center[0] + x * Math.cos(direction), center[1] + x * Math.sin(direction)],
            elevation + clearance / 2
          ),
          [pier, clearance, depth],
          "stone"
        );
        column.rotation.y = direction;
      }
    }
    const part: StructureMassing = {
      id: `${plan.id}:${index}`,
      kind: "landmark",
      name: plan.name,
      material: "stone",
      footprint: building.polygon,
      heightMeters: (sacred ? 7.2 : 5.4) * scale - clearance,
      baseElevationMeters: elevation + clearance,
      roof: building.role === "apse" ? "hip" : "gable",
      roofPitchDeg: 32,
      roofMaterial: sacred ? "slate" : "tile",
      ridgeAzimuth: direction,
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    };
    const model = createStructureMassing([part]);
    // Each body / roof batch has one color. Keep it on the material for BV's SVG projections as well.
    for (const mesh of model.pickables) {
      const material = mesh.material as THREE.MeshLambertMaterial;
      const colors = mesh.geometry.getAttribute("color");
      if (colors) material.color.fromBufferAttribute(colors, 0);
      material.vertexColors = false;
      mesh.geometry.deleteAttribute("color");
    }
    model.group.name = `friary-${building.role}`;
    if (building === nave && model.pickables[1]) model.pickables[1].name = "pitched-roof";
    k.attach(model, [0, 0, 0]);
    if (building.ridge && (building.role === "church" || building.role === "range")) {
      const u: Point = [Math.cos(direction), Math.sin(direction)],
        v: Point = [-u[1], u[0]];
      const along = building.polygon.map(p => p[0] * u[0] + p[1] * u[1]);
      const across = building.polygon.map(p => p[0] * v[0] + p[1] * v[1]);
      const min = Math.min(...along),
        max = Math.max(...along);
      const rows = sacred ? [4.7] : [1.7, 4];
      for (let x = min + 2.5 * scale; x < max - 1.5 * scale; x += 4 * scale) {
        for (const side of [Math.min(...across) - 0.012, Math.max(...across) + 0.012])
          for (const y of rows) {
            const window = k.box(
              "friary-window",
              planVertex([x * u[0] + side * v[0], x * u[1] + side * v[1]], elevation + y * scale),
              [0.55 * scale, (sacred ? 1.8 : 0.9) * scale, 0.025],
              "dark"
            );
            window.rotation.y = direction;
          }
      }
    }
  }
  if (plan.walk) {
    const { outer, garth } = plan.walk;
    slab("cloister-floor", outer, [garth], elevation + 0.04, 0.12 * scale, "stone");
    for (let i = 0; i < garth.length; i++) {
      const a = garth[i],
        b = garth[(i + 1) % garth.length];
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (2.8 * scale)));
      for (let j = 0; j < count; j++) {
        const point: Point = [a[0] + ((b[0] - a[0]) * j) / count, a[1] + ((b[1] - a[1]) * j) / count];
        k.cylinder("cloister-column", planVertex(point, elevation + 1.4 * scale), 0.13 * scale, 2.8 * scale, "stone");
      }
      const next = (i + 1) % garth.length;
      const vertices = [
        planVertex(outer[i], elevation + 3.3 * scale),
        planVertex(outer[next], elevation + 3.3 * scale),
        planVertex(garth[next], elevation + 2.8 * scale),
        planVertex(garth[i], elevation + 2.8 * scale)
      ];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [0, 1, 2, 0, 2, 3].flatMap(index => vertices[index]),
          3
        )
      );
      geometry.computeVertexNormals();
      k.add("cloister-roof", geometry, "tile");
    }
  }
  // The saved wall is an OPEN polyline: never join its last point back to its first.
  for (let i = 1; i < plan.wall.length; i++) {
    const a = plan.wall[i - 1],
      b = plan.wall[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-6) continue;
    const wall = k.box(
      "friary-precinct-wall",
      planVertex([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], elevation + 0.9 * scale),
      [length, 1.8 * scale, 0.5 * scale],
      "stone"
    );
    wall.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
  }
  for (const tree of plan.trees) {
    const model = createLandscapeTree("garden_parkland");
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    const radiusScale = tree.radius / (Math.max(size.x, size.z) / 2);
    // ModelKit.attach sets a uniform scale, so attach before applying the crown dimensions.
    k.attach(model, planVertex(tree.at, elevation));
    model.group.scale.set(radiusScale, Math.min(1, scale), radiusScale);
  }
  if (plan.well) k.attach(createMedievalWellModel(), planVertex(plan.well, elevation));
  return k.finish();
}
