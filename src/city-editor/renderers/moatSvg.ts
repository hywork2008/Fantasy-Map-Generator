import { featureGroupVertices } from "../generators/features";
import { boundaryEdges, gateTownCircuit } from "../generators/fortifications";
import { nearestOnPolyline } from "../generators/geom";
import { facePoints } from "../generators/mesh";
import { gateCrossingFrame } from "../generators/passages";
import type { CityDocument, CityGate, EdgeRef, Id, Point } from "../types/document";
import { edgeGroupPoints, element, isPoint, line, polygon } from "./svgPrimitives";
export function gateHasMoat(document: CityDocument, gate: CityGate): boolean {
  return (document.defenseCircuits ?? []).some(
    circuit =>
      (gate.ownerCastleId
        ? circuit.scope === "castle" && circuit.ownerCastleId === gate.ownerCastleId
        : circuit.id === gateTownCircuit(document, gate)?.id) &&
      circuit.moat?.enabled &&
      document.featureGroups.some(
        group =>
          group.kind === "wall" &&
          circuit.wallGroupIds.includes(group.id) &&
          group.segments.some(ref => {
            const edge = document.mesh.edges[ref.edgeId];
            return edge && (edge.a === gate.vertexId || edge.b === gate.vertexId);
          })
      )
  );
}

export function drawbridgeGate(document: CityDocument, points: Point[], width: number): CityGate | undefined {
  return document.gates
    .filter(gate => gateHasMoat(document, gate))
    .map(gate => ({ gate, distance: nearestOnPolyline(document.mesh.vertices[gate.vertexId].point, points).dist }))
    .filter(candidate => candidate.distance <= Math.max(width, candidate.gate.passageWidthMeters ?? 8))
    .sort((a, b) => a.distance - b.distance)[0]?.gate;
}

/** A short lowered timber leaf at the gate meets the fixed bridge from the far bank. */
export function renderDrawbridge(
  document: CityDocument,
  points: Point[],
  width: number,
  gateId: Id,
  bridgeClass: string
): SVGGElement {
  const gate = document.gates.find(g => g.id === gateId)!;
  const wall = document.featureGroups.find(
    g => g.kind === "wall" && featureGroupVertices(document, g).includes(gate.vertexId)
  );
  const bridge = element("g", {
    class: `${bridgeClass} ce-drawbridge`,
    "data-gate-id": gateId,
    "pointer-events": "none"
  }) as SVGGElement;
  const leaf: Point[] = [points[0]];
  const fixed: Point[] = [];
  // Include the part under the gate so four metres remain visible outside.
  let remaining = 4 + (wall?.style.widthMeters ?? 0) / 2;
  for (let i = 1; i < points.length; i++) {
    if (fixed.length) {
      fixed.push(points[i]);
      continue;
    }
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length <= remaining) {
      leaf.push(b);
      remaining -= length;
      continue;
    }
    const t = remaining / length;
    const joint: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    leaf.push(joint);
    fixed.push(joint, b);
  }
  if (fixed.length > 1) {
    bridge.appendChild(
      element("path", {
        d: line(fixed),
        class: "ce-moat-fixed-bridge-outline",
        fill: "none",
        stroke: "#57534b",
        "stroke-width": String(width + 1.2),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round"
      })
    );
    bridge.appendChild(
      element("path", {
        d: line(fixed),
        class: "ce-moat-fixed-bridge-deck",
        fill: "none",
        stroke: "#bcb6a5",
        "stroke-width": String(width),
        "stroke-linecap": "butt",
        "stroke-linejoin": "round"
      })
    );
  }
  points = leaf;
  bridge.appendChild(
    element("path", {
      d: line(points),
      class: "ce-drawbridge-outline",
      fill: "none",
      stroke: "#44372a",
      "stroke-width": String(width + 1.2),
      "stroke-linecap": "butt",
      "stroke-linejoin": "round"
    })
  );
  bridge.appendChild(
    element("path", {
      d: line(points),
      class: "ce-drawbridge-deck",
      fill: "none",
      stroke: "#b18a5b",
      "stroke-width": String(width),
      "stroke-linecap": "butt",
      "stroke-linejoin": "round"
    })
  );
  let travelled = 0;
  let nextBoard = 0.8;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.001) continue;
    const nx = -(b[1] - a[1]) / length,
      ny = (b[0] - a[0]) / length;
    while (nextBoard < travelled + length) {
      const t = (nextBoard - travelled) / length;
      const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      bridge.appendChild(
        element("path", {
          d: line([
            [p[0] - (nx * width) / 2, p[1] - (ny * width) / 2],
            [p[0] + (nx * width) / 2, p[1] + (ny * width) / 2]
          ]),
          class: "ce-drawbridge-plank",
          fill: "none",
          stroke: "#725436",
          "stroke-width": "0.3"
        })
      );
      nextBoard += 1;
    }
    travelled += length;
  }
  const start = points[0],
    end = points[points.length - 1];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  if (length > 0.001) {
    const nx = -(end[1] - start[1]) / length,
      ny = (end[0] - start[0]) / length;
    for (const side of [-1, 1]) {
      const from: Point = [start[0] + nx * side * (width / 2 + 0.5), start[1] + ny * side * (width / 2 + 0.5)];
      const to: Point = [end[0] + nx * side * (width / 2 - 0.5), end[1] + ny * side * (width / 2 - 0.5)];
      bridge.appendChild(
        element("path", {
          d: line([from, to]),
          class: "ce-drawbridge-chain",
          fill: "none",
          stroke: "#3e4140",
          "stroke-width": "0.45",
          "stroke-dasharray": "0.65 0.4"
        })
      );
    }
    bridge.appendChild(
      element("path", {
        d: line([
          [start[0] - (nx * width) / 2, start[1] - (ny * width) / 2],
          [start[0] + (nx * width) / 2, start[1] + (ny * width) / 2]
        ]),
        class: "ce-drawbridge-hinge",
        fill: "none",
        stroke: "#343432",
        "stroke-width": "0.9"
      })
    );
  }
  return bridge;
}

