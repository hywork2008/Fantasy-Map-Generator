import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createTreeBase } from "./treeBase";

/** Dry-climate trees: an oasis date palm, a flat-crowned savanna umbrella thorn and a cold-desert saxaul. */
export function createAridTree(species: "date_palm" | "umbrella_thorn" | "saxaul"): CityStructureMeshes {
  const palm = species === "date_palm",
    saxaul = species === "saxaul";
  let seed = palm ? 43113 : saxaul ? 43151 : 43127;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  function timber(geometry: THREE.BufferGeometry, shade: (p: THREE.Vector3) => number) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position"),
      rgb: number[] = [],
      v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const c = new THREE.Color(shade(v.fromBufferAttribute(p, i)));
      rgb.push(c.r, c.g, c.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  // Palm trunks keep the diamond scars of cut leaf bases; acacia bark is dark and fissured;
  // saxaul wood is pale grey, twisted and split into fibrous strips.
  const bark = (p: THREE.Vector3) =>
    saxaul
      ? Math.sin(p.y * 17 + Math.atan2(p.z, p.x) * 3) > 0.55
        ? 0x6b6358
        : 0xa59c8c
      : palm
        ? Math.sin(p.y * 11 + Math.atan2(p.z, p.x) * 4) * Math.sin(p.y * 11 - Math.atan2(p.z, p.x) * 4) > 0.25
          ? 0x5a4632
          : 0x8a7155
        : Math.sin(p.y * 23 + p.x * 9) * Math.cos(p.z * 21) > 0.6
          ? 0x2e2620
          : 0x4d4036;
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top = bottom * 0.3, sides = 6) {
    const geometry = new THREE.CylinderGeometry(top, bottom, a.distanceTo(b), sides);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry, bark);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  /** One pinnate frond: an arching rachis with V-raised paired leaflets that shorten towards the tip. */
  function frond(base: THREE.Vector3, azimuth: number, rise: number, length: number, dead: boolean) {
    const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const at = (t: number) =>
      base
        .clone()
        .addScaledVector(out, length * t * Math.cos(rise * (1 - t)))
        .addScaledVector(up, length * (Math.sin(rise) * t - 0.55 * t * t));
    const leaf = new THREE.Color(),
      stalk = new THREE.Color(dead ? 0x7d6a4a : 0x8c8a55);
    const segments = 14;
    for (let i = 0; i < segments; i++) {
      const a = at(i / segments),
        b = at((i + 1) / segments);
      const offset = side.clone().multiplyScalar(0.035 * (1 - i / segments) + 0.008);
      triangle(a.clone().add(offset), b, a.clone().sub(offset), stalk);
      if (i < 2) continue;
      const t = i / segments,
        reach = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.12;
      for (const s of [-1, 1])
        for (const step of [0, 0.5]) {
          const p = a.clone().lerp(b, step);
          const tip = p
            .clone()
            .addScaledVector(side, s * reach)
            .addScaledVector(b.clone().sub(a).normalize(), reach * 0.45)
            .addScaledVector(up, dead ? -reach * 0.9 : reach * 0.35);
          const blade = b
            .clone()
            .sub(a)
            .normalize()
            .multiplyScalar(0.07 + 0.04 * (1 - t));
          if (dead) leaf.setHSL(0.09 + random() * 0.03, 0.35, 0.38 + random() * 0.1);
          else leaf.setHSL(0.22 + random() * 0.05, 0.22 + random() * 0.1, 0.3 + random() * 0.12);
          triangle(p, tip, p.clone().add(blade), leaf);
          triangle(p.clone().add(blade), tip, p.clone().addScaledVector(up, 0.03), leaf);
        }
    }
  }
  /** Tiny bipinnate acacia leaves massed into flat horizontal pads. */
  function pad(center: THREE.Vector3, radius: number, count: number) {
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius;
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * r, (random() - 0.35) * 0.32 * (1 - r / radius), Math.sin(angle) * r));
      const heading = random() * Math.PI * 2,
        size = 0.16 + random() * 0.1;
      const along = new THREE.Vector3(Math.cos(heading), (random() - 0.5) * 0.25, Math.sin(heading)).multiplyScalar(
        size
      );
      const across = new THREE.Vector3(-Math.sin(heading), 0.05, Math.cos(heading)).multiplyScalar(size * 0.45);
      color.setHSL(0.2 + random() * 0.06, 0.3 + random() * 0.12, 0.24 + random() * 0.12);
      triangle(p.clone().sub(along), p.clone().add(across), p.clone().add(along), color);
      triangle(p.clone().sub(along), p.clone().add(along), p.clone().sub(across), color);
    }
  }
  if (palm) {
    const height = 9.7;
    const lean = (y: number) => new THREE.Vector3(0.05 * y + 0.006 * y * y, y, 0.02 * y);
    timber(
      createTreeBase(
        [0, 0.5, 1.5, 4, 7, 9.5, height].map((y, i) => ({
          center: lean(y).toArray() as [number, number, number],
          radius: i === 0 ? 0.42 : i === 1 ? 0.33 : 0.3 - y * 0.006
        })),
        0.5,
        9
      ),
      bark
    );
    const crown = lean(height);
    // Offshoots at the foot are the hallmark of cultivated date palms.
    for (const [angle, scale] of [
      [0.6, 0.45],
      [2.9, 0.32]
    ]) {
      const foot = new THREE.Vector3(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      const top = foot.clone().add(new THREE.Vector3(Math.cos(angle) * 0.25, 1.4 * scale, Math.sin(angle) * 0.25));
      branch(foot, top, 0.16 * scale, 0.11 * scale, 8);
      for (let i = 0; i < 9; i++) frond(top, angle + (i * Math.PI * 2) / 9, 1.05 - (i % 3) * 0.22, 3.2 * scale, false);
    }
    // Leaf bases and the short boot below the live crown.
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.39996,
        y = height - 0.9 + (i / 18) * 0.9;
      const a = lean(y),
        b = a.clone().add(new THREE.Vector3(Math.cos(angle) * 0.45, 0.35, Math.sin(angle) * 0.45));
      branch(a, b, 0.09, 0.05, 5);
    }
    for (let i = 0; i < 30; i++) {
      const tier = i % 3,
        angle = i * 2.39996 + random() * 0.15;
      frond(crown.clone().addScaledVector(up, -0.3 * tier), angle, 1.25 - tier * 0.5, 4.2 + random() * 0.6, false);
    }
    // A few drooping, unpruned old fronds hang beneath the living crown.
    for (let i = 0; i < 6; i++)
      frond(crown.clone().addScaledVector(up, -0.7), i * 1.07 + 0.4, -0.9 - random() * 0.4, 2.6, true);
    // Unripe date clusters on strands among the leaf bases.
    for (let i = 0; i < 4; i++) {
      const angle = i * 1.6 + 0.3;
      const stem = crown.clone().add(new THREE.Vector3(Math.cos(angle) * 0.4, -0.35, Math.sin(angle) * 0.4));
      const end = stem.clone().add(new THREE.Vector3(Math.cos(angle) * 0.55, -0.75, Math.sin(angle) * 0.55));
      branch(stem, end, 0.03, 0.02, 4);
      const fruit = new THREE.Color(0xd09a2a);
      for (let j = 0; j < 24; j++) {
        const p = stem.clone().lerp(end, 0.35 + random() * 0.65);
        p.add(new THREE.Vector3((random() - 0.5) * 0.3, -random() * 0.25, (random() - 0.5) * 0.3));
        triangle(
          p,
          p.clone().add(new THREE.Vector3(0.04, -0.05, 0)),
          p.clone().add(new THREE.Vector3(-0.03, -0.05, 0.03)),
          fruit
        );
      }
    }
  } else if (saxaul) {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.2 },
          { center: [0.06, 0.35, 0.02], radius: 0.15 },
          { center: [0.1, 0.6, -0.03], radius: 0.13 }
        ],
        0.55,
        6
      ),
      bark
    );
    /** Leafless jointed green shoots hanging in loose tassels, the saxaul's photosynthetic "foliage". */
    function tassel(start: THREE.Vector3, azimuth: number) {
      const color = new THREE.Color();
      for (let i = 0; i < 9; i++) {
        const theta = azimuth + (random() - 0.5) * 1.6,
          length = 0.35 + random() * 0.4;
        let p = start.clone();
        const direction = new THREE.Vector3(Math.cos(theta) * 0.6, -0.55 - random() * 0.4, Math.sin(theta) * 0.6)
          .normalize()
          .multiplyScalar(length / 4);
        const side = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta)).multiplyScalar(0.012);
        color.setHSL(0.2 + random() * 0.05, 0.28 + random() * 0.1, 0.3 + random() * 0.1);
        for (let j = 0; j < 4; j++) {
          // Each joint kinks slightly, like the articulated shoots of Haloxylon.
          const q = p
            .clone()
            .add(direction)
            .add(new THREE.Vector3((random() - 0.5) * 0.03, 0, (random() - 0.5) * 0.03));
          triangle(p.clone().add(side), q, p.clone().sub(side), color);
          triangle(p.clone().add(side.clone().applyAxisAngle(direction.clone().normalize(), Math.PI / 2)), q, p, color);
          p = q;
        }
      }
    }
    // Several crooked stems rise from the low trunk, twisting outward into a sparse rounded crown.
    const base = new THREE.Vector3(0.1, 0.6, -0.03);
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.39996 + random() * 0.3;
      let a = base.clone(),
        radius = 0.11;
      for (let step = 0; step < 4; step++) {
        const turn = angle + (random() - 0.5) * 1.1;
        const b = a
          .clone()
          .add(new THREE.Vector3(Math.cos(turn) * 0.55, 0.75 + random() * 0.35 - step * 0.1, Math.sin(turn) * 0.55));
        branch(a, b, radius, radius * 0.7, 6);
        for (let k = 0; k < 3; k++) {
          const twigAngle = turn + (random() - 0.5) * 2.4;
          const t = a.clone().lerp(b, 0.3 + random() * 0.7);
          const twig = t
            .clone()
            .add(new THREE.Vector3(Math.cos(twigAngle) * 0.45, 0.25 + random() * 0.25, Math.sin(twigAngle) * 0.45));
          if (step > 0) {
            branch(t, twig, 0.025, 0.008, 4);
            tassel(twig, twigAngle);
          }
        }
        a = b;
        radius *= 0.7;
      }
      tassel(a, angle);
      tassel(a, angle + Math.PI);
    }
  } else {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.32 },
          { center: [0.05, 0.8, 0], radius: 0.24 },
          { center: [0.12, 1.6, 0.04], radius: 0.21 }
        ],
        0.75,
        6
      ),
      bark
    );
    // The trunk forks low into ascending limbs that fan out into a flat parasol crown.
    const fork = new THREE.Vector3(0.12, 1.6, 0.04);
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5 + random() * 0.5;
      const limbEnd = fork
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * 2.1, 3.3 + random() * 0.8, Math.sin(angle) * 2.1));
      branch(fork, limbEnd, 0.16, 0.09, 8);
      for (let j = 0; j < 4; j++) {
        const theta = angle + (j - 1.5) * 0.55 + (random() - 0.5) * 0.3,
          reach = 1.8 + random() * 2;
        const tip = limbEnd
          .clone()
          .add(new THREE.Vector3(Math.cos(theta) * reach, 1.2 + random() * 0.6, Math.sin(theta) * reach));
        const zig = limbEnd
          .clone()
          .lerp(tip, 0.5)
          .add(new THREE.Vector3((random() - 0.5) * 0.5, -0.15, 0));
        branch(limbEnd, zig, 0.08, 0.05);
        branch(zig, tip, 0.05, 0.015);
        for (let k = 0; k < 3; k++) {
          const t = zig.clone().lerp(tip, 0.3 + k * 0.35);
          const twig = t
            .clone()
            .add(new THREE.Vector3((random() - 0.5) * 1.4, 0.25 + random() * 0.2, (random() - 0.5) * 1.4));
          branch(t, twig, 0.018, 0.006, 4);
          pad(twig, 1.1 + random() * 0.4, 70);
        }
        pad(tip, 1.3, 90);
      }
    }
    pad(new THREE.Vector3(0.2, 7.3, 0), 2.2, 220);
  }
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  foliage.computeVertexNormals();
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });
  const trunk = new THREE.Mesh(barkGeometry, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = palm
    ? "date-palm-leaf-scarred-trunk-and-offshoots"
    : saxaul
      ? "saxaul-twisted-stems"
      : "acacia-forked-limbs";
  crown.name = palm ? "date-palm-pinnate-fronds" : saxaul ? "saxaul-jointed-green-shoots" : "acacia-flat-leaf-pads";
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      barkGeometry.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
