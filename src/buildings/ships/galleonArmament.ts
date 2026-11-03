import * as THREE from "three";
import { ModelKit, type Position } from "../medieval/modelKit";
import type { SailingShipState } from "./sailingAssembly";

export interface GalleonState extends SailingShipState {
  gunports?: "open" | "closed";
}
export interface GunportMount {
  id: string;
  point: Position;
  normal: Position;
  width: number;
  height: number;
}
export const GALLEON_GUN_X = [-17, -12, -7, -2, 3, 8, 13] as const;

function mount(parent: ModelKit, local: ModelKit, port: GunportMount) {
  const normal = new THREE.Vector3(...port.normal).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(normal).normalize();
  const up = normal.clone().cross(right).normalize();
  local.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  parent.attach(local.finish(), port.point);
}
export function createGunportFrames(ports: readonly GunportMount[]) {
  const k = new ModelKit("gunport-frames");
  for (const port of ports) {
    const p = new ModelKit(port.id),
      w = port.width,
      h = port.height;
    for (const side of [-1, 1]) {
      p.box("port-jamb", [side * (w / 2 + 0.05), 0, -0.05], [0.1, h + 0.2, 0.3], "wood");
      p.box("port-header", [0, side * (h / 2 + 0.05), -0.05], [w, 0.1, 0.3], "wood");
      p.box("port-chamber-side", [side * (w / 2 + 0.04), 0, -0.55], [0.08, h, 1], "dark");
      p.box("port-chamber-floor", [0, side * (h / 2 + 0.04), -0.55], [w, 0.08, 1], "dark");
    }
    p.box("port-dark-back", [0, 0, -1.05], [w, h, 0.06], "dark");
    mount(k, p, port);
  }
  return k.finish();
}
export function createGunportMoving(ports: readonly GunportMount[], closed: boolean, high = true) {
  const k = new ModelKit("gunport-lids-and-guns");
  for (const port of ports) {
    const p = new ModelKit(port.id),
      w = port.width + 0.14,
      h = port.height + 0.14;
    const hinge = new THREE.Vector3(0, h / 2, 0.16),
      rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), closed ? 0 : -Math.PI * 0.52);
    const centre = new THREE.Vector3(0, -h / 2, 0).applyQuaternion(rotation).add(hinge);
    const lid = p.box(
      closed ? "gunport-lid-closed" : "gunport-lid-open",
      [centre.x, centre.y, centre.z],
      [w, h, 0.1],
      "oak"
    );
    lid.quaternion.copy(rotation);
    for (const x of [-w * 0.3, w * 0.3]) {
      const at = new THREE.Vector3(x, -h / 2, 0.065).applyQuaternion(rotation).add(hinge);
      const strap = p.box("lid-strap", [at.x, at.y, at.z], [0.05, h * 0.84, 0.025], "iron");
      strap.quaternion.copy(rotation);
    }
    const length = 1.35,
      tip = closed ? -0.22 : 1.0,
      radius = high ? 0.18 : 0.16;
    const profile = [
      [0, 0],
      [radius, 0],
      [radius * 0.82, length - 0.1],
      [radius * 0.86, length],
      [radius * 0.53, length],
      [radius * 0.53, length - 0.25],
      [0, length - 0.25]
    ];
    const barrel = p.add(
      closed ? "cannon-stowed" : "cannon-run-out",
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        high ? 12 : 8
      ),
      "iron"
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, tip - length);
    if (high) {
      p.box("gun-carriage", [0, -0.27, closed ? -1.0 : -0.45], [0.6, 0.18, 0.65], "wood");
      for (const side of [-1, 1])
        for (const z of [-0.2, 0.2]) {
          const wheel = p.cylinder(
            "carriage-wheel",
            [side * 0.31, -0.36, (closed ? -1 : -0.45) + z],
            0.1,
            0.07,
            "dark",
            0.1,
            8
          );
          wheel.rotation.z = Math.PI / 2;
        }
    }
    mount(k, p, port);
  }
  return k.finish();
}