/** Exterior-only strokes keep the water against the curtain without changing mesh cells. */
export function renderMoats(document: CityDocument): SVGGElement {
  const layer = element("g", { class: "ce-moats", "pointer-events": "none" }) as SVGGElement;
  const claimed = new Set<Id>();
  const circuits = [...(document.defenseCircuits ?? [])].sort(
    (a, b) => (a.scope === "town" ? 0 : 1) - (b.scope === "town" ? 0 : 1)
  );
  for (const [index, circuit] of circuits.entries()) {
    if (!circuit.moat?.enabled || !(circuit.moat.widthMeters > 0)) continue;
    const regions = circuit.areaFaceIds.flatMap(id =>
      document.mesh.faces[id] ? [facePoints(document.mesh, document.mesh.faces[id])] : []
    );
    if (!regions.length) continue;
    const maskId = `ce-moat-exterior-${index}`;
    const extent = document.frame.extentMeters;
    const mask = element("mask", {
      id: maskId,
      maskUnits: "userSpaceOnUse",
      x: String(-extent),
      y: String(-extent),
      width: String(extent * 2),
      height: String(extent * 2),
      "mask-type": "luminance"
    });
    mask.appendChild(
      element("rect", {
        x: String(-extent),
        y: String(-extent),
        width: String(extent * 2),
        height: String(extent * 2),
        fill: "white"
      })
    );
    for (const region of regions)
      mask.appendChild(element("path", { d: polygon(region), fill: "black", stroke: "black", "stroke-width": "0.05" }));
    // Existing water supplies the moat on waterfronts; do not repaint it.
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.water !== "land")
        mask.appendChild(element("path", { d: polygon(facePoints(document.mesh, face)), fill: "black" }));
    }
    for (const river of document.featureGroups) {
      if (river.kind !== "river") continue;
      const points = river.vertices.map(id => document.mesh.vertices[id]?.point).filter(isPoint);
      if (points.length > 1)
        mask.appendChild(
          element("path", {
            d: line(points),
            fill: "none",
            stroke: "black",
            "stroke-width": String(river.style.widthMeters),
            "stroke-linejoin": "round",
            "stroke-linecap": "round"
          })
        );
    }
    const defs = element("defs", {});
    defs.appendChild(mask);
    layer.appendChild(defs);
    const ribbon = element("g", { "data-circuit": circuit.id, mask: `url(#${maskId})` });
    const boundary = new Set(boundaryEdges(document.mesh, circuit.areaFaceIds).map(r => r.edgeId));
    const moatEdges = new Set<Id>();
    let maxWallWidth = 0;
    for (const group of document.featureGroups) {
      if (group.kind !== "wall" || !circuit.wallGroupIds.includes(group.id)) continue;
      const refs = new Set(group.segments.filter(ref => boundary.has(ref.edgeId) && !claimed.has(ref.edgeId)));
      // Preserve contiguous runs so joins do not leave gaps at corners.
      let run: EdgeRef[] = [];
      const flush = () => {
        if (!run.length) return;
        ribbon.appendChild(
          element("path", {
            d: line(edgeGroupPoints(document, run)),
            class: "ce-moat-water",
            fill: "none",
            stroke: "#91c8d3",
            "stroke-width": String(group.style.widthMeters + circuit.moat!.widthMeters * 2),
            "stroke-linejoin": "round",
            "stroke-linecap": "round"
          })
        );
        run = [];
      };
      for (const ref of group.segments) {
        if (!refs.has(ref)) {
          flush();
          continue;
        }
        run.push(ref);
        moatEdges.add(ref.edgeId);
        claimed.add(ref.edgeId);
        maxWallWidth = Math.max(maxWallWidth, group.style.widthMeters);
      }
      flush();
    }
    for (const gate of document.gates ?? []) {
      if (circuit.scope === "castle" ? gate.ownerCastleId !== circuit.ownerCastleId : !!gate.ownerCastleId) continue;
      const touches = [...moatEdges].some(id => {
        const e = document.mesh.edges[id];
        return e.a === gate.vertexId || e.b === gate.vertexId;
      });
      if (!touches) continue;
      // Connected roads supply a deck aligned with their actual crossing below.
      if (
        document.featureGroups.some(g => g.kind === "road" && featureGroupVertices(document, g).includes(gate.vertexId))
      )
        continue;
      const frame = gateCrossingFrame(document, gate.vertexId);
      if (!frame) continue;
      const length = circuit.moat.widthMeters + maxWallWidth / 2 + 2;
      const end: Point = [frame.point[0] - frame.inward[0] * length, frame.point[1] - frame.inward[1] * length];
      ribbon.appendChild(
        renderDrawbridge(document, [frame.point, end], gate.passageWidthMeters ?? 8, gate.id, "ce-moat-bridge")
      );
    }
    layer.appendChild(ribbon);
  }
  return layer;
}
