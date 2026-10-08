import { townCenter } from "../core/passages";
import type { CityDocument, EdgeFeatureGroup, Point } from "../core/types";

export interface WallGeometryParams {
  material: "stone" | "wood";
  widthMeters: number;
  hasWalkway: boolean;
  parapetWidth: number;
  walkwayWidth: number;
  innerWallWidth: number;
}

/**
 * Calculates wall cross-section parameters based on width and material.
 * If walkway is forced or automatic (width >= threshold), walkway is generated.
 * For wider walls, the walkway absorbs the extra width, accommodating wide troop movement.
 */
export function resolveWallGeometry(
  widthMeters: number,
  material: "stone" | "wood",
  walkwaySetting?: "auto" | "none" | "walkway"
): WallGeometryParams {
  const mode = walkwaySetting ?? "auto";
  const autoThreshold = material === "wood" ? 1.8 : 2.0;
  const hasWalkway = mode === "none" ? false : mode === "walkway" ? true : widthMeters >= autoThreshold;

  if (!hasWalkway) {
    return {
      material,
      widthMeters,
      hasWalkway: false,
      parapetWidth: widthMeters,
      walkwayWidth: 0,
      innerWallWidth: 0
    };
  }

  if (material === "wood") {
    // Timber wall with walkway (palisade catwalk / wood-and-earth box rampart)
    const parapetWidth = Math.max(0.5, Math.min(0.9, widthMeters * 0.3));
    const walkwayWidth = Math.max(0.8, widthMeters - parapetWidth);
    return {
      material: "wood",
      widthMeters,
      hasWalkway: true,
      parapetWidth,
      walkwayWidth,
      innerWallWidth: 0.25
    };
  }

  // Stone curtain wall with battlement (merlons) and stone walkway
  const parapetWidth = Math.max(0.7, Math.min(1.2, widthMeters * 0.26));
  const innerWallWidth = Math.max(0.3, Math.min(0.5, widthMeters * 0.12));
  const walkwayWidth = Math.max(0.8, widthMeters - parapetWidth - innerWallWidth);
  return {
    material: "stone",
    widthMeters,
    hasWalkway: true,
    parapetWidth,
    walkwayWidth,
    innerWallWidth
  };
}

/**
 * Check if the closed polygon is oriented clockwise.
 */
function _isClockwise(points: Point[]): boolean {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += (b[0] - a[0]) * (b[1] + a[1]);
  }
  return sum > 0;
}

/**
 * Offsets a polyline by a given distance along outward normals.
 * Positive distance = outward (away from town center).
 * Negative distance = inward (toward town center).
 */
export function offsetPolyline(run: Point[], offsetMeters: number, center: Point): Point[] {
  if (run.length < 2 || Math.abs(offsetMeters) < 0.001) return [...run];

  const n = run.length;
  const isClosed = Math.hypot(run[0][0] - run[n - 1][0], run[0][1] - run[n - 1][1]) < 0.01;

  // Compute segment normals oriented outward
  const segmentNormals: Point[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = run[i];
    const b = run[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      segmentNormals.push([0, 1]);
      continue;
    }
    // Normal: (-dy / len, dx / len)
    const nx = -dy / len;
    const ny = dx / len;

    // Determine inward vs outward direction relative to center
    const midX = (a[0] + b[0]) / 2;
    const midY = (a[1] + b[1]) / 2;
    const toCenterX = center[0] - midX;
    const toCenterY = center[1] - midY;
    const dot = nx * toCenterX + ny * toCenterY;

    // Outward points away from center (dot with toCenter should be negative)
    const sign = dot > 0 ? -1 : 1;
    segmentNormals.push([nx * sign, ny * sign]);
  }

  // Calculate vertex normals
  const result: Point[] = [];
  const maxMiter = 1.8; // clamp sharp corners to avoid runaway offsets

  for (let i = 0; i < n; i++) {
    let norm: Point;
    if (i === 0) {
      if (isClosed) {
        const nPrev = segmentNormals[segmentNormals.length - 1];
        const nNext = segmentNormals[0];
        norm = normalize([nPrev[0] + nNext[0], nPrev[1] + nNext[1]]) ?? nNext;
      } else {
        norm = segmentNormals[0];
      }
    } else if (i === n - 1) {
      if (isClosed) {
        norm = result[0]
          ? [result[0][0] - run[0][0], result[0][1] - run[0][1]]
          : segmentNormals[segmentNormals.length - 1];
      } else {
        norm = segmentNormals[segmentNormals.length - 1];
      }
    } else {
      const nPrev = segmentNormals[i - 1];
      const nNext = segmentNormals[i];
      const sum = [nPrev[0] + nNext[0], nPrev[1] + nNext[1]];
      norm = normalize(sum as Point) ?? nNext;
    }

    const dist = Math.min(Math.max(offsetMeters, -offsetMeters * maxMiter), offsetMeters * maxMiter);
    result.push([run[i][0] + norm[0] * dist, run[i][1] + norm[1] * dist]);
  }

  return result;
}

