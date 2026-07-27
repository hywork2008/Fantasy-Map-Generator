import { describe, expect, it } from "vitest";
import type { Point } from "../generators/voronoi";
import { findPath, meander } from "./pathUtils";

describe("addMeandering", () => {
  // Cells positions arranged along x-axis with enough spacing to trigger interior point insertion
  const linearCellPositions: Point[] = [
    [0, 0],
    [10, 0],
    [20, 0],
    [30, 0],
    [40, 0],
    [50, 0]
  ];
  const linearCells = [0, 1, 2, 3, 4, 5];

  it("returns one entry in anchorIndices per input cell, with anchorIndices[0] === 0", () => {
    const { anchorIndices } = meander(linearCells, linearCellPositions);
    expect(anchorIndices.length).toBe(linearCells.length);
    expect(anchorIndices[0]).toBe(0);
  });

  it("preserves anchor positions in the output", () => {
    const { points, anchorIndices } = meander(linearCells, linearCellPositions);
    for (let k = 0; k < linearCells.length; k++) {
      const expected = linearCellPositions[linearCells[k]];
      const actual = points[anchorIndices[k]];
      expect(actual[0]).toBe(expected[0]);
      expect(actual[1]).toBe(expected[1]);
    }
  });

  it("inserts interior meander points on perpendicular side; reversing puts them on opposite side", () => {
    const forward = meander(linearCells, linearCellPositions);
    const reversed = meander(linearCells.slice().reverse(), linearCellPositions);

    expect(forward.points.length).toBeGreaterThan(forward.anchorIndices.length);
    expect(reversed.points.length).toBe(forward.points.length);

    // Find any interior point in forward output and confirm at least one has non-zero y (perpendicular offset)
    const interiorYs = forward.points
      .map((p, i) => (forward.anchorIndices.includes(i) ? null : p[1]))
      .filter((y): y is number => y !== null);
    expect(interiorYs.some(y => y !== 0)).toBe(true);

    // Sum of interior y-offsets should flip sign when input is reversed (mirror symmetry).
    const interiorYReversed = reversed.points
      .map((p, i) => (reversed.anchorIndices.includes(i) ? null : p[1]))
      .filter((y): y is number => y !== null);
    const forwardSign = Math.sign(interiorYs.reduce((s, y) => s + y, 0));
    const reverseSign = Math.sign(interiorYReversed.reduce((s, y) => s + y, 0));
    expect(forwardSign).not.toBe(0);
    expect(reverseSign).not.toBe(0);
    expect(forwardSign).not.toBe(reverseSign);
  });

  it("shrinks meander amplitude as startStep increases", () => {
    // Use cells.length >= 6 and modest spacing so both startStep values land in the same branch
    // (single interior point per segment), letting us compare amplitudes directly.
    const cells = [0, 1, 2, 3, 4, 5];
    const positions: Point[] = [
      [0, 0],
      [7, 0],
      [14, 0],
      [21, 0],
      [28, 0],
      [35, 0]
    ];

    const lowStep = meander(cells, positions, { startStep: 30 });
    const highStep = meander(cells, positions, { startStep: 60 });

    expect(lowStep.points.length).toBe(highStep.points.length);

    // Compare interior point amplitudes (distance from y=0)
    const lowInterior = lowStep.points.filter((_, i) => !lowStep.anchorIndices.includes(i));
    const highInterior = highStep.points.filter((_, i) => !highStep.anchorIndices.includes(i));
    expect(lowInterior.length).toBeGreaterThan(0);
    expect(highInterior.length).toBe(lowInterior.length);

    const lowAmplitude = Math.abs(lowInterior[0][1]);
    const highAmplitude = Math.abs(highInterior[0][1]);
    expect(highAmplitude).toBeLessThan(lowAmplitude);
    // Perpendicular direction (sign of y offset) is the same since cells are in same order
    expect(Math.sign(lowInterior[0][1])).toBe(Math.sign(highInterior[0][1]));
  });

  it("resolves an off-map (-1) entry to the nearest map edge via bounds", () => {
    const cells = [0, 1, -1];
    const positions: Point[] = [
      [50, 50],
      [50, 80] // near bottom edge
    ];
    const { points, anchorIndices } = meander(cells, positions, {
      bounds: { width: 100, height: 100 }
    });

    // Anchor for the -1 cell should be projected to the bottom edge (y=100), using cell 1's position
    const lastAnchorIdx = anchorIndices[2];
    const lastAnchor = points[lastAnchorIdx];
    expect(lastAnchor[0]).toBe(50);
    expect(lastAnchor[1]).toBe(100);
  });

  it("flips meander direction at acute turns to smooth cusps, never moving anchors", () => {
    const angleAt = (points: Point[], i: number) => {
      const [px, py] = points[i - 1];
      const [cx, cy] = points[i];
      const [nx, ny] = points[i + 1];
      const ax = px - cx;
      const ay = py - cy;
      const bx = nx - cx;
      const by = ny - cy;
      const cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
      return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    };

    // A serpentine backbone whose cell turns would otherwise fold into acute "V" cusps once the
    // perpendicular meander offsets are applied.
    const cells = [0, 1, 2, 3, 4, 5];
    const positions: Point[] = [
      [0, 0],
      [10, 8],
      [20, 0],
      [30, 8],
      [40, 0],
      [50, 8]
    ];
    const { points, anchorIndices } = meander(cells, positions, { startStep: 6 });

    // Anchors (real control points: confluences, ports) must stay exactly on their cell centres —
    // displacing them would tear tributary confluences apart or pull river ports off the course.
    for (let k = 0; k < cells.length; k++) {
      expect(points[anchorIndices[k]]).toEqual(positions[cells[k]]);
    }

    // No corner — at an anchor or a meander point — is left acute after flipping.
    let minAngle = 180;
    for (let i = 1; i < points.length - 1; i++) minAngle = Math.min(minAngle, angleAt(points, i));
    expect(minAngle).toBeGreaterThan(88);

    // Flipping mirrors a meander point across its baseline, so the amplitude is preserved (not
    // flattened): a straight backbone still carries its meander S-curve off the centreline.
    const straight = meander(linearCells, linearCellPositions, { startStep: 10 });
    expect(Math.max(...straight.points.map(p => Math.abs(p[1])))).toBeGreaterThan(0);
  });

  it("honours explicit anchors override", () => {
    const cells = [0, 1, 2];
    const positions: Point[] = [
      [0, 0],
      [10, 0],
      [20, 0]
    ];
    const overrideAnchors: Point[] = [
      [5, 5],
      [15, 5],
      [25, 5]
    ];
    const { points, anchorIndices } = meander(cells, positions, { anchors: overrideAnchors });

    for (let k = 0; k < cells.length; k++) {
      const actual = points[anchorIndices[k]];
      expect(actual[0]).toBe(overrideAnchors[k][0]);
      expect(actual[1]).toBe(overrideAnchors[k][1]);
    }
  });
});

