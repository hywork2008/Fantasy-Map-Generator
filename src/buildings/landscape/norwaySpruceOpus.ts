import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

const UP = new THREE.Vector3(0, 1, 0);
const HEIGHT = 12;
/** Lowest live whorl, shared by every branching form. */
const CROWN_BASE = 1.7;
const WHORLS = 17;
const LEADER_BASE = 10.9;

/**
 * Branching forms of Picea abies (Priehäusser's Kamm-, Bürsten- and Plattenfichte). Comb spruce of
 * lowland central Europe hangs curtains of branchlets from arching limbs; brush and plate spruce of
 * boreal and high-montane stands climb 10-30 degrees above horizontal with short or no pendants,
 * in a narrower crown that sheds snow.
 */
export type SpruceForm = "comb" | "brush" | "plate";
interface FormShape {
  /** Widest crown reach at the lowest whorl, metres. */
  reach: number;
  /** Limb angle leaving the stem, lowest and highest whorl, radians above horizontal. */
  start: readonly [number, number];
  /** Limb angle arriving at the tip. */
  tip: readonly [number, number];
  /** Tip height relative to the origin, per metre of limb. */
  rise: readonly [number, number];
  /** Scale of hanging comb branchlets; zero for plate spruce. */
  hang: number;
  /** Scale of each limb's flat spray, wider where nothing hangs below it. */
  spray: number;
}
const FORMS: Record<SpruceForm, FormShape> = {
  comb: { reach: 2.75, start: [-0.32, 0.7], tip: [0.42, 0.8], rise: [-0.3, 0.55], hang: 1, spray: 1 },
  brush: { reach: 2.4, start: [0.1, 0.75], tip: [0.35, 0.8], rise: [-0.04, 0.6], hang: 0.4, spray: 1.12 },
  plate: { reach: 2.1, start: [0.26, 0.8], tip: [0.3, 0.75], rise: [0.14, 0.65], hang: 0, spray: 1.3 }
};