function normalize(p: Point): Point | null {
  const len = Math.hypot(p[0], p[1]);
  return len > 1e-6 ? [p[0] / len, p[1] / len] : null;
}

function polylineToPathData(points: Point[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0][0]} ${-points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0]} ${-points[i][1]}`;
  }
  return d;
}

/**
 * Renders decorative SVG structure layers for a wall segment.
 * Includes outer parapet (timber log caps or stone merlons),
 * upper walkway (planks or flagstone paving), inner rail, and shadow.
 */
export function renderWallStructure(
  document: CityDocument,
  wall: EdgeFeatureGroup,
  run: Point[],
  createElement: (name: string, attrs: Record<string, string>) => SVGElement
): SVGElement {
  const container = createElement("g", {
    class: `ce-wall-structure ce-wall-structure--${wall.wallMaterial ?? "stone"}`,
    "pointer-events": "none"
  });

  if (run.length < 2) return container;

  const material = wall.wallMaterial ?? "stone";
  const width = wall.style.widthMeters;
  const geom = resolveWallGeometry(width, material, wall.walkway);
  const center = townCenter(document);

  if (material === "wood") {
    renderTimberWall(container, run, geom, center, createElement);
  } else {
    renderStoneWall(container, run, geom, center, createElement);
  }

  return container;
}

function renderTimberWall(
  container: SVGElement,
  run: Point[],
  geom: WallGeometryParams,
  center: Point,
  element: (name: string, attrs: Record<string, string>) => SVGElement
): void {
  const { widthMeters, hasWalkway, parapetWidth, walkwayWidth } = geom;

  if (!hasWalkway) {
    // Narrow palisade / plain log fence: tightly packed vertical log tops along wall
    const logDiameter = Math.max(0.5, Math.min(widthMeters, 1.1));
    const step = logDiameter * 0.95;

    // Foundation/base run
    container.appendChild(
      element("path", {
        d: polylineToPathData(run),
        class: "ce-wall-wood-base",
        fill: "none",
        stroke: "#54371e",
        "stroke-width": String(widthMeters),
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      })
    );

    // Outer log caps (round circles repeating along polyline)
    container.appendChild(
      element("path", {
        d: polylineToPathData(run),
        class: "ce-wall-wood-logs",
        fill: "none",
        stroke: "#805934",
        "stroke-width": String(logDiameter),
        "stroke-linecap": "round",
        "stroke-dasharray": `0.05 ${step.toFixed(2)}`
      })
    );

    // Inner log core / tree ring centers
    container.appendChild(
      element("path", {
        d: polylineToPathData(run),
        class: "ce-wall-wood-cores",
        fill: "none",
        stroke: "#3d240e",
        "stroke-width": String(logDiameter * 0.35),
        "stroke-linecap": "round",
        "stroke-dasharray": `0.05 ${step.toFixed(2)}`
      })
    );
    return;
  }

  // Broad timber wall with upper catwalk / walkway (box rampart or palisade walkway)
  // Outer parapet offset outward, walkway offset inward
  const parapetOffset = (widthMeters - parapetWidth) / 2;
  const walkwayOffset = -(widthMeters - walkwayWidth) / 2;
  const shadowOffset = parapetOffset - parapetWidth / 2;

  const parapetRun = offsetPolyline(run, parapetOffset, center);
  const walkwayRun = offsetPolyline(run, walkwayOffset, center);
  const shadowRun = offsetPolyline(run, shadowOffset, center);
  const innerEdgeRun = offsetPolyline(run, -widthMeters / 2 + 0.15, center);

  // 1. Walkway deck (light timber planks)
  container.appendChild(
    element("path", {
      d: polylineToPathData(walkwayRun),
      class: "ce-wall-wood-deck",
      fill: "none",
      stroke: "#9e774f",
      "stroke-width": String(walkwayWidth),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );

  // 2. Plank seam lines (texture along the walkway)
  container.appendChild(
    element("path", {
      d: polylineToPathData(walkwayRun),
      class: "ce-wall-wood-planks",
      fill: "none",
      stroke: "#694c2d",
      "stroke-width": String(Math.max(0.15, walkwayWidth * 0.2)),
      "stroke-dasharray": "0.3 0.8",
      "stroke-linecap": "butt",
      opacity: "0.6"
    })
  );

  // 3. Drop shadow cast by the taller palisade onto the catwalk
  container.appendChild(
    element("path", {
      d: polylineToPathData(shadowRun),
      class: "ce-wall-wood-shadow",
      fill: "none",
      stroke: "rgba(35, 20, 10, 0.4)",
      "stroke-width": String(Math.min(0.4, parapetWidth * 0.5)),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );

  // 4. Outer palisade logs (log tops)
  const logDiam = Math.max(0.45, Math.min(parapetWidth, 0.9));
  const logStep = logDiam * 0.95;

  container.appendChild(
    element("path", {
      d: polylineToPathData(parapetRun),
      class: "ce-wall-wood-logs",
      fill: "none",
      stroke: "#785330",
      "stroke-width": String(logDiam),
      "stroke-linecap": "round",
      "stroke-dasharray": `0.05 ${logStep.toFixed(2)}`
    })
  );

  container.appendChild(
    element("path", {
      d: polylineToPathData(parapetRun),
      class: "ce-wall-wood-cores",
      fill: "none",
      stroke: "#38200b",
      "stroke-width": String(logDiam * 0.35),
      "stroke-linecap": "round",
      "stroke-dasharray": `0.05 ${logStep.toFixed(2)}`
    })
  );

  // 5. Inner rail / rim beam
  container.appendChild(
    element("path", {
      d: polylineToPathData(innerEdgeRun),
      class: "ce-wall-wood-rail",
      fill: "none",
      stroke: "#523419",
      "stroke-width": "0.3",
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );
}

function renderStoneWall(
  container: SVGElement,
  run: Point[],
  geom: WallGeometryParams,
  center: Point,
  element: (name: string, attrs: Record<string, string>) => SVGElement
): void {
  const { widthMeters, hasWalkway, parapetWidth, walkwayWidth, innerWallWidth } = geom;

  if (!hasWalkway) {
    // Narrow single stone wall (masonry blocks)
    // Foundation dark masonry
    container.appendChild(
      element("path", {
        d: polylineToPathData(run),
        class: "ce-wall-stone-base",
        fill: "none",
        stroke: "#292a26",
        "stroke-width": String(widthMeters),
        "stroke-linejoin": "round",
        "stroke-linecap": "round"
      })
    );

    // Masonry joint gaps / block marks
    container.appendChild(
      element("path", {
        d: polylineToPathData(run),
        class: "ce-wall-stone-joints",
        fill: "none",
        stroke: "#181916",
        "stroke-width": String(widthMeters),
        "stroke-dasharray": "0.2 1.6",
        "stroke-linecap": "butt",
        opacity: "0.7"
      })
    );

    // Stone top highlight
    container.appendChild(
      element("path", {
        d: polylineToPathData(run),
        class: "ce-wall-stone-highlight",
        fill: "none",
        stroke: "#4a4b44",
        "stroke-width": String(Math.max(0.2, widthMeters * 0.35)),
        "stroke-linecap": "round",
        opacity: "0.5"
      })
    );
    return;
  }

  // Broad stone curtain wall with battlements (merlons/crenels) and paved wall-walk
  const parapetOffset = (widthMeters - parapetWidth) / 2;
  const innerWallOffset = -(widthMeters - innerWallWidth) / 2;
  const walkwayOffset = (parapetOffset + innerWallOffset) / 2;
  const shadowOffset = parapetOffset - parapetWidth / 2;

  const parapetRun = offsetPolyline(run, parapetOffset, center);
  const walkwayRun = offsetPolyline(run, walkwayOffset, center);
  const innerRun = offsetPolyline(run, innerWallOffset, center);
  const shadowRun = offsetPolyline(run, shadowOffset, center);

  // 1. Stone foundation (full width dark stone bed)
  container.appendChild(
    element("path", {
      d: polylineToPathData(run),
      class: "ce-wall-stone-base",
      fill: "none",
      stroke: "#292a26",
      "stroke-width": String(widthMeters),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );

  // 2. Paved flagstone walkway (lighter stone paving)
  container.appendChild(
    element("path", {
      d: polylineToPathData(walkwayRun),
      class: "ce-wall-stone-walkway",
      fill: "none",
      stroke: "#beb9ab",
      "stroke-width": String(walkwayWidth),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );

  // 3. Flagstone joints (subtle stone pavers texture)
  container.appendChild(
    element("path", {
      d: polylineToPathData(walkwayRun),
      class: "ce-wall-stone-paving-joints",
      fill: "none",
      stroke: "#8c877b",
      "stroke-width": String(Math.max(0.15, walkwayWidth * 0.3)),
      "stroke-dasharray": "0.2 1.4",
      "stroke-linecap": "butt",
      opacity: "0.5"
    })
  );

  // 4. Drop shadow cast from the higher outer parapet onto the walkway
  container.appendChild(
    element("path", {
      d: polylineToPathData(shadowRun),
      class: "ce-wall-stone-shadow",
      fill: "none",
      stroke: "rgba(0, 0, 0, 0.35)",
      "stroke-width": String(Math.min(0.45, parapetWidth * 0.5)),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );

  // 5. Outer battlement / parapet wall with merlons (crenellations)
  // Continuous base parapet
  container.appendChild(
    element("path", {
      d: polylineToPathData(parapetRun),
      class: "ce-wall-stone-parapet",
      fill: "none",
      stroke: "#242521",
      "stroke-width": String(parapetWidth),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );

  // Merlons (raised teeth along outer edge)
  container.appendChild(
    element("path", {
      d: polylineToPathData(parapetRun),
      class: "ce-wall-stone-merlons",
      fill: "none",
      stroke: "#3d3e38",
      "stroke-width": String(parapetWidth * 0.9),
      "stroke-dasharray": "2.2 1.0",
      "stroke-linecap": "butt"
    })
  );

  // 6. Inner low parapet / curb stone
  container.appendChild(
    element("path", {
      d: polylineToPathData(innerRun),
      class: "ce-wall-stone-inner-rail",
      fill: "none",
      stroke: "#31322d",
      "stroke-width": String(innerWallWidth),
      "stroke-linejoin": "round",
      "stroke-linecap": "round"
    })
  );
}

/**
 * Renders decorative overlays for a wall tower (corner or curtain tower).
 * For wood: timber platform deck, log cap fringe, center post/hatch.
 * For stone: paved flagstone floor, inner shadow, and battlement merlons.
 */
export function renderTowerDecoration(
  point: Point,
  radius: number,
  material: "stone" | "wood",
  element: (name: string, attrs: Record<string, string>) => SVGElement
): SVGElement {
  const g = element("g", {
    class: `ce-tower-decoration ce-tower-decoration--${material}`,
    "pointer-events": "none"
  });

  const cx = String(point[0]);
  const cy = String(-point[1]);

  if (material === "wood") {
    // 1. Plank deck floor inside the log parapet
    const floorR = radius * 0.72;
    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(floorR),
        class: "ce-tower-wood-deck",
        fill: "#9e774f"
      })
    );

    // 2. Plank seam lines (texture)
    const slitStep = Math.max(0.6, floorR * 0.35);
    for (let dy = -floorR + slitStep; dy < floorR; dy += slitStep) {
      const dx = Math.sqrt(Math.max(0, floorR * floorR - dy * dy));
      g.appendChild(
        element("line", {
          x1: String(point[0] - dx),
          y1: String(-point[1] + dy),
          x2: String(point[0] + dx),
          y2: String(-point[1] + dy),
          class: "ce-tower-wood-planks",
          stroke: "#694c2d",
          "stroke-width": "0.2",
          opacity: "0.7"
        })
      );
    }

    // 3. Ring of log tops along the perimeter
    const logDiam = Math.max(0.35, radius * 0.28);
    const circ = 2 * Math.PI * (radius - logDiam / 2);
    const logCount = Math.max(6, Math.round(circ / (logDiam * 0.95)));
    const step = circ / logCount;

    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(radius - logDiam / 2),
        class: "ce-tower-wood-logs",
        fill: "none",
        stroke: "#785330",
        "stroke-width": String(logDiam),
        "stroke-linecap": "round",
        "stroke-dasharray": `0.05 ${step.toFixed(2)}`
      })
    );

    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(radius - logDiam / 2),
        class: "ce-tower-wood-cores",
        fill: "none",
        stroke: "#38200b",
        "stroke-width": String(logDiam * 0.35),
        "stroke-linecap": "round",
        "stroke-dasharray": `0.05 ${step.toFixed(2)}`
      })
    );

    // 4. Center watch hatch / support post
    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(Math.max(0.25, radius * 0.2)),
        class: "ce-tower-wood-hatch",
        fill: "#422912"
      })
    );
  } else {
    // Stone round tower
    // 1. Paved flagstone floor (connected to wall walkway)
    const floorR = radius * 0.68;
    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(floorR),
        class: "ce-tower-stone-floor",
        fill: "#beb9ab"
      })
    );

    // 2. Flagstone paving texture
    const slitStep = Math.max(0.7, floorR * 0.4);
    for (let dy = -floorR + slitStep; dy < floorR; dy += slitStep) {
      const dx = Math.sqrt(Math.max(0, floorR * floorR - dy * dy));
      g.appendChild(
        element("line", {
          x1: String(point[0] - dx),
          y1: String(-point[1] + dy),
          x2: String(point[0] + dx),
          y2: String(-point[1] + dy),
          class: "ce-tower-stone-joints",
          stroke: "#8c877b",
          "stroke-width": "0.15",
          opacity: "0.6"
        })
      );
    }

    // 3. Drop shadow cast from the higher parapet
    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(floorR),
        class: "ce-tower-stone-shadow",
        fill: "none",
        stroke: "rgba(0, 0, 0, 0.35)",
        "stroke-width": "0.35"
      })
    );

    // 4. Parapet battlements (merlons) along the outer perimeter
    const wallWidth = radius * 0.32;
    const merlonR = radius - wallWidth / 2;
    const circ = 2 * Math.PI * merlonR;
    const period = 2.4;
    const count = Math.max(4, Math.round(circ / period));
    const actualPeriod = circ / count;
    const merlonLen = actualPeriod * 0.68;
    const gapLen = actualPeriod - merlonLen;

    g.appendChild(
      element("circle", {
        cx,
        cy,
        r: String(merlonR),
        class: "ce-tower-stone-merlons",
        fill: "none",
        stroke: "#3d3e38",
        "stroke-width": String(wallWidth * 0.9),
        "stroke-dasharray": `${merlonLen.toFixed(2)} ${gapLen.toFixed(2)}`,
        "stroke-linecap": "butt"
      })
    );
  }

  return g;
}

/**
 * Renders decorative overlays for a town gatehouse in the gate's local coordinate frame.
 * (X along wall tangent, Y inward toward town).
 * For wood: timber blockhouse decks, corner posts, heavy wooden gate doors, catwalk overpass.
 * For stone: paved stone floor, crenellations, portcullis iron grate, stone wall walk overpass.
 */
export function renderGateDecoration(
  side: number,
  opening: number,
  wallWidth: number,
  material: "stone" | "wood",
  drawbridge: boolean,
  element: (name: string, attrs: Record<string, string>) => SVGElement
): SVGElement {
  const g = element("g", {
    class: `ce-gate-decoration ce-gate-decoration--${material}`,
    "pointer-events": "none"
  });

  const towerY = -side / 2;
  const leftX = -opening / 2 - side;
  const rightX = opening / 2;

  if (material === "wood") {
    const pad = Math.max(0.4, side * 0.16);
    // 1. Timber decks on both flank towers
    for (const tx of [leftX, rightX]) {
      g.appendChild(
        element("rect", {
          x: String(tx + pad),
          y: String(towerY + pad),
          width: String(side - 2 * pad),
          height: String(side - 2 * pad),
          class: "ce-gate-wood-deck",
          fill: "#9e774f"
        })
      );

      // Plank lines
      const plankStep = Math.max(0.6, (side - 2 * pad) * 0.3);
      for (let y = towerY + pad + plankStep; y < towerY + side - pad; y += plankStep) {
        g.appendChild(
          element("line", {
            x1: String(tx + pad),
            y1: String(y),
            x2: String(tx + side - pad),
            y2: String(y),
            stroke: "#694c2d",
            "stroke-width": "0.2",
            opacity: "0.7"
          })
        );
      }

      // 4 corner timber posts on each flank tower
      const postR = pad * 0.7;
      const corners = [
        [tx + pad / 2, towerY + pad / 2],
        [tx + side - pad / 2, towerY + pad / 2],
        [tx + pad / 2, towerY + side - pad / 2],
        [tx + side - pad / 2, towerY + side - pad / 2]
      ];
      for (const [px, py] of corners) {
        g.appendChild(
          element("circle", {
            cx: String(px),
            cy: String(py),
            r: String(postR),
            class: "ce-gate-wood-post",
            fill: "#785330"
          })
        );
        g.appendChild(
          element("circle", {
            cx: String(px),
            cy: String(py),
            r: String(postR * 0.35),
            fill: "#38200b"
          })
        );
      }
    }

    // 2. Timber catwalk overpass connecting the towers across the gate opening
    const overpassDepth = Math.max(0.8, wallWidth * 0.6);
    g.appendChild(
      element("rect", {
        x: String(-opening / 2),
        y: String(-overpassDepth / 2),
        width: String(opening),
        height: String(overpassDepth),
        class: "ce-gate-wood-overpass",
        fill: "#9e774f",
        stroke: "#54371e",
        "stroke-width": "0.3"
      })
    );

    // 3. Heavy timber gate doors (at the outer portal side: negative Y)
    const doorY = -wallWidth * 0.35;
    g.appendChild(
      element("line", {
        x1: String(-opening * 0.45),
        y1: String(doorY),
        x2: String(opening * 0.45),
        y2: String(doorY),
        class: "ce-gate-wood-doors",
        stroke: "#3d220c",
        "stroke-width": "0.6",
        "stroke-linecap": "butt"
      })
    );
  } else {
    // Stone gatehouse
    const pad = Math.max(0.5, side * 0.18);
    // 1. Paved flagstone decks on both square flank towers
    for (const tx of [leftX, rightX]) {
      g.appendChild(
        element("rect", {
          x: String(tx + pad),
          y: String(towerY + pad),
          width: String(side - 2 * pad),
          height: String(side - 2 * pad),
          class: "ce-gate-stone-floor",
          fill: "#beb9ab"
        })
      );

      // Paving seam texture
      const seamStep = Math.max(0.8, (side - 2 * pad) * 0.35);
      for (let y = towerY + pad + seamStep; y < towerY + side - pad; y += seamStep) {
        g.appendChild(
          element("line", {
            x1: String(tx + pad),
            y1: String(y),
            x2: String(tx + side - pad),
            y2: String(y),
            stroke: "#8c877b",
            "stroke-width": "0.15",
            opacity: "0.6"
          })
        );
      }

      // Parapet drop shadow
      g.appendChild(
        element("rect", {
          x: String(tx + pad),
          y: String(towerY + pad),
          width: String(side - 2 * pad),
          height: String(side - 2 * pad),
          fill: "none",
          stroke: "rgba(0, 0, 0, 0.32)",
          "stroke-width": "0.35"
        })
      );

      // Crenellation merlons along outer edges of the square towers
      g.appendChild(
        element("rect", {
          x: String(tx + pad / 2),
          y: String(towerY + pad / 2),
          width: String(side - pad),
          height: String(side - pad),
          class: "ce-gate-stone-merlons",
          fill: "none",
          stroke: "#3d3e38",
          "stroke-width": String(pad * 0.8),
          "stroke-dasharray": "1.8 0.9"
        })
      );
    }

    // 2. Stone walkway overpass across the gate opening
    const overpassDepth = Math.max(1.0, wallWidth * 0.65);
    g.appendChild(
      element("rect", {
        x: String(-opening / 2),
        y: String(-overpassDepth / 2),
        width: String(opening),
        height: String(overpassDepth),
        class: "ce-gate-stone-overpass",
        fill: "#beb9ab",
        stroke: "#292a26",
        "stroke-width": "0.35"
      })
    );

    // 3. Portcullis / Iron grating at the outer archway
    const portcullisY = -wallWidth * 0.4;
    g.appendChild(
      element("line", {
        x1: String(-opening * 0.45),
        y1: String(portcullisY),
        x2: String(opening * 0.45),
        y2: String(portcullisY),
        class: "ce-gate-stone-portcullis",
        stroke: "#141512",
        "stroke-width": "0.6",
        "stroke-dasharray": "0.2 0.4",
        "stroke-linecap": "butt"
      })
    );
  }

  return g;
}
