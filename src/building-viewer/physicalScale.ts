import * as THREE from "three";

/** Shared physical convention: one world unit is one metre, for every BV family. */
export const REFERENCE_PERSON_HEIGHT_METERS = 1.7;

/** Measure model geometry only, excluding hidden alternatives and viewer helpers. */
export function studyBounds(roots: readonly THREE.Object3D[]): THREE.Box3 | undefined {
  const bounds = new THREE.Box3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const part = new THREE.Box3();
      const position = object.geometry.getAttribute("position");
      if (!position) return;
      const vertex = new THREE.Vector3();
      const expand = (matrix: THREE.Matrix4) => {
        for (let i = 0; i < position.count; i++) {
          object.getVertexPosition(i, vertex).applyMatrix4(matrix);
          part.expandByPoint(vertex);
        }
      };
      if (object instanceof THREE.InstancedMesh) {
        const local = new THREE.Matrix4();
        const world = new THREE.Matrix4();
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, local);
          expand(world.multiplyMatrices(object.matrixWorld, local));
        }
      } else {
        expand(object.matrixWorld);
      }
      bounds.union(part);
    });
  }
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return;
  return bounds;
}

/** Width (X), depth (Z), height (Y), measured from the displayed assembly. */
export function studyEnvelope(bounds: THREE.Box3): string {
  const size = bounds.getSize(new THREE.Vector3());
  return `${size.x.toFixed(2)} × ${size.z.toFixed(2)} × ${size.y.toFixed(2)} m`;
}

/** A fixed-height figure, never scaled to the selected model or its display envelope. */
export function createReferencePerson() {
  const group = new THREE.Group();
  group.name = "bv-reference-person";
  const box = new THREE.BoxGeometry(1, 1, 1);
  const head = new THREE.SphereGeometry(0.115, 12, 8);
  const coat = new THREE.MeshLambertMaterial({ color: 0xc87524 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x303c49 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9b18b });
  function part(geometry: THREE.BufferGeometry, material: THREE.Material, p: number[], size?: number[]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(p[0], p[1], p[2]);
    if (size) mesh.scale.set(size[0], size[1], size[2]);
    group.add(mesh);
    return mesh;
  }
  for (const side of [-1, 1]) {
    part(box, dark, [side * 0.105, 0.05, 0.04], [0.15, 0.1, 0.28]);
    part(box, dark, [side * 0.105, 0.445, 0], [0.15, 0.79, 0.17]);
    const arm = part(box, coat, [side * 0.265, 1.095, 0], [0.115, 0.55, 0.15]);
    arm.rotation.z = side * 0.12;
    part(box, skin, [side * 0.3, 0.79, 0], [0.1, 0.13, 0.12]);
  }
  part(box, coat, [0, 1.1, 0], [0.38, 0.56, 0.22]);
  part(box, skin, [0, 1.43, 0], [0.12, 0.12, 0.12]);
  part(head, skin, [0, REFERENCE_PERSON_HEIGHT_METERS - 0.115, 0]);
  return {
    group,
    dispose() {
      box.dispose();
      head.dispose();
      coat.dispose();
      dark.dispose();
      skin.dispose();
    }
  };
}

/** Fit geometry and the reference figure without changing either one's physical size. */
export function fitStudyCamera(camera: THREE.PerspectiveCamera, bounds: THREE.Box3, direction: THREE.Vector3) {
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
  const distance = (Math.max(sphere.radius, 0.1) / Math.sin(halfFov)) * 1.08;
  camera.position.copy(direction.clone().normalize().multiplyScalar(distance).add(sphere.center));
  camera.near = Math.min(0.1, distance / 100);
  camera.far = Math.max(5000, distance + sphere.radius * 2);
  camera.updateProjectionMatrix();
  return sphere.center;
}
