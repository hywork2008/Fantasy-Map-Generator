import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { buildFruitLayer, type FruitAxis, type FruitSite, type FruitSpec } from "./fruitLayer";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import { positionHash, type TreeAppearanceOptions } from "./treeSeasonLayers";

/** Dates on the strands of a branched bunch: yellow khalal ripening to brown tamar (D02). */
const DATE_BUNCHES: FruitSpec = {
  shape: "drupe",
  sizeMeters: 0.038,
  widthRatio: 0.58,
  stalkMeters: 0.008,
  stalkColor: 0xbf8f36,
  cluster: { count: 1, spread: 0 },
  palettes: {
    unripe: [0xd9a521, 0xe2b232, 0xcc9420],
    ripe: [0x5b3418, 0x6a3c1a, 0x4b2a12, 0x7a4a22]
  }
};
/** Bunch stalks left on the palm once the bunches are cut, dried to straw brown. */
const CUT_STALKS: FruitSpec = { ...DATE_BUNCHES, stalkColor: 0x8c7044 };
/** Male inflorescences: dense cream florets on short strands, out of a split brown spathe. */
const MALE_FLOWERS: FruitSpec = {
  shape: "drupe",
  sizeMeters: 0.012,
  widthRatio: 0.8,
  stalkMeters: 0,
  stalkColor: 0xc2a66a,
  cluster: { count: 1, spread: 0 },
  palettes: { unripe: [0xf1e6c0, 0xe8dbad, 0xf6efd6], ripe: [0xf1e6c0, 0xe8dbad, 0xf6efd6] }
};

/**
 * Managed palms of the traditional irrigated oasis grove (D01, D03): dead fronds and the lowest
 * ring cut each year, leaf bases trimmed to short even stubs, offshoots taken off for planting,
 * and bunches drawn down below the crown. The fruiting female, the male kept to pollinate it and
 * a young palm before bearing, which keeps its offshoots until they are separated.
 */
export type DatePalmForm = "landscape" | "orchard" | "male" | "young";

/**
 * Dry-climate trees: an oasis date palm, a flat-crowned savanna umbrella thorn and a cold-desert
 * saxaul. The palm's dates are triangle markers on four axes (the original model) or, for
 * `fruitForm: "bunches"`, branched bunches in the shared fruit layer, which also draws its seasons.
 */