function generator(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Crown radius at a height: the narrow, nearly straight-sided cone of Picea abies. */
function reachAt(y: number, reach: number) {
  const t = THREE.MathUtils.clamp((y - CROWN_BASE) / (HEIGHT - CROWN_BASE), 0, 1);
  return reach * (1 - t) ** 0.95;
}

/** Outward normal of the crown cone, so separate sprays shade as one dark surface. */
function crownNormal(point: THREE.Vector3, target: THREE.Vector3) {
  target.set(point.x, 0, point.z);
  const distance = target.length();
  if (distance > 1e-6) target.divideScalar(distance);
  return target.addScaledVector(UP, 0.45).normalize();
}

interface Sample {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
}

/** Points along a primary branch: out of the trunk, sagging in the lower crown, tip turned up. */
function branchCurve(
  shape: FormShape,
  origin: THREE.Vector3,
  azimuth: number,
  length: number,
  rise: number,
  h: number,
  steps: number
) {
  const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
  const direction = (angle: number) => out.clone().multiplyScalar(Math.cos(angle)).addScaledVector(UP, Math.sin(angle));
  const start = THREE.MathUtils.lerp(...shape.start, h ** 1.1);
  const tip = THREE.MathUtils.lerp(...shape.tip, h);
  const end = origin
    .clone()
    .addScaledVector(out, length)
    .addScaledVector(UP, length * rise);
  const curve = new THREE.CubicBezierCurve3(
    origin,
    origin.clone().addScaledVector(direction(start), length * 0.45),
    end.clone().addScaledVector(direction(tip), -length * 0.35),
    end
  );
  return Array.from({ length: steps + 1 }, (_, i): Sample => {
    const t = i / steps;
    return { point: curve.getPoint(t), tangent: curve.getTangent(t) };
  });
}

/**
 * Claude Opus 5.5's high tier for Norway spruce (Picea abies), modelled as the tree grows: a
 * straight leader carrying annual whorls of five or six limbs plus shorter interwhorl limbs.
 * Lower limbs dip from the trunk and turn up at the tip; upper limbs climb. Needles live only on
 * the outer part of each limb, as a flat fringed spray with comb-like branchlets hanging from it,
 * so the crown is a dark shell over bare inner wood. Pendulous cones hang in the upper crown and
 * a few dead stubs remain below the live crown.
 */
export function createNorwaySpruceOpus(form: SpruceForm = "comb", quality: TreeQuality = "high"): CityStructureMeshes {
  if (quality === "low") return createNorwaySpruceOpusLow(form);
  const ultra = quality === "ultra",
    medium = quality === "medium";
  const shape = FORMS[form];
  const random = generator(61403);
  const woodPositions: number[] = [],
    woodColors: number[] = [];
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color(),
    faceNormal = new THREE.Vector3(),
    outward = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3();

  /** One needle triangle; `light` is per vertex, `hue` shifts toward fresh shoots when positive. */
  const needle = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    light: readonly [number, number, number],
    hue = 0
  ) => {
    faceNormal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    crownNormal(a.clone().add(b).add(c).divideScalar(3), outward);
    // Wind each face toward the outside so DoubleSide lighting keeps the outer surface lit.
    const vertices = faceNormal.dot(outward) < 0 ? [a, c, b] : [a, b, c];
    const shades = faceNormal.dot(outward) < 0 ? [light[0], light[2], light[1]] : light;
    if (faceNormal.dot(outward) < 0) faceNormal.negate();
    vertices.forEach((p, i) => {
      crownNormal(p, outward);
      normal.copy(faceNormal).multiplyScalar(0.4).addScaledVector(outward, 0.6).addScaledVector(UP, 0.1).normalize();
      // The crown interior and its lower reaches stay in shade.
      const depth = THREE.MathUtils.smoothstep(
        Math.hypot(p.x, p.z) / Math.max(0.3, reachAt(p.y, shape.reach)),
        0.35,
        1
      );
      const height = THREE.MathUtils.clamp((p.y - CROWN_BASE) / (HEIGHT - CROWN_BASE), 0, 1);
      color.setHSL(0.36 - hue * 0.07, 0.4 + hue * 0.12, (0.075 + 0.08 * depth + 0.035 * height) * shades[i]);
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
    });
  };

  const woodTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, rgb: THREE.Color) => {
    for (const p of [a, b, c]) {
      // Wood under the needles sits in the crown's deep shade; the bare bole below it does not.
      const below = THREE.MathUtils.smoothstep(p.y, CROWN_BASE - 0.6, CROWN_BASE + 0.4);
      const depth = THREE.MathUtils.smoothstep(Math.hypot(p.x, p.z) / Math.max(0.3, reachAt(p.y, shape.reach)), 0.2, 1);
      const shade = THREE.MathUtils.lerp(1, 0.4 + 0.45 * depth, below);
      woodPositions.push(p.x, p.y, p.z);
      woodColors.push(rgb.r * shade, rgb.g * shade, rgb.b * shade);
    }
  };
  /** A tapered tube through samples, four-sided: limbs are mostly seen through gaps in the needles. */
  const tube = (points: THREE.Vector3[], from: number, to: number, rgb: THREE.Color, sides = 4) => {
    const rings = points.map((p, i) => {
      const forward = (points[i + 1] ?? p)
        .clone()
        .sub(points[i - 1] ?? p)
        .normalize();
      const side = new THREE.Vector3().crossVectors(forward, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const lift = new THREE.Vector3().crossVectors(side, forward).normalize();
      const radius = THREE.MathUtils.lerp(from, to, i / (points.length - 1));
      return Array.from({ length: sides }, (_, k) => {
        const angle = (k / sides) * Math.PI * 2;
        return p
          .clone()
          .addScaledVector(side, Math.cos(angle) * radius)
          .addScaledVector(lift, Math.sin(angle) * radius);
      });
    });
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 0; k < sides; k++) {
        const a = rings[i][k],
          b = rings[i][(k + 1) % sides],
          c = rings[i + 1][k],
          d = rings[i + 1][(k + 1) % sides];
        woodTriangle(a, c, b, rgb);
        woodTriangle(b, c, d, rgb);
      }
  };

  /** A comb branchlet: two crossed, tapering needle blades hanging from the spray's edge. */
  const pendant = (top: THREE.Vector3, hang: THREE.Vector3, across: THREE.Vector3, width: number) => {
    const length = hang.length();
    const down = hang.clone().normalize();
    const along = new THREE.Vector3().crossVectors(down, across).normalize();
    const middle = top.clone().addScaledVector(down, length * 0.55);
    const bottom = top.clone().addScaledVector(down, length);
    for (const blade of [across, along]) {
      const a = top.clone().addScaledVector(blade, width),
        b = top.clone().addScaledVector(blade, -width),
        c = middle.clone().addScaledVector(blade, width * 0.75),
        d = middle.clone().addScaledVector(blade, -width * 0.75);
      needle(a, b, c, [0.95, 0.95, 0.85]);
      needle(b, d, c, [0.95, 0.85, 0.85]);
      needle(c, d, bottom, [0.85, 0.85, 0.7]);
    }
  };

  /**
   * Needles on the outer part of one limb: a flat, slightly arched spray whose fringe of side
   * shoots points forward along the limb, plus branchlets hanging from its edges.
   */
  const spray = (samples: Sample[], first: number, width: number, hangLength: number) => {
    const tint = random() - 0.5;
    const rows = samples.slice(first).map(({ point, tangent }, i, rows) => {
      const t = rows.length > 1 ? i / (rows.length - 1) : 1;
      const side = new THREE.Vector3().crossVectors(tangent, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const lift = new THREE.Vector3().crossVectors(side, tangent).normalize();
      // Widest past mid-limb, narrowing to the leading shoot at the tip.
      const w = width * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85))) * (1 - 0.65 * t ** 3);
      const ridge = point.clone().addScaledVector(lift, 0.04);
      return {
        t,
        tangent,
        side,
        lift,
        w,
        ridge,
        left: point
          .clone()
          .addScaledVector(side, w)
          .addScaledVector(lift, -0.32 * w),
        right: point
          .clone()
          .addScaledVector(side, -w)
          .addScaledVector(lift, -0.32 * w)
      };
    });
    const ridgeLight = 1.18 + tint * 0.1,
      edgeLight = 0.92 + tint * 0.1;
    for (let i = 0; i < rows.length - 1; i++) {
      const r = rows[i],
        n = rows[i + 1];
      const step = r.ridge.distanceTo(n.ridge);
      for (const [edge, next, sign] of [
        [r.left, n.left, 1],
        [r.right, n.right, -1]
      ] as const) {
        needle(r.ridge, n.ridge, next, [ridgeLight, ridgeLight, edgeLight]);
        needle(r.ridge, next, edge, [ridgeLight, edgeLight, edgeLight]);
        // Side shoots fringe the spray, angled forward like the shoots of a real spruce limb.
        for (const [from, to] of ultra
          ? ([
              [0, 1 / 3],
              [1 / 3, 2 / 3],
              [2 / 3, 1]
            ] as const)
          : medium
            ? ([[0, 1]] as const)
            : ([
                [0, 0.5],
                [0.5, 1]
              ] as const)) {
          const a = edge.clone().lerp(next, from),
            b = edge.clone().lerp(next, to);
          const tooth = a
            .clone()
            .lerp(b, 0.5)
            .addScaledVector(r.side, sign * r.w * (0.32 + random() * 0.16))
            .addScaledVector(r.tangent, step * 0.45)
            .addScaledVector(r.lift, -r.w * 0.2);
          needle(a, b, tooth, [edgeLight, edgeLight, 1.05], 0.35);
          if (hangLength > 0.05) {
            const hang = new THREE.Vector3((random() - 0.5) * 0.12, -1, (random() - 0.5) * 0.12)
              .addScaledVector(r.side, sign * 0.2)
              .addScaledVector(r.tangent, 0.1)
              .setLength(hangLength * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + r.t * 0.8))) * (0.6 + random() * 0.6));
            pendant(a.clone().lerp(b, 0.5), hang, r.tangent, 0.045 + hangLength * 0.03);
          }
        }
      }
    }
    // The leading shoot extends past the last row with a lighter, fresh tip.
    const last = rows[rows.length - 1];
    const tip = last.ridge.clone().addScaledVector(last.tangent, 0.22 + last.w * 0.6);
    needle(last.ridge, last.left, tip, [ridgeLight, edgeLight, 1.25], 0.6);
    needle(last.ridge, tip, last.right, [ridgeLight, 1.25, edgeLight], 0.6);
  };

  const bark = new THREE.Color(0x5e4433),
    deadWood = new THREE.Color(0x6f6658),
    coneColor = new THREE.Color(0x7a4c2c);
  const cones: { at: THREE.Vector3; size: number }[] = [];

  /** One live limb with its wood (inner part only, the rest is under needles) and its spray. */
  const limb = (y: number, azimuth: number, scale: number) => {
    const h = THREE.MathUtils.clamp((y - CROWN_BASE) / (LEADER_BASE - CROWN_BASE), 0, 1);
    const length = Math.max(0.3, reachAt(y, shape.reach) * scale * (0.88 + random() * 0.24));
    const rise = THREE.MathUtils.lerp(...shape.rise, h ** 1.2) + (random() - 0.5) * 0.08;
    const steps = medium
      ? THREE.MathUtils.clamp(Math.round(length * 1.4), 2, 3)
      : THREE.MathUtils.clamp(Math.round(length * (ultra ? 4.4 : 2.6)), 3, ultra ? 13 : 8);
    const samples = branchCurve(shape, new THREE.Vector3(0, y, 0), azimuth, length, rise, h, steps);
    const points = samples.map(s => s.point);
    // Medium: the limb wood is never seen past the needles at the distances it is drawn.
    if (!medium)
      tube(points.slice(0, Math.max(2, steps)), 0.05 * (length / shape.reach) + 0.012, 0.012, bark, ultra ? 6 : 4);
    // Older limbs have shed their inner needles; young ones near the top are clothed almost to the stem.
    const first = Math.min(steps - 2, Math.round(steps * THREE.MathUtils.lerp(0.42, 0.12, h)));
    const width = shape.spray * (0.16 + 0.24 * (length / shape.reach));
    // Comb branchlets hang longest mid-crown, where the limbs are long and well lit.
    const hangLength = shape.hang * (0.12 + 0.62 * (1 - h) ** 1.1) * Math.min(1, length / 1.4);
    spray(samples, first, width, hangLength);
    // Ultra: second-order shoots fan out in the limb's plane, as on the flat sprays of plate spruce.
    if (ultra && length > 0.7)
      for (let i = first + 1; i < steps - 1; i += 2)
        for (const sign of [-1, 1]) {
          const { point, tangent } = samples[i];
          const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();
          const t = i / steps;
          const shoot = Math.min(0.9, length * 0.32 * (1.15 - t)) * (0.8 + random() * 0.4);
          const direction = tangent
            .clone()
            .addScaledVector(side, sign * 1.05)
            .addScaledVector(UP, 0.12)
            .normalize();
          const twig = Array.from({ length: 4 }, (_, k): Sample => {
            const along = shoot * (k / 3);
            return {
              point: point
                .clone()
                .addScaledVector(direction, along)
                .addScaledVector(UP, -0.08 * (k / 3) ** 2),
              tangent: direction
            };
          });
          tube(
            twig.slice(0, 3).map(s => s.point),
            0.014,
            0.006,
            bark,
            3
          );
          spray(twig, 1, width * 0.45, hangLength * 0.5);
        }
    if (!medium && h > 0.55 && random() < (ultra ? 0.6 : 0.35)) {
      const at = samples[steps - 1].point;
      cones.push({
        at: at.clone().addScaledVector(samples[steps - 1].tangent, -0.15),
        size: 0.85 + random() * 0.3
      });
    }
  };

  const spacing = (LEADER_BASE - CROWN_BASE) / (WHORLS - 1);
  let turn = random() * Math.PI * 2;
  for (let level = 0; level < WHORLS; level++) {
    const y = CROWN_BASE + level * spacing + (random() - 0.5) * 0.08;
    const arms = level % 3 === 1 ? 5 : 6;
    turn += 2.4;
    for (let arm = 0; arm < arms; arm++) limb(y, turn + (arm / arms) * Math.PI * 2 + (random() - 0.5) * 0.4, 1);
    // Interwhorl limbs: shorter, between the annual whorls, filling the cone's flank.
    if (level < WHORLS - 1)
      for (let arm = 0, count = ultra ? 4 : medium ? 0 : 3; arm < count; arm++)
        limb(
          y + spacing * (0.35 + random() * 0.35),
          turn + 1 + (arm / count) * Math.PI * 2 + random() * 0.6,
          0.5 + random() * 0.15
        );
  }
  // The upper stem keeps its needles for several years, so the leader reads as a bristly spire.
  // Alternate widths serrate the outline: whorls of short needled shoots, not a smooth blade.
  const spireRows = medium ? 5 : 11;
  const spire = Array.from({ length: spireRows }, (_, i): [THREE.Vector3, number] => {
    const t = i / (spireRows - 1);
    return [new THREE.Vector3(0, THREE.MathUtils.lerp(8.2, HEIGHT, t), 0), 0.26 * (1 - t) ** 0.8 * (i % 2 ? 0.55 : 1)];
  });
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI + 0.3;
    const across = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    for (let i = 0; i < spire.length - 1; i++) {
      const [a, wa] = spire[i],
        [b, wb] = spire[i + 1];
      const fresh = i / (spire.length - 2);
      const light: [number, number, number] = [1.05, 1.05, 1.1 + 0.2 * fresh];
      needle(
        a.clone().addScaledVector(across, wa),
        a.clone().addScaledVector(across, -wa),
        b.clone().addScaledVector(across, wb),
        light,
        0.3 * fresh
      );
      if (wb > 0)
        needle(
          a.clone().addScaledVector(across, -wa),
          b.clone().addScaledVector(across, -wb),
          b.clone().addScaledVector(across, wb),
          light,
          0.3 * fresh
        );
    }
  }
  // Cones hang from the upper limbs, near their tips.
  for (const { at, size } of cones) {
    const length = 0.15 * size,
      radius = 0.032 * size;
    const top = at.clone().addScaledVector(UP, -0.03);
    const ring = Array.from({ length: 5 }, (_, k) => {
      const angle = (k / 5) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, -length * 0.35, Math.sin(angle) * radius).add(top);
    });
    const bottom = top.clone().addScaledVector(UP, -length);
    for (let k = 0; k < 5; k++) {
      woodTriangle(top, ring[(k + 1) % 5], ring[k], coneColor);
      woodTriangle(ring[k], ring[(k + 1) % 5], bottom, coneColor);
    }
  }
  // Dead, needleless stubs below the live crown, as the lowest limbs die back in shade.
  for (let i = 0; i < (medium ? 0 : 7); i++) {
    const y = 0.9 + (i / 7) * (CROWN_BASE - 1);
    const azimuth = i * 2.39996 + random();
    const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const reach = 0.35 + random() * 0.5;
    tube(
      [
        new THREE.Vector3(0, y, 0),
        new THREE.Vector3(0, y - 0.08, 0).addScaledVector(out, reach * 0.6),
        new THREE.Vector3(0, y - 0.2, 0).addScaledVector(out, reach)
      ],
      0.028,
      0.008,
      deadWood,
      3
    );
  }

  const trunk = createTreeBase(
    [
      { center: [0, 0, 0], radius: 0.31 },
      { center: [0.03, 1.5, 0.01], radius: 0.21 },
      { center: [-0.04, 6, 0.04], radius: 0.12 },
      { center: [0, HEIGHT - 0.3, 0], radius: 0.012 }
    ],
    0.65,
    5
  );
  const stem = trunk.toNonIndexed();
  trunk.dispose();
  stem.deleteAttribute("normal");
  const stemPositions = stem.getAttribute("position");
  const corner = (i: number) => new THREE.Vector3().fromBufferAttribute(stemPositions, i);
  for (let i = 0; i < stemPositions.count; i += 3) woodTriangle(corner(i), corner(i + 1), corner(i + 2), bark);
  stem.dispose();
  const wood = new THREE.BufferGeometry();
  wood.setAttribute("position", new THREE.Float32BufferAttribute(woodPositions, 3));
  wood.setAttribute("color", new THREE.Float32BufferAttribute(woodColors, 3));
  wood.computeVertexNormals();
  const needles = new THREE.BufferGeometry();
  needles.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  needles.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  needles.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const woodMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const needleMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });
  const stemMesh = new THREE.Mesh(wood, woodMaterial);
  stemMesh.name = "spruce-opus-stem-limbs-and-cones";
  const crown = new THREE.Mesh(needles, needleMaterial);
  crown.name = "spruce-opus-needle-sprays";
  const group = new THREE.Group();
  group.name = "norway-spruce";
  group.userData.treeQuality = quality;
  group.add(stemMesh, crown);
  return {
    group,
    pickables: [stemMesh, crown],
    dispose() {
      wood.dispose();
      needles.dispose();
      woodMaterial.dispose();
      needleMaterial.dispose();
    }
  };
}

