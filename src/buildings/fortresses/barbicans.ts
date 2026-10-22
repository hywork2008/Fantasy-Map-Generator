import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { ModelKit } from "../medieval/modelKit";

export type BarbicanPoint = readonly [number, number];
export interface BarbicanDefinition {
  id: string;
  name: string;
  period: string;
  note: string;
  /** Wall centerline, metres in the X/Z ground plane; closed implicitly. */
  circuit: readonly BarbicanPoint[];
  /** Gate indices refer to the circuit edge beginning at that vertex. */
  outerGate: number;
  innerGate: number;
  /** Walkable approach from the field to the castle connection at negative Z. */
  route: readonly BarbicanPoint[];
  towers: readonly BarbicanPoint[];
  reference: { title: string; url: string };
}

const circle = Array.from({ length: 24 }, (_, i): BarbicanPoint => {
  const angle = ((i + 0.5) * Math.PI * 2) / 24;
  return [14 * Math.sin(angle), 14 * Math.cos(angle)];
});
// Replace the rear chord with an open-neck connection, retaining a circular forework.
const circularCircuit = [...circle.slice(0, 12), [1.83, -23], [-1.83, -23], ...circle.slice(12)] as BarbicanPoint[];

export const BARBICANS: readonly BarbicanDefinition[] = [
  {
    id: "rectangular",
    name: "Barbican · Rectangular forecourt",
    period: "High medieval Europe",
    note: "Compact walled forecourt with a twin-drum outer gate and a straight approach to the castle gate. Open sky above the defended approach; taller gate towers overlook the lower curtains.",
    circuit: [
      [-7, -10],
      [7, -10],
      [7, 9],
      [-7, 9]
    ],
    outerGate: 2,
    innerGate: 0,
    route: [
      [0, 15],
      [0, -15]
    ],
    towers: [
      [-4.8, 9],
      [4.8, 9]
    ],
    reference: {
      title: "Historic England · Lewes Castle barbican",
      url: "https://historicengland.org.uk/listing/the-list/list-entry/1043895"
    }
  },
  {
    id: "horseshoe",
    name: "Barbican · Horseshoe side entry",
    period: "High medieval Europe",
    note: "D-shaped forework with a lateral outer entrance. The approach turns inside the open court before reaching the rear castle connection, avoiding a straight run through both gates.",
    circuit: [
      [-10, -8],
      [10, -8],
      [10, 0],
      [8.66, 5],
      [5, 8.66],
      [0, 10],
      [-5, 8.66],
      [-8.66, 5],
      [-10, 0]
    ],
    outerGate: 1,
    innerGate: 0,
    route: [
      [16, -4],
      [5, -4],
      [0, 0],
      [0, -14]
    ],
    towers: [
      [-10, -9],
      [10, -9]
    ],
    reference: {
      title: "English Heritage · Scarborough Castle entrance defenses",
      url: "https://www.english-heritage.org.uk/visit/places/scarborough-castle/history/description/"
    }
  },
  {
    id: "polygonal",
    name: "Barbican · Polygonal bent approach",
    period: "High to late medieval Europe",
    note: "Faceted forecourt with an oblique outer gate and a bent approach to the rear gate. Flanking towers protect the exposed front corners; the open court remains readable in plan.",
    circuit: [
      [-7, -11],
      [7, -11],
      [11, 0],
      [6, 10],
      [-6, 10],
      [-11, 0]
    ],
    outerGate: 2,
    innerGate: 0,
    route: [
      [14, 8],
      [8.5, 5],
      [0, 1],
      [0, -17]
    ],
    towers: [
      [6, 10],
      [-6, 10]
    ],
    reference: {
      title: "Cadw · Conwy Castle",
      url: "https://cadwpublic-api.azurewebsites.net/reports/sam/FullReport?id=3411&lang=en"
    }
  },
  {
    id: "circular-neck",
    name: "Barbican · Circular court and neck",
    period: "Late medieval Europe",
    note: "Large round forework with a narrow fortified neck leading back to the castle. An offset outer entrance forces a turn in the court. A generic stone interpretation, not a reconstruction of Krakow's brick barbican or its artillery details.",
    circuit: circularCircuit,
    outerGate: 3,
    innerGate: 12,
    route: [
      [17.2, 9.95],
      [12.02, 6.94],
      [0, 0],
      [0, -28]
    ],
    towers: [],
    reference: { title: "Museum of Krakow · Barbican", url: "https://muzeumkrakowa.pl/en/branches/barbican" }
  }
];

export const BARBICAN_WALL = { thickness: 1.4, height: 6, gateWidth: 3.4, clearance: 3.1 } as const;