describe("findPath", () => {
  it("returns null when start is already the exit", () => {
    const graph = { cells: { c: [[1], [0]] } };
    expect(
      findPath(
        0,
        id => id === 0,
        () => 1,
        graph
      )
    ).toBeNull();
  });

  it("does not early-exit via a cheap last hop after an expensive climb", () => {
    // Topology (Nesia-style):
    //   0 — 1 — 2 — 3(exit)   moderate ridge through 2 (cheap overall)
    //         \   /
    //           4               high peak 4 with cheap last hop 4→3
    // Old bug: process 4 first (if prefix cheap), see exit 3, return via 4.
    const graph = {
      cells: {
        c: [
          [1], // 0
          [0, 2, 4], // 1
          [1, 3], // 2
          [2, 4], // 3 exit
          [1, 3] // 4 peak
        ]
      }
    };
    const edgeCost = (from: number, to: number): number => {
      // Climb onto peak is expensive; last hop from peak is cheap; moderate ridge is mid-cost.
      if ((from === 1 && to === 4) || (from === 4 && to === 1)) return 1000;
      if ((from === 4 && to === 3) || (from === 3 && to === 4)) return 1;
      if ((from === 1 && to === 2) || (from === 2 && to === 1)) return 10;
      if ((from === 2 && to === 3) || (from === 3 && to === 2)) return 10;
      if ((from === 0 && to === 1) || (from === 1 && to === 0)) return 1;
      return 10;
    };
    // Total via 2: 1+10+10=21. Total via 4: 1+1000+1=1002.
    expect(findPath(0, id => id === 3, edgeCost, graph)).toEqual([0, 1, 2, 3]);
  });

  it("still requires a passable edge into the exit (sea haven style)", () => {
    // 0 can only reach 2 through 1; edge 1→2 is blocked (wrong haven).
    const graph = { cells: { c: [[1], [0, 2], [1]] } };
    const getCost = (from: number, to: number) => (from === 1 && to === 2 ? Infinity : 1);
    expect(findPath(0, id => id === 2, getCost, graph)).toBeNull();
  });
});
