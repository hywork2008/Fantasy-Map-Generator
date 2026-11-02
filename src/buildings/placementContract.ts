import type { Point } from "../city-editor/types/primitives";

/**
 * Local axis the model's front points along, before City Editor yaw.
 * Houses, gatehouses and courtyard ranges face local +Z (street / field).
 * A model whose factory comment names another axis is listed in `BV_FRONT_AXES`.
 * Ships stay on the ship path (bow +X, rotation measured from plan +Y) and are not listed.
 */
export type BvFrontAxis = "+x" | "-x" | "+z" | "-z";

export const DEFAULT_BV_FRONT_AXIS: BvFrontAxis = "+z";

/** Placeable ids and BV group names. Unlisted land models use `DEFAULT_BV_FRONT_AXIS`. */
export const BV_FRONT_AXES: Readonly<Record<string, BvFrontAxis>> = {
  batteringRam: "+x",
  siegeTower: "+x",
  medievalWagon: "+x",
  coveredWagon: "+x",
  nobleCarriage: "+x",
  warWagon: "+x",
  earlyFieldCannon: "+x",
  "st-georges-chapel": "-x",
  "basilica-temple:high": "-x",
  "basilica-temple:low": "-x"
};

export function frontAxisOf(modelId: string): BvFrontAxis {
  return BV_FRONT_AXES[modelId] ?? (modelId.startsWith("basilica-temple") ? "-x" : DEFAULT_BV_FRONT_AXIS);
}

export interface AxisBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** XZ footprint of a model-local axis-aligned box. `studyBounds` and baked prototype bounds both fit. */
export function axisBoxFromBounds(bounds: {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}): AxisBox {
  return {
    minX: bounds.min.x,
    minY: bounds.min.y,
    minZ: bounds.min.z,
    maxX: bounds.max.x,
    maxY: bounds.max.y,
    maxZ: bounds.max.z
  };
}

export interface FootprintBox {
  /** Half-extent along local X, including the plot margin. */
  halfX: number;
  /** Half-extent along local Z, including the plot margin. */
  halfZ: number;
  centerX: number;
  centerZ: number;
  /** Model-local Y of the base. The mesh is shifted so this sits on the plot level. */
  groundY: number;
}

export function footprintBox(box: AxisBox, marginMeters = 0): FootprintBox {
  return {
    halfX: (box.maxX - box.minX) / 2 + marginMeters,
    halfZ: (box.maxZ - box.minZ) / 2 + marginMeters,
    centerX: (box.minX + box.maxX) / 2,
    centerZ: (box.minZ + box.maxZ) / 2,
    groundY: box.minY
  };
}

/** Oriented plot on the CE plan. `axisX` / `axisZ` are unit directions of the model's local axes. */
export interface PlanBox {
  center: Point;
  axisX: Point;
  axisZ: Point;
  halfX: number;
  halfZ: number;
}

/**
 * CityElement.rotation is three.js `rotation.y` and is CCW from plan +X for the model's local +X.
 * Plan +Y is north. three.js Z is −plan Y, so local +Z at rotation 0 points plan south.
 */
export function planAxes(rotationY: number): { axisX: Point; axisZ: Point } {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return { axisX: [c, s], axisZ: [s, -c] };
}

export function planBox(center: Point, footprint: Pick<FootprintBox, "halfX" | "halfZ">, rotationY: number): PlanBox {
  return { center, ...planAxes(rotationY), halfX: footprint.halfX, halfZ: footprint.halfZ };
}

/** Grows each edge outward. A rectangle's half-extents each increase by the offset. */
export function growPlanBox(box: PlanBox, meters: number): PlanBox {
  return { ...box, halfX: box.halfX + meters, halfZ: box.halfZ + meters };
}

export function planBoxCorners(box: PlanBox): [Point, Point, Point, Point] {
  const corners: Point[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ] as const) {
    corners.push([
      box.center[0] + sx * box.halfX * box.axisX[0] + sz * box.halfZ * box.axisZ[0],
      box.center[1] + sx * box.halfX * box.axisX[1] + sz * box.halfZ * box.axisZ[1]
    ]);
  }
  return corners as [Point, Point, Point, Point];
}

/** Folds an angle into (−π, π]. −π and π are the same yaw; π is kept. */
function wrapRadians(angle: number): number {
  const turns = Math.PI * 2;
  const wrapped = angle - turns * Math.round(angle / turns);
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/**
 * Compass bearing of the front: 0 is north, clockwise.
 * Returns CityElement.rotation / three.js rotation.y for that front axis.
 */
export function rotationFromFacing(front: BvFrontAxis, facingDegrees: number): number {
  const bearing = (facingDegrees * Math.PI) / 180;
  switch (front) {
    case "+z":
      return wrapRadians(Math.PI - bearing);
    case "-z":
      return wrapRadians(-bearing);
    case "+x":
      return wrapRadians(Math.PI / 2 - bearing);
    case "-x":
      return wrapRadians(-Math.PI / 2 - bearing);
  }
}

export function facingFromRotation(front: BvFrontAxis, rotationY: number): number {
  let bearing: number;
  switch (front) {
    case "+z":
      bearing = Math.PI - rotationY;
      break;
    case "-z":
      bearing = -rotationY;
      break;
    case "+x":
      bearing = Math.PI / 2 - rotationY;
      break;
    case "-x":
      bearing = -Math.PI / 2 - rotationY;
      break;
  }
  const degrees = (bearing * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/**
 * Pose shared by the mesh and the footprint.
 * Translation is applied in model space before the yaw, so the footprint centre
 * sits on `position` and `groundY` sits on `elevation`. three.js Z is −plan Y.
 */
export function placementPose(position: Point, elevation: number, rotationY: number, footprint: FootprintBox) {
  return {
    position: [position[0], elevation, -position[1]] as const,
    rotationY,
    preTranslation: [-footprint.centerX, -footprint.groundY, -footprint.centerZ] as const
  };
}
