import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createVectorDocument } from "../../generators/vector/document";
import { curveSource } from "../../generators/vector/editing/paths";
import { vectorPathMeasurement } from "../../generators/vector/geometry/measurement";
import { vectorPickOwner } from "./picking";

describe("stable selection and source-curve measurement", () => {
  it("selects the logical placement instead of a BV internal part and ignores background", () => {
    const root = new THREE.Group(),
      placement = new THREE.Group(),
      part = new THREE.Group();
    placement.userData = { id: "building:1", kind: "building" };
    part.userData = { id: "internal-roof", kind: "building" };
    root.add(placement);
    placement.add(part);
    expect(vectorPickOwner(part)).toBe("building:1");
    expect(vectorPickOwner(root)).toBeNull();
  });
  it("measures metres and closed area independently of the render frame", () => {
    const path = {
      id: "measured",
      role: "road" as const,
      revision: 0,
      origin: "manual" as const,
      editPolicy: "editable" as const,
      source: curveSource(
        [
          [1000000, -1000000],
          [1000003, -999996]
        ],
        "polyline",
        false
      ),
      width: { leftMeters: 1, rightMeters: 1, stations: [] }
    };
    expect(vectorPathMeasurement(path)).toEqual({ lengthMeters: 5, areaMeters2: null });
    const doc = createVectorDocument();
    doc.paths.ring = {
      ...path,
      source: {
        kind: "preset",
        preset: "ellipse",
        center: [10000, 10000],
        widthMeters: 100,
        heightMeters: 100,
        bearingDegrees: 0
      }
    };
    const measured = vectorPathMeasurement(doc.paths.ring);
    expect(measured.areaMeters2).toBeCloseTo(Math.PI * 2500, 8);
    expect(Math.abs(measured.lengthMeters - Math.PI * 100)).toBeLessThan(0.005);
  });
});
