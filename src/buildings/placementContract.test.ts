import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createRegionalHouseGeometry, defaultRegionalHouseSpec } from "./houses/regionalHouses";
import {
  axisBoxFromBounds,
  type BvFrontAxis,
  facingFromRotation,
  footprintBox,
  frontAxisOf,
  placementPose,
  planBox,
  planBoxCorners,
  rotationFromFacing
} from "./placementContract";

const FRONTS: BvFrontAxis[] = ["+x", "-x", "+z", "-z"];
const BEARINGS = [0, 90, 180, 270];

function localFront(front: BvFrontAxis): THREE.Vector3 {
  if (front === "+x") return new THREE.Vector3(1, 0, 0);
  if (front === "-x") return new THREE.Vector3(-1, 0, 0);
  if (front === "+z") return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(0, 0, -1);
}

describe("placement contract", () => {
  it("keeps street-facing houses on +Z and the commented exceptions on their own axis", () => {
    expect(frontAxisOf("regional-house")).toBe("+z");
    expect(frontAxisOf("medievalWagon")).toBe("+x");
    expect(frontAxisOf("batteringRam")).toBe("+x");
    expect(frontAxisOf("earlyFieldCannon")).toBe("+x");
    expect(frontAxisOf("siegeTower")).toBe("+x");
    expect(frontAxisOf("st-georges-chapel")).toBe("-x");
    expect(frontAxisOf("basilica-temple:high")).toBe("-x");
    expect(frontAxisOf("basilica-temple:low")).toBe("-x");
  });

  it("points the authored front at the compass bearing", () => {
    for (const front of FRONTS) {
      for (const bearing of BEARINGS) {
        const rotation = rotationFromFacing(front, bearing);
        const object = new THREE.Object3D();
        object.rotation.y = rotation;
        object.updateMatrix();
        const aimed = localFront(front).applyMatrix4(object.matrix);
        const planX = aimed.x;
        const planY = -aimed.z;
        const radians = (bearing * Math.PI) / 180;
        expect(planX).toBeCloseTo(Math.sin(radians), 5);
        expect(planY).toBeCloseTo(Math.cos(radians), 5);
        expect(facingFromRotation(front, rotation)).toBeCloseTo(bearing, 5);
      }
    }
  });

  it("puts an unrotated basilica's west front toward plan west", () => {
    expect(rotationFromFacing("-x", 270)).toBeCloseTo(0, 6);
  });

  it("lands footprint corners on the same pose as the mesh", () => {
    const box = footprintBox({ minX: -1, minY: 2, minZ: -3, maxX: 3, maxY: 8, maxZ: 5 });
    const position: [number, number] = [10, 20];
    const rotation = rotationFromFacing("+z", 0);
    const pose = placementPose(position, 4, rotation, box);
    const corners = planBoxCorners(planBox(position, box, rotation));
    const object = new THREE.Object3D();
    object.position.set(...pose.position);
    object.rotation.y = pose.rotationY;
    object.updateMatrix();
    const local = new THREE.Vector3(box.centerX + box.halfX, box.groundY, box.centerZ + box.halfZ);
    local.add(new THREE.Vector3(...pose.preTranslation));
    local.applyMatrix4(object.matrix);
    const northEast = corners[2];
    expect(local.x).toBeCloseTo(northEast[0], 5);
    expect(-local.z).toBeCloseTo(northEast[1], 5);
    expect(local.y).toBeCloseTo(4, 5);
  });

  it("reads a low regional house as an XZ box with its front on +Z", () => {
    const geometry = createRegionalHouseGeometry(defaultRegionalHouseSpec("mediterranean", 0), "low");
    geometry.computeBoundingBox();
    const footprint = footprintBox(axisBoxFromBounds(geometry.boundingBox!));
    expect(footprint.halfX * 2).toBeGreaterThan(4);
    expect(footprint.halfZ * 2).toBeGreaterThan(7);
    expect(frontAxisOf("regional-house")).toBe("+z");
    geometry.dispose();
  });
});