export function createAridTree(
  species: "date_palm" | "umbrella_thorn" | "saxaul",
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {},
  fruitForm: "markers" | "bunches" = "markers",
  palmForm: DatePalmForm = "landscape"
): CityStructureMeshes {
  const palm = species === "date_palm",
    saxaul = species === "saxaul";
  const managed = palm && palmForm !== "landscape";
  const young = palmForm === "young",
    male = palmForm === "male";
  const bunches = palm && (palmForm === "orchard" || (palmForm === "landscape" && fruitForm === "bunches"));
  const appearance = male
    ? options.appearance === "bloom"
      ? "bloom"
      : "leaf"
    : young
      ? "leaf"
      : options.appearance === "fruit" || options.appearance === "harvested"
        ? options.appearance
        : "unripe";
  const fruitSites: FruitSite[] = [];
  const fruitAxes: FruitAxis[] = [];
  const tier = quality;
  const reduced = tier === "low" || tier === "medium";
  const lobes: CanopyLobe[] = [],
    deadLobes: CanopyLobe[] = [];
  let lowPadPoints: THREE.Vector3[] = [];
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
    if (reduced && bottom < (tier === "low" ? (palm ? 0.045 : 0.07) : 0.045)) return;
    // The palm's leaf bases are invisible at low detail; retain the two living offshoot stems.
    if (palm && tier === "low" && bottom === 0.09) return;
    const geometry = new THREE.CylinderGeometry(
      top,
      bottom,
      a.distanceTo(b),
      reduced ? (tier === "low" ? 3 : 4) : sides,
      1,
      reduced
    );
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
  function frond(base: THREE.Vector3, azimuth: number, rise: number, length: number, dead: boolean, lowVisible = true) {
    const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const at = (t: number) =>
      base
        .clone()
        .addScaledVector(out, length * t * Math.cos(rise * (1 - t)))
        .addScaledVector(up, length * (Math.sin(rise) * t - 0.55 * t * t));
    const leaf = new THREE.Color(),
      stalk = new THREE.Color(dead ? 0x7d6a4a : 0x8c8a55);
    const clouds: THREE.Vector3[][] = [[], []];
    const segments = 14;
    for (let i = 0; i < segments; i++) {
      const a = at(i / segments),
        b = at((i + 1) / segments);
      const offset = side.clone().multiplyScalar(0.035 * (1 - i / segments) + 0.008);
      if (!reduced) triangle(a.clone().add(offset), b, a.clone().sub(offset), stalk);
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
            .multiplyScalar((0.07 + 0.04 * (1 - t)) * (tier === "ultra" ? 1 : 2));
          if (dead) leaf.setHSL(0.09 + random() * 0.03, 0.35, 0.38 + random() * 0.1);
          else leaf.setHSL(0.22 + random() * 0.05, 0.22 + random() * 0.1, 0.3 + random() * 0.12);
          // Always consume the same leaf-color sequence before omitting a leaflet pair.
          if (tier !== "ultra" && step !== 0) continue;
          if (tier === "medium") {
            clouds[t < 0.55 ? 0 : 1].push(p, tip, p.clone().add(blade), p.clone().addScaledVector(up, 0.03));
          } else if (tier !== "low") {
            triangle(p, tip, p.clone().add(blade), leaf);
            triangle(p.clone().add(blade), tip, p.clone().addScaledVector(up, 0.03), leaf);
          }
        }
    }
    if (tier === "medium") {
      for (let i = 0; i < clouds.length; i++) {
        const points = clouds[i];
        if (!points.length) continue;
        // Fit in the frond's sloping frame, avoiding round masses around drooping leaves.
        const tangent = at(i === 0 ? 0.55 : 1)
          .sub(at(i === 0 ? 0.14 : 0.55))
          .normalize();
        const heading = new THREE.Quaternion().setFromAxisAngle(up, -azimuth);
        const slope = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z))
        );
        const frame = heading.multiply(slope);
        const inverse = frame.clone().invert();
        const lobe = fitCanopyLobe(
          points.map(point => point.clone().sub(base).applyQuaternion(inverse)),
          0.65,
          true
        );
        lobe.center.applyQuaternion(frame).add(base);
        lobe.orientation = frame.multiply(new THREE.Quaternion().setFromAxisAngle(up, lobe.rotationY ?? 0));
        lobe.rotationY = undefined;
        (dead ? deadLobes : lobes).push(lobe);
      }
    } else if (tier === "low" && lowVisible) {
      // Three folded strips follow the actual frond arch rather than becoming a spherical crown.
      const shade = new THREE.Color().setHSL(dead ? 0.105 : 0.245, dead ? 0.35 : 0.28, dead ? 0.4 : 0.33);
      for (let i = 0; i < 3; i++) {
        const t0 = 0.14 + (0.86 * i) / 3,
          t1 = 0.14 + (0.86 * (i + 1)) / 3;
        const a = at(t0),
          b = at(t1);
        const edge = (p: THREE.Vector3, t: number, sign: number) => {
          const reach = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.12;
          return p
            .clone()
            .addScaledVector(side, sign * reach)
            .addScaledVector(up, reach * (dead ? -0.9 : 0.35));
        };
        const leftA = edge(a, t0, -1),
          rightA = edge(a, t0, 1),
          leftB = edge(b, t1, -1),
          rightB = edge(b, t1, 1);
        triangle(a, leftB, leftA, shade);
        triangle(a, b, leftB, shade);
        triangle(a, rightB, b, shade);
        triangle(a, rightA, rightB, shade);
      }
    }
  }
  /** Tiny bipinnate acacia leaves massed into flat horizontal pads. */
  function pad(center: THREE.Vector3, radius: number, count: number) {
    const color = new THREE.Color();
    const points: THREE.Vector3[] = [];
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
      if (tier !== "ultra") {
        if (i % 3) continue;
        along.multiplyScalar(Math.sqrt(3));
        across.multiplyScalar(Math.sqrt(3));
      }
      if (reduced) {
        points.push(p.clone().sub(along), p.clone().add(across), p.clone().add(along), p.clone().sub(across));
        continue;
      }
      triangle(p.clone().sub(along), p.clone().add(across), p.clone().add(along), color);
      triangle(p.clone().sub(along), p.clone().add(along), p.clone().sub(across), color);
    }
    if (tier === "medium") lobes.push(fitCanopyLobe(points, 1, true));
    else if (tier === "low") for (const point of points) lowPadPoints.push(point);
  }
  if (palm) {
    // Grove palms are set upright; a young palm's crown still rises from a short, thick stem.
    const height = young ? 1.4 : managed ? 9 : 9.7;
    const lean = managed
      ? (y: number) => new THREE.Vector3(0.012 * y, y, 0.006 * y)
      : (y: number) => new THREE.Vector3(0.05 * y + 0.006 * y * y, y, 0.02 * y);
    timber(
      createTreeBase(
        (young ? [0, 0.5, 1, height] : managed ? [0, 0.5, 1.5, 4, 7, height] : [0, 0.5, 1.5, 4, 7, 9.5, height]).map(
          (y, i) => ({
            center: lean(y).toArray() as [number, number, number],
            radius: young ? (i === 0 ? 0.5 : 0.44 - y * 0.03) : i === 0 ? 0.42 : i === 1 ? 0.33 : 0.3 - y * 0.006
          })
        ),
        0.5,
        9,
        tier === "low" ? 6 : 16
      ),
      bark
    );
    const crown = lean(height);
    // Offshoots at the foot are the hallmark of cultivated date palms; a grove takes them off
    // bearing palms for planting and leaves them on young ones until they root.
    for (const [angle, scale] of managed && !young
      ? []
      : [
          [0.6, 0.45],
          [2.9, 0.32]
        ]) {
      const foot = new THREE.Vector3(Math.cos(angle) * 0.55, 0, Math.sin(angle) * 0.55);
      const top = foot.clone().add(new THREE.Vector3(Math.cos(angle) * 0.25, 1.4 * scale, Math.sin(angle) * 0.25));
      branch(foot, top, 0.16 * scale, 0.11 * scale, 8);
      for (let i = 0; i < 9; i++)
        frond(top, angle + (i * Math.PI * 2) / 9, 1.05 - (i % 3) * 0.22, 3.2 * scale, false, i % 3 === 0);
    }
    // Trimmed leaf bases climb the cleaned trunk of a grove palm in a regular spiral of stubs.
    if (managed && !young)
      for (let i = 0; i < 40; i++) {
        const angle = i * 2.39996,
          y = 1.4 + (i / 40) * (height - 2.4);
        const a = lean(y);
        branch(
          a,
          a.clone().add(new THREE.Vector3(Math.cos(angle) * 0.42, 0.12, Math.sin(angle) * 0.42)),
          0.09,
          0.07,
          4
        );
      }
    // Leaf bases and the short boot below the live crown.
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.39996,
        y = height - 0.9 + (i / 18) * 0.9;
      const a = lean(y),
        b = a.clone().add(new THREE.Vector3(Math.cos(angle) * 0.45, 0.35, Math.sin(angle) * 0.45));
      branch(a, b, 0.09, 0.05, 5);
    }
    for (let i = 0; i < (young ? 24 : 30); i++) {
      const tier = i % 3,
        angle = i * 2.39996 + random() * 0.15;
      frond(
        crown.clone().addScaledVector(up, -0.3 * tier),
        angle,
        1.25 - tier * 0.5,
        (young ? 2.9 : 4.2) + random() * 0.6,
        false,
        i % 2 === 0
      );
    }
    // A few drooping, unpruned old fronds hang beneath the living crown; groves cut them yearly.
    for (let i = 0; i < (managed ? 0 : 6); i++)
      frond(crown.clone().addScaledVector(up, -0.7), i * 1.07 + 0.4, -0.9 - random() * 0.4, 2.6, true, i % 2 === 0);
    if (male && appearance === "bloom") {
      // Male inflorescences stand short and erect among the leaf bases, out of split spathes.
      for (let i = 0; i < 8; i++) {
        const angle = i * 0.785 + 0.2 + positionHash(i, 0.9, 0.1) * 0.3;
        const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const base = crown
          .clone()
          .addScaledVector(out, 0.3)
          .addScaledVector(up, -0.4 - (i % 2) * 0.12);
        const head = base.clone().addScaledVector(out, 0.28).addScaledVector(up, 0.12);
        fruitAxes.push({ from: base, to: head, radius: 0.045 });
        for (let s = 0; s < 30; s++) {
          if (tier !== "ultra" && s % 2) continue;
          const turn = s * 2.39996;
          const start = base.clone().lerp(head, 0.45 + (0.55 * s) / 30);
          const direction = out
            .clone()
            .multiplyScalar(0.8)
            .add(new THREE.Vector3(Math.cos(turn) * 0.55, 0.35 + Math.sin(turn) * 0.45, Math.sin(turn) * 0.55))
            .normalize();
          const end = start.clone().addScaledVector(direction, 0.16 + positionHash(i, s, 2.1) * 0.06);
          if (tier !== "medium") fruitAxes.push({ from: start, to: end, radius: 0.003 });
          for (let d = 0; d < 5; d++) {
            const position = start.clone().lerp(end, 0.25 + d * 0.18);
            fruitSites.push({
              position,
              hang: direction,
              order: positionHash(position.x, position.y, position.z),
              kind: "strand",
              bunch: i
            });
          }
        }
      }
    }
    if (bunches) {
      // Bunch stalks arch out from among the leaf bases; strands hang from their outer half. A
      // grove draws more bunches and bends them down below the fronds to keep the dates clear.
      for (let i = 0; i < (managed ? 8 : 6); i++) {
        const angle = (managed ? i * 0.785 : i * 1.047) + 0.3 + positionHash(i, 0.3, 0.7) * 0.25;
        const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const side = new THREE.Vector3(-out.z, 0, out.x);
        const base = crown
          .clone()
          .addScaledVector(out, 0.32)
          .addScaledVector(up, -0.45 - (i % 2) * 0.15);
        const at = (t: number) =>
          base
            .clone()
            .addScaledVector(out, (managed ? 0.85 : 0.95) * t)
            .addScaledVector(up, managed ? 0.05 * t - 1.25 * t * t : 0.2 * t - 0.95 * t * t);
        // Harvest cuts the bunch, leaving the inner third of its stalk.
        const reach = appearance === "harvested" ? 0.32 : 1;
        for (let k = 0; k < 4; k++)
          fruitAxes.push({ from: at((k / 4) * reach), to: at(((k + 1) / 4) * reach), radius: 0.03 - k * 0.003 });
        if (appearance === "harvested") continue;
        // Reduced tiers keep every other strand of the ultra bunch, in place.
        for (let s = 0; s < 24; s++) {
          if (tier !== "ultra" && s % 2) continue;
          const start = at(0.55 + (0.45 * (s + 0.5)) / 24);
          const turn = s * 2.39996;
          const direction = out
            .clone()
            .multiplyScalar(0.25)
            .addScaledVector(side, Math.cos(turn) * 0.3)
            .addScaledVector(out, Math.sin(turn) * 0.15)
            .add(new THREE.Vector3(0, -1, 0))
            .normalize();
          const end = start.clone().addScaledVector(direction, 0.42 + positionHash(i, s, 1.3) * 0.18);
          if (tier !== "medium") fruitAxes.push({ from: start, to: end, radius: 0.0045 });
          for (let d = 0; d < 7; d++) {
            const position = start.clone().lerp(end, 0.2 + d * 0.12);
            const lateral = d * 2.4 + s;
            fruitSites.push({
              position,
              hang: new THREE.Vector3(Math.cos(lateral) * 0.6, -1, Math.sin(lateral) * 0.6).normalize(),
              order: positionHash(position.x, position.y, position.z),
              kind: "strand",
              bunch: i
            });
          }
        }
      }
    }
    // Unripe date clusters on strands among the leaf bases.
    for (let i = 0; i < (bunches || managed ? 0 : 4); i++) {
      const angle = i * 1.6 + 0.3;
      const stem = crown.clone().add(new THREE.Vector3(Math.cos(angle) * 0.4, -0.35, Math.sin(angle) * 0.4));
      const end = stem.clone().add(new THREE.Vector3(Math.cos(angle) * 0.55, -0.75, Math.sin(angle) * 0.55));
      branch(stem, end, 0.03, 0.02, 4);
      const fruit = new THREE.Color(0xd09a2a);
      for (let j = 0; j < 24; j++) {
        const p = stem.clone().lerp(end, 0.35 + random() * 0.65);
        p.add(new THREE.Vector3((random() - 0.5) * 0.3, -random() * 0.25, (random() - 0.5) * 0.3));
        if (!reduced)
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
        6,
        tier === "low" ? 6 : 16
      ),
      bark
    );
    /** Leafless jointed green shoots hanging in loose tassels, the saxaul's photosynthetic "foliage". */
    function tassel(start: THREE.Vector3, azimuth: number) {
      const color = new THREE.Color();
      const points: THREE.Vector3[] = [];
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
          // Keep every random draw, including joints omitted by the high tier.
          if (tier === "ultra" || i % 2 === 0) {
            const width = side.clone().multiplyScalar(tier === "ultra" ? 1 : 1.8);
            const a = p.clone().add(width),
              c = p.clone().sub(width);
            const cross = p.clone().add(width.clone().applyAxisAngle(direction.clone().normalize(), Math.PI / 2));
            if (reduced) points.push(a, q, c, cross, q, p.clone());
            else {
              triangle(a, q, c, color);
              triangle(cross, q, p, color);
            }
          }
          p = q;
        }
      }
      if (tier === "medium") lobes.push(fitCanopyLobe(points, 0.65, true));
      else if (tier === "low") lowPadPoints.push(...points);
    }
    // Several crooked stems rise from the low trunk, twisting outward into a sparse rounded crown.
    const base = new THREE.Vector3(0.1, 0.6, -0.03);
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.39996 + random() * 0.3;
      lowPadPoints = [];
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
        if (tier === "low" && step === 1) {
          lobes.push(fitCanopyLobe(lowPadPoints, 0.75, true));
          lowPadPoints = [];
        }
        a = b;
        radius *= 0.7;
      }
      tassel(a, angle);
      tassel(a, angle + Math.PI);
      if (tier === "low") lobes.push(fitCanopyLobe(lowPadPoints, 0.75, true));
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
        6,
        tier === "low" ? 6 : 16
      ),
      bark
    );
    // The trunk forks low into ascending limbs that fan out into a flat parasol crown.
    const fork = new THREE.Vector3(0.12, 1.6, 0.04);
    for (let i = 0; i < 5; i++) {
      lowPadPoints = [];
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
      if (tier === "low") lobes.push(fitCanopyLobe(lowPadPoints, 1, true));
    }
    lowPadPoints = [];
    pad(new THREE.Vector3(0.2, 7.3, 0), 2.2, 220);
    if (tier === "low") lobes.push(fitCanopyLobe(lowPadPoints, 1, true));
  }
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  let foliage: THREE.BufferGeometry;
  const parts: THREE.BufferGeometry[] = [];
  if (positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    parts.push(geometry);
  }
  if (lobes.length)
    parts.push(
      createCanopyLobes(
        lobes,
        {
          hue: palm ? 0.245 : saxaul ? 0.225 : 0.23,
          saturation: palm ? 0.28 : saxaul ? 0.32 : 0.36,
          lightness: palm ? 0.33 : saxaul ? 0.32 : 0.27
        },
        palm ? 43113 : saxaul ? 43151 : 43127
      )
    );
  if (deadLobes.length)
    parts.push(createCanopyLobes(deadLobes, { hue: 0.105, saturation: 0.35, lightness: 0.4 }, 43114));
  if (parts.length === 1) foliage = parts[0];
  else {
    foliage = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  });
  const trunk = new THREE.Mesh(barkGeometry, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = young
    ? "date-palm-young-short-stem-and-offshoots"
    : managed
      ? "date-palm-orchard-cleaned-trunk-and-trimmed-leaf-bases"
      : palm
        ? "date-palm-leaf-scarred-trunk-and-offshoots"
        : saxaul
          ? "saxaul-twisted-stems"
          : "acacia-forked-limbs";
  crown.name = palm ? "date-palm-pinnate-fronds" : saxaul ? "saxaul-jointed-green-shoots" : "acacia-flat-leaf-pads";
  const group = new THREE.Group();
  group.name = managed
    ? palmForm === "orchard"
      ? "date-palm-orchard"
      : `date-palm-orchard-${palmForm}`
    : species.replaceAll("_", "-");
  group.userData.treeQuality = quality;
  group.add(trunk, crown);
  const pickables = [trunk, crown];
  if (managed) group.userData.treeAppearance = appearance;
  const inflorescences =
    male && appearance === "bloom" && buildFruitLayer(fruitSites, MALE_FLOWERS, quality, { axes: fruitAxes });
  if (inflorescences) {
    const mesh = new THREE.Mesh(inflorescences, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = "date-palm-male-blossom-inflorescences-and-spathes";
    group.add(mesh);
    pickables.push(mesh);
  }
  if (bunches) {
    group.userData.treeAppearance = appearance;
    const fruitGeometry = buildFruitLayer(fruitSites, appearance === "harvested" ? CUT_STALKS : DATE_BUNCHES, quality, {
      stage: appearance === "fruit" ? "ripe" : "unripe",
      axes: fruitAxes
    });
    if (fruitGeometry) {
      const mesh = new THREE.Mesh(fruitGeometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.name =
        appearance === "harvested"
          ? "date-palm-cut-bunch-stalks"
          : appearance === "fruit"
            ? "date-palm-bunches-of-brown-tamar-dates"
            : "date-palm-bunches-of-yellow-khalal-dates";
      group.add(mesh);
      pickables.push(mesh);
    }
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}
