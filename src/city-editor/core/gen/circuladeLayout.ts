// Concentric circulade (Bram-style) layout generator.
// Based on docs/plan/31-circulade-lab-rework-plan.md, 30, 28, 24.
// Features:
// - Small core plaza with through-traffic axis
// - Temple/church adjacent to the plaza (never monopolizing the hub)
// - 2 opposed main gates (e.g. north and south)
// - 2-3 concentric ring roads with subtle organic harmonics (not machine circles)
// - Radial connecting venelles / spokes

import type { Rng } from "./prng";
import { makeRng } from "./prng";
import type { Gate, Point, Precinct } from "./types";

export interface RingHarmonic {
  frequency: number;
  amplitude: number;
  phase: number;
}

export interface CirculadeRingShape {
  radius: number;
  axisRatio: number;
  rotation: number;
  centerOffset: Point;
  harmonics: RingHarmonic[];
}

export interface CirculadeLayoutPlan {
  hub: Point;
  throughAngle: number;
  plaza: Precinct;
  temple: Precinct | null;
  shapes: CirculadeRingShape[];
  ringRoads: Point[][];
  radialRoads: Point[][];
  throughRoad: Point[];
  recommendedGates: Point[];
}

export function sampleRingPoint(hub: Point, shape: CirculadeRingShape, angle: number): Point {
  let r = shape.radius;
  for (const h of shape.harmonics) {
    r *= 1 + h.amplitude * Math.sin(h.frequency * angle + h.phase);
  }
  const localX = r * Math.cos(angle);
  const localY = r * shape.axisRatio * Math.sin(angle);
  const cosRot = Math.cos(shape.rotation);
  const sinRot = Math.sin(shape.rotation);
  return [
    hub[0] + shape.centerOffset[0] + localX * cosRot - localY * sinRot,
    hub[1] + shape.centerOffset[1] + localX * sinRot + localY * cosRot
  ];
}

export function sampleRingPolyline(hub: Point, shape: CirculadeRingShape, numSegments = 48): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= numSegments; i++) {
    const a = (i / numSegments) * Math.PI * 2;
    points.push(sampleRingPoint(hub, shape, a));
  }
  return points;
}

/**
 * Plan the Bram-style circulade core, concentric ring roads, and radial lanes.
 */
