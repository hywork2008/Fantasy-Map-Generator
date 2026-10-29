import * as THREE from "three";

/** One ellipsoidal foliage mass; radius holds the semi-axes in meters. */
export interface CanopyLobe {
  center: THREE.Vector3;
  radius: THREE.Vector3;
  /** Fixed world-space orientation of an elongated spray, independent of the camera. */
  rotationY?: number;
}
export interface CanopyPalette {
  hue: number;
  saturation: number;
  lightness: number;
}

/** Fit a lobe to the second moments of a spray, so a reduced tier occupies the same volume as its leaves. */
export function fitCanopyLobe(points: readonly THREE.Vector3[], coverage = 1, alignHorizontal = false): CanopyLobe {
  const center = new THREE.Vector3();
  for (const point of points) center.add(point);
  center.divideScalar(Math.max(1, points.length));
  let horizontal = 0,
    vertical = 0;
  for (const point of points) {
    horizontal += (point.x - center.x) ** 2 + (point.z - center.z) ** 2;
    vertical += (point.y - center.y) ** 2;
  }
  const n = Math.max(1, points.length);
  // A uniformly filled ellipsoid has E[x^2 + z^2] = 2a^2 / 5 and E[y^2] = b^2 / 5.
  const a = Math.sqrt((2.5 * horizontal) / n) * coverage,
    b = Math.sqrt((5 * vertical) / n) * coverage;
  if (alignHorizontal) {
    let xx = 0,
      zz = 0,
      xz = 0;
    for (const point of points) {
      const x = point.x - center.x,
        z = point.z - center.z;
      xx += x * x;
      zz += z * z;
      xz += x * z;
    }
    const spread = Math.hypot(xx - zz, 2 * xz);
    return {
      center,
      radius: new THREE.Vector3(
        Math.sqrt(5 * Math.max(1e-12, (xx + zz + spread) / (2 * n))) * coverage,
        b,
        Math.sqrt(5 * Math.max(1e-12, (xx + zz - spread) / (2 * n))) * coverage
      ),
      rotationY: -0.5 * Math.atan2(2 * xz, xx - zz)
    };
  }
  return { center, radius: new THREE.Vector3(a, b, a) };
}

/**
 * Faceted lobes shaded as one crown. Normals lean toward the crown envelope, vertices deep inside it
 * are darkened, and each facet carries a small leaf-scale tint, so the reduced tier reads as foliage
 * rather than a cluster of polyhedra. Facets hidden inside a neighbouring lobe are dropped.
 */
export function createCanopyLobes(
  lobes: readonly CanopyLobe[],
  palette: CanopyPalette,
  seed: number
): THREE.BufferGeometry {
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Polyhedron geometries are non-indexed: every three vertices form one facet.
  const source = new THREE.IcosahedronGeometry(1, 0);
  const unit = source.getAttribute("position");
  const box = new THREE.Box3();
  for (const { center, radius, rotationY } of lobes) {
    const extent =
      rotationY === undefined
        ? radius
        : new THREE.Vector3(
            Math.hypot(radius.x * Math.cos(rotationY), radius.z * Math.sin(rotationY)),
            radius.y,
            Math.hypot(radius.x * Math.sin(rotationY), radius.z * Math.cos(rotationY))
          );
    box.expandByPoint(center.clone().sub(extent));
    box.expandByPoint(center.clone().add(extent));
  }
  const crownCenter = box.getCenter(new THREE.Vector3());
  const crownRadius = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const inside = (point: THREE.Vector3, skip: number) =>
    lobes.some(({ center, radius, rotationY }, i) => {
      if (i === skip) return false;
      let x = point.x - center.x,
        z = point.z - center.z;
      if (rotationY !== undefined) {
        const localX = x * Math.cos(rotationY) - z * Math.sin(rotationY);
        z = x * Math.sin(rotationY) + z * Math.cos(rotationY);
        x = localX;
      }
      return (x / radius.x) ** 2 + ((point.y - center.y) / radius.y) ** 2 + (z / radius.z) ** 2 < 0.92;
    });
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const color = new THREE.Color();
  const rotation = new THREE.Matrix4();
  const triangle = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lobeNormal = new THREE.Vector3(),
    crownNormal = new THREE.Vector3(),
    relative = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    lift = new THREE.Vector3(0, 0.3, 0);
  lobes.forEach(({ center, radius, rotationY }, index) => {
    rotation.makeRotationY(random() * Math.PI * 2);
    const tint = (random() - 0.5) * 0.04;
    // Shared corners move together, so the jagged outline stays closed.
    const jitter = new Map<string, number>();
    const corner = (i: number) => {
      const key = `${unit.getX(i).toFixed(3)},${unit.getY(i).toFixed(3)},${unit.getZ(i).toFixed(3)}`;
      let scale = jitter.get(key);
      if (scale === undefined) {
        scale = 0.82 + random() * 0.3;
        jitter.set(key, scale);
      }
      return scale;
    };
    for (let i = 0; i < unit.count; i += 3) {
      for (let j = 0; j < 3; j++)
        triangle[j]
          .fromBufferAttribute(unit, i + j)
          .multiplyScalar(corner(i + j))
          .applyMatrix4(rotation)
          .multiply(radius);
      if (rotationY !== undefined) for (const point of triangle) point.applyAxisAngle(up, rotationY);
      for (const point of triangle) point.add(center);
      const hidden = triangle.every(point => inside(point, index));
      const speckle = random() - 0.5,
        hue = random() - 0.5;
      if (hidden) continue;
      for (const point of triangle) {
        relative.subVectors(point, center);
        if (rotationY !== undefined) relative.applyAxisAngle(up, -rotationY);
        lobeNormal.set(relative.x / radius.x ** 2, relative.y / radius.y ** 2, relative.z / radius.z ** 2).normalize();
        if (rotationY !== undefined) lobeNormal.applyAxisAngle(up, rotationY);
        relative.subVectors(point, crownCenter).divide(crownRadius);
        crownNormal.copy(relative).divide(crownRadius).normalize();
        // Lifting the normal stands in for light scattered through leaves, which keeps the underside from going black.
        const normal = lobeNormal.lerp(crownNormal, 0.85).normalize().add(lift).normalize();
        // Self-occlusion grows toward the crown core and its shaded underside.
        const depth = THREE.MathUtils.smoothstep(relative.length(), 0.35, 0.95);
        const height = THREE.MathUtils.clamp(relative.y * 0.5 + 0.5, 0, 1);
        const occlusion = (0.62 + 0.38 * depth) * (0.86 + 0.14 * height);
        color.setHSL(
          palette.hue + hue * 0.03,
          palette.saturation + speckle * 0.08,
          (palette.lightness + tint + speckle * 0.14) * occlusion
        );
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(color.r, color.g, color.b);
      }
    }
  });
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