/** Standalone meter-scale foreworks. Negative Z connects to a separately placed castle gate. */
export function createBarbican(definition: BarbicanDefinition): CityStructureMeshes {
  const kit = new ModelKit(`barbican-${definition.id}`);
  const { thickness, height, gateWidth, clearance } = BARBICAN_WALL;
  const halfGate = gateWidth / 2;
  const area = definition.circuit.reduce((sum, a, i) => {
    const b = definition.circuit[(i + 1) % definition.circuit.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const outward = area < 0 ? 1 : -1;

  function wall(index: number, gate: boolean) {
    const a = definition.circuit[index];
    const b = definition.circuit[(index + 1) % definition.circuit.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const origin = new THREE.Vector3((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
    const first = kit.pickables.length;
    // Intersect adjacent offset centerlines so faceted curtains have no wedge-shaped gaps.
    function corner(vertex: number, offset: number): THREE.Vector3 {
      const count = definition.circuit.length;
      const p = definition.circuit[vertex % count];
      const before = definition.circuit[(vertex + count - 1) % count];
      const after = definition.circuit[(vertex + 1) % count];
      const incoming = new THREE.Vector2(p[0] - before[0], p[1] - before[1]).normalize();
      const outgoing = new THREE.Vector2(after[0] - p[0], after[1] - p[1]).normalize();
      const factor = offset / (1 + incoming.dot(outgoing));
      return new THREE.Vector3(p[0] - (incoming.y + outgoing.y) * factor, 0, p[1] + (incoming.x + outgoing.x) * factor)
        .sub(origin)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    }
    function prism(name: string, start: number, end: number, lo: number, hi: number, base: number, rise: number) {
      const point = (x: number, offset: number) =>
        x === -length / 2
          ? corner(index, offset)
          : x === length / 2
            ? corner(index + 1, offset)
            : new THREE.Vector3(x, 0, offset);
      const points = [point(start, lo), point(end, lo), point(end, hi), point(start, hi)];
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.z)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: rise, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      kit.add(name, geometry, "stone").position.y = base;
    }
    if (gate) {
      prism("gate-pier", -length / 2, -halfGate, -thickness / 2, thickness / 2, 0, height);
      prism("gate-pier", halfGate, length / 2, -thickness / 2, thickness / 2, 0, height);
      // Concave arch soffit: the opening is geometry, not a dark decal.
      const arch = new THREE.Shape();
      arch.moveTo(-halfGate, height);
      arch.lineTo(halfGate, height);
      arch.lineTo(halfGate, clearance);
      arch.absarc(0, clearance, halfGate, 0, Math.PI, false);
      arch.lineTo(-halfGate, height);
      const geometry = new THREE.ExtrudeGeometry(arch, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
      geometry.translate(0, 0, -thickness / 2);
      kit.add("gate-arch", geometry, "stone");
      // Open leaves lie against the sides of the passage and preserve cart clearance.
      for (const side of [-1, 1]) {
        kit.box("open-gate-leaf", [side * (halfGate - 0.08), 1.45, -0.95 * outward], [0.12, 2.9, 1.65], "oak");
        for (const y of [0.55, 2.35])
          kit.box("gate-iron-strap", [side * (halfGate - 0.15), y, -0.95 * outward], [0.035, 0.12, 1.6], "iron");
      }
    } else prism("curtain", -length / 2, length / 2, -thickness / 2, thickness / 2, 0, height);
    // Continuous outer breastwork and alternate merlons leave an inner wall walk.
    prism("parapet", -length / 2, length / 2, outward * (thickness / 2 - 0.44), (outward * thickness) / 2, height, 0.6);
    const count = Math.max(1, Math.round(length / 1.65));
    for (let i = 0; i < count; i++)
      kit.box(
        "merlon",
        [-length / 2 + ((i + 0.5) * length) / count, height + 0.95, outward * (thickness / 2 - 0.22)],
        [(length / count) * 0.52, 0.7, 0.44],
        "stone"
      );
    for (const mesh of kit.pickables.slice(first)) {
      mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(origin);
      mesh.rotation.y = angle;
    }
  }

  for (let i = 0; i < definition.circuit.length; i++) wall(i, i === definition.outerGate || i === definition.innerGate);

  for (const [x, z] of definition.towers) {
    const radius = 2.7;
    // Hollow towers expose their fighting platforms from above.
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, radius - 0.85, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const shell = new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: false, curveSegments: 24 });
    shell.rotateX(-Math.PI / 2);
    const tower = kit.add("flanking-tower", shell, "stone");
    tower.position.set(x, 0, z);
    kit.cylinder("tower-platform", [x, 7.1, z], radius - 0.84, 0.2, "stone", radius - 0.84, 24);
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const merlon = kit.box(
        "tower-merlon",
        [x + (radius - 0.32) * Math.sin(angle), 8.4, z + (radius - 0.32) * Math.cos(angle)],
        [0.72, 0.8, 0.64],
        "stone"
      );
      merlon.rotation.y = angle;
    }
    // Timber access stair to the raised fighting platform, within the hollow drum.
    for (let i = 0; i < 23; i++) {
      const angle = (i * Math.PI) / 12;
      const step = kit.box(
        "tower-stair",
        [x + 1.25 * Math.sin(angle), (i + 1) * 0.3, z + 1.25 * Math.cos(angle)],
        [0.9, 0.16, 0.44],
        "oak"
      );
      step.rotation.y = angle;
    }
  }
  return kit.finish();
}