export function planCirculadeLayout(
  hub: Point,
  cityRadiusMeters: number,
  seed: string,
  hasTemple = true
): CirculadeLayoutPlan {
  const rng = makeRng(`${seed}:circulade-layout`);
  // Through axis angle for the two primary gates (e.g. slight tilt from vertical)
  const throughAngle = Math.PI * 0.5 + rng.range(-0.15, 0.15) * Math.PI;
  const axisRatio = rng.range(0.88, 0.96); // subtle ellipse
  const harmonics: RingHarmonic[] = [
    { frequency: 2, amplitude: rng.range(0.02, 0.04), phase: rng() * Math.PI * 2 },
    { frequency: 3, amplitude: rng.range(0.01, 0.025), phase: rng() * Math.PI * 2 }
  ];

  // 1. Core Plaza (small 16-22m, allows through traffic)
  const plazaHalfW = rng.range(8, 10);
  const plazaHalfH = rng.range(8, 10);
  const cosA = Math.cos(throughAngle);
  const sinA = Math.sin(throughAngle);
  const along: Point = [cosA, sinA];
  const across: Point = [-sinA, cosA];

  const corner = (x: number, y: number): Point => [
    hub[0] + along[0] * y + across[0] * x,
    hub[1] + along[1] * y + across[1] * x
  ];

  const plazaPolygon: Point[] = [
    corner(-plazaHalfW, -plazaHalfH),
    corner(plazaHalfW, -plazaHalfH),
    corner(plazaHalfW, plazaHalfH),
    corner(-plazaHalfW, plazaHalfH)
  ];

  const plaza: Precinct = {
    kind: "plaza",
    polygon: plazaPolygon,
    anchor: hub,
    radiusMeters: Math.max(plazaHalfW, plazaHalfH),
    cellIds: []
  };

  // 2. Temple adjacent to plaza (never monopolizing center, strictly clearing roads by >= 11m)
  let temple: Precinct | null = null;
  let _templeAngle: number | null = null;
  const templeHalfL = 14; // length 28m
  const templeHalfW = 8; // width 16m
  if (hasTemple) {
    // Attach to the side of the plaza (along `across` axis) so through traffic on `along` is unimpeded.
    // Road center is at across=0, width is ~6-8m (half-width 3-4m).
    // To ensure distance to nave >= 10m from through road, temple inner edge must be at across >= 15m.
    // Center at across = 15 + templeHalfW = 23m.
    const side = rng() < 0.5 ? 1 : -1;
    const centerAcross = side * (15 + templeHalfW);
    const templeAnchor: Point = corner(centerAcross, 0);
    const templePoly: Point[] = [
      corner(centerAcross - side * templeHalfW, -templeHalfL),
      corner(centerAcross + side * templeHalfW, -templeHalfL),
      corner(centerAcross + side * templeHalfW, templeHalfL),
      corner(centerAcross - side * templeHalfW, templeHalfL)
    ];
    temple = {
      kind: "temple",
      polygon: templePoly,
      anchor: templeAnchor,
      radiusMeters: 16,
      cellIds: [],
      rotation: throughAngle
    };
    _templeAngle = throughAngle + (side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
  }

  // 3. Concentric Rings
  // Ring count depends on city radius (typically 2 to 3 rings for tiny city of R=150-200m).
  // Temple max radius from hub is hypot(centerAcross + 8, 14) ≈ 33m.
  // Inner ring at R >= 50m provides >= 14m clearance to all temple edges and through-street.
  const minInnerR = hasTemple ? 50 : 34;
  const innerR = Math.max(minInnerR, Math.min(56, cityRadiusMeters * 0.32));
  const ringSpacing = Math.max(28, Math.min(38, (cityRadiusMeters * 0.88 - innerR) / 2));
  const ringRadii: number[] = [innerR, innerR + ringSpacing];
  if (innerR + ringSpacing * 2 <= cityRadiusMeters * 0.96) {
    ringRadii.push(innerR + ringSpacing * 2);
  }

  const shapes: CirculadeRingShape[] = ringRadii.map((radius, index) => ({
    radius,
    axisRatio,
    rotation: throughAngle + (index === 0 ? 0 : rng.range(-0.06, 0.06)),
    centerOffset: index === 0 ? [0, 0] : [rng.range(-2, 2), rng.range(-2, 2)],
    harmonics
  }));

  const ringRoads: Point[][] = shapes.map(shape => sampleRingPolyline(hub, shape, 48));

  // 4. Through road (Gate 1 -> Plaza -> Gate 2)
  // Local theta = 0 points along shape.rotation (throughAngle), and Math.PI points opposite
  const outerShape = shapes[shapes.length - 1];
  const gateNorth = sampleRingPoint(hub, outerShape, 0);
  const gateSouth = sampleRingPoint(hub, outerShape, Math.PI);
  const throughRoad: Point[] = [gateSouth, hub, gateNorth];

  // 5. Radial connecting venelles (3 to 5 connecting alleys between rings)
  // In local ellipse coordinates, through axis is at theta = 0 and Math.PI.
  // Temple is at theta ≈ ±Math.PI / 2.
  // Venelles must avoid through axis (theta ≈ 0, Math.PI) AND temple (theta ≈ ±Math.PI / 2).
  const radialRoads: Point[][] = [];
  const candidateThetas = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (const t of candidateThetas) {
    const jittered = t + rng.range(-0.08, 0.08);
    const pts: Point[] = [];
    for (const shape of shapes) {
      pts.push(sampleRingPoint(hub, shape, jittered));
    }
    radialRoads.push(pts);
  }

  // Bram circulade is characterized by exactly two opposed gates connected by the through axis.
  const recommendedGates: Point[] = [gateSouth, gateNorth];

  return {
    hub,
    throughAngle,
    plaza,
    temple,
    shapes,
    ringRoads,
    radialRoads,
    throughRoad,
    recommendedGates
  };
}