/**
 * Distant silhouette: one open cone per pair of whorls, its rim a star whose points are the limb
 * tips, so the tiers and the serrated edge of the crown survive at a few hundred triangles.
 */
function createNorwaySpruceOpusLow(form: SpruceForm): CityStructureMeshes {
  const shape = FORMS[form];
  const random = generator(61403);
  const positions: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color();
  const push = (p: THREE.Vector3, light: number) => {
    color.setHSL(0.36, 0.4, light);
    positions.push(p.x, p.y, p.z);
    colors.push(color.r, color.g, color.b);
  };
  const tiers = 8,
    points = 7;
  const spacing = (LEADER_BASE - CROWN_BASE) / tiers;
  for (let tier = 0; tier < tiers; tier++) {
    const y = CROWN_BASE + tier * spacing;
    const h = tier / tiers;
    const reach = reachAt(y, shape.reach);
    // Limb tips sit above or below their whorl as the form's limbs climb or sag.
    const rim = y + reach * THREE.MathUtils.lerp(...shape.rise, h ** 1.2) * 0.6;
    const apex = new THREE.Vector3(
      0,
      tier === tiers - 1 ? HEIGHT : Math.min(HEIGHT - 0.5, Math.max(rim, y) + spacing * 1.6),
      0
    );
    const turn = tier * 2.4 + random();
    const ring = Array.from({ length: points * 2 }, (_, i) => {
      const angle = turn + (i / (points * 2)) * Math.PI * 2;
      const r = reach * (i % 2 ? 0.72 : 1.04);
      return new THREE.Vector3(Math.cos(angle) * r, rim - (i % 2 ? 0.12 : 0), Math.sin(angle) * r);
    });
    for (let i = 0; i < ring.length; i++) {
      push(apex, 0.1 + 0.03 * h);
      push(ring[(i + 1) % ring.length], (i + 1) % 2 ? 0.13 : 0.19);
      push(ring[i], i % 2 ? 0.13 : 0.19);
    }
  }
  const bark = createTreeBase(
    [
      { center: [0, 0, 0], radius: 0.31 },
      { center: [0.03, 1.5, 0.01], radius: 0.21 },
      { center: [0, HEIGHT - 0.3, 0], radius: 0.012 }
    ],
    0.65,
    5
  );
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  foliage.computeVertexNormals();
  const barkMaterial = new THREE.MeshLambertMaterial({ color: 0x5e4433 });
  const needleMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(bark, barkMaterial);
  trunk.name = "spruce-opus-stem";
  const crown = new THREE.Mesh(foliage, needleMaterial);
  crown.name = "spruce-opus-whorl-tiers";
  const group = new THREE.Group();
  group.name = "norway-spruce";
  group.userData.treeQuality = "low";
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      bark.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      needleMaterial.dispose();
    }
  };
}
