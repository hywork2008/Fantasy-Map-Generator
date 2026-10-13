import { editorText } from "../../i18n/editorMessages";
import { featureGroupVertices } from "../core/features";
import { boundaryEdges, boundaryRings, castleWallIds } from "../core/fortifications";
import { nearestOnPolyline } from "../core/gen/geom";
import { defaultRoadWidthMeters, townExtentMeters } from "../core/gen/settlementExtent";
import { GATE_TOWER_SCALE, gateCrossingFrame, gatePlazaRadiusMeters, gateRoadDeviationDegrees } from "../core/passages";
import type { CityDocument, Id, Point, Tool } from "../core/types";
import { isNewStyleCastleCircuit, isNewStyleCastleGate, isNewStyleCastleWall } from "./castleStyle";
import { gateHasMoat } from "./moatSvg";
import type { SvgPickInfo } from "./pickInfo";
import { edgeGroupPoints, element } from "./svgPrimitives";
import { renderGateDecoration, renderTowerDecoration } from "./wallSvg";
export function renderTownFortifications(
  document: CityDocument,
  tool: Tool = "select",
  inspectedId: number | string | null = null
): SVGGElement {
  const layer = element("g", {
    class: "ce-fortifications",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;
  const rivers = document.featureGroups
    .filter(g => g.kind === "river")
    .map(g => ({
      points: g.vertices.map(id => document.mesh.vertices[id].point),
      width: g.style.widthMeters
    }));
  const cornerTowers: Point[] = [];
  const cornerIds = new Set<Id>();
  for (const circuit of document.defenseCircuits ?? []) {
    if (circuit.scope !== "castle") continue;
    if (isNewStyleCastleCircuit(document, circuit.id)) continue;
    const refs = boundaryRings(document.mesh, boundaryEdges(document.mesh, circuit.areaFaceIds))[0] ?? [];
    const points = refs.map(
      ref =>
        document.mesh.vertices[ref.forward ? document.mesh.edges[ref.edgeId].a : document.mesh.edges[ref.edgeId].b]
          .point
    );
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i],
        edge = document.mesh.edges[ref.edgeId],
        id = ref.forward ? edge.a : edge.b;
      if (cornerIds.has(id)) continue;
      const p = points[i],
        a = points[(i + points.length - 1) % points.length],
        b = points[(i + 1) % points.length];
      const u: Point = [p[0] - a[0], p[1] - a[1]],
        v: Point = [b[0] - p[0], b[1] - p[1]];
      const turn = Math.acos(
        Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))))
      );
      if (
        turn < Math.PI / 6 ||
        document.gates.some(
          g =>
            Math.hypot(
              document.mesh.vertices[g.vertexId].point[0] - p[0],
              document.mesh.vertices[g.vertexId].point[1] - p[1]
            ) < 14
        )
      )
        continue;
      if (cornerTowers.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 12)) continue;
      const wall = document.featureGroups.find(g => g.kind === "wall" && g.segments.some(r => r.edgeId === ref.edgeId));
      if (wall?.kind !== "wall") continue;
      const wallMat = wall.wallMaterial ?? "stone";
      const towerFill = wallMat === "wood" ? "#634327" : "#292a26";
      const towerId = `castle-tower-${id}`,
        pick = {
          layer: "fortifications",
          kind: "tower",
          id: towerId,
          get label() {
            return editorText("cityEditor.messages.castleCornerTower");
          },
          wallId: wall.id,
          point: p,
          wallMaterial: wallMat
        };
      const towerRadius = wall.style.widthMeters * 1.05;
      layer.appendChild(
        element("circle", {
          cx: String(p[0]),
          cy: String(-p[1]),
          r: String(towerRadius),
          fill: towerFill,
          class:
            (inspectedId === towerId ? "ce-is-selected cg-is-selected" : "") +
            (wallMat === "wood" ? " ce-tower--wood" : " ce-tower--stone"),
          "data-pick": encodeURIComponent(JSON.stringify(pick))
        })
      );
      layer.appendChild(renderTowerDecoration(p, towerRadius, wallMat, element));
      cornerIds.add(id);
      cornerTowers.push(p);
    }
  }
  for (const group of document.featureGroups) {
    if (group.kind !== "wall") continue;
    if (isNewStyleCastleWall(document, group.id)) continue;
    const wallMat = group.wallMaterial ?? "stone";
    const towerFill = wallMat === "wood" ? "#634327" : "#292a26";
    const points = edgeGroupPoints(document, group.segments);
    const spacing = castleWallIds(document).has(group.id) ? 32 : Math.max(45, document.frame.blockSizeMeters * 1.4);
    let untilTower = spacing / 2;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (untilTower < length) {
        const t = untilTower / length;
        const position: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (rivers.some(r => nearestOnPolyline(position, r.points).dist < r.width / 2 + group.style.widthMeters)) {
          untilTower += spacing;
          continue;
        }
        if (cornerTowers.some(p => Math.hypot(p[0] - position[0], p[1] - position[1]) < 16)) {
          untilTower += spacing;
          continue;
        }
        const gateClear = group.style.widthMeters * 3;
        if (
          (document.gates ?? []).some(gate => {
            const gatePoint = document.mesh.vertices[gate.vertexId]?.point;
            return gatePoint && Math.hypot(gatePoint[0] - position[0], gatePoint[1] - position[1]) < gateClear;
          })
        ) {
          untilTower += spacing;
          continue;
        }
        const towerId = `tower-${group.id}-${i}-${Math.round(untilTower)}`;
        const isPickSelected = inspectedId === towerId;
        const towerPickInfo: SvgPickInfo = {
          layer: "fortifications",
          kind: "tower",
          id: towerId,
          label: editorText("cityEditor.messages.wallTower", { value0: group.name }),
          wallId: group.id,
          point: position,
          wallMaterial: wallMat
        };
        const towerRadius = group.style.widthMeters * 0.8;
        const towerNode = element("circle", {
          cx: String(a[0] + (b[0] - a[0]) * t),
          cy: String(-a[1] - (b[1] - a[1]) * t),
          r: String(towerRadius),
          fill: towerFill,
          class:
            (isPickSelected ? "ce-is-selected cg-is-selected" : "") +
            (wallMat === "wood" ? " ce-tower--wood" : " ce-tower--stone"),
          "data-pick": encodeURIComponent(JSON.stringify(towerPickInfo))
        });
        if (tool === "select") towerNode.style.cursor = "pointer";
        layer.appendChild(towerNode);
        layer.appendChild(renderTowerDecoration(position, towerRadius, wallMat, element));
        untilTower += spacing;
      }
      untilTower -= length;
    }
  }
  for (const gate of document.gates) {
    if (isNewStyleCastleGate(document, gate)) continue;
    const frame = gateCrossingFrame(document, gate.vertexId);
    if (!frame) continue;
    const wall = document.featureGroups.find(
      g => g.kind === "wall" && featureGroupVertices(document, g).includes(gate.vertexId)
    );
    if (wall?.kind !== "wall") continue;
    const width = wall.style.widthMeters;
    let roadWidth = defaultRoadWidthMeters(townExtentMeters(document.frame));
    for (const group of document.featureGroups) {
      if (group.kind === "road" && featureGroupVertices(document, group).includes(gate.vertexId))
        roadWidth = Math.max(roadWidth, group.style.widthMeters);
    }
    // Square flank towers match the round curtain towers (diameter = 1.6 × wall).
    // The opening clears the road. A semicircular plaza sits on both sides of the gate.
    const side = width * GATE_TOWER_SCALE;
    const deviation = gateRoadDeviationDegrees(document, gate.vertexId) ?? 0;
    const slant = Math.tan((Math.min(deviation, 20) * Math.PI) / 180);
    const opening = gate.passageWidthMeters ?? Math.max(roadWidth + 2.2, width * 0.9) + side * slant;
    const plazaRadius = gatePlazaRadiusMeters(width);
    const drawbridge = gateHasMoat(document, gate);
    const gateWallMat = wall.wallMaterial ?? "stone";
    const gateTowerFill = gateWallMat === "wood" ? "#634327" : "#292a26";
    const isPickSelected = inspectedId === gate.id;
    const gatePickInfo: SvgPickInfo = {
      layer: "gates",
      kind: "gate",
      id: gate.id,
      label: editorText("cityEditor.messages.gateIdentifier", { value0: gate.id }),
      vertexId: gate.vertexId,
      wallId: wall.id,
      point: frame.point,
      wallMaterial: gateWallMat
    };
    const [tx, ty] = frame.tangent;
    const [ix, iy] = frame.inward;
    const marker = element("g", {
      class: `ce-town-gate${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
      transform: `matrix(${tx} ${-ty} ${ix} ${-iy} ${frame.point[0]} ${-frame.point[1]})`,
      "data-pick": encodeURIComponent(JSON.stringify(gatePickInfo))
    });
    if (tool === "select") marker.style.cursor = "pointer";
    for (const sweep of gate.ownerCastleId ? [] : drawbridge ? [0] : [1, 0])
      marker.appendChild(
        element("path", {
          d: `M ${-plazaRadius} 0 A ${plazaRadius} ${plazaRadius} 0 0 ${sweep} ${plazaRadius} 0 Z`,
          class: "ce-gate-plaza",
          fill: "#d5cfbf",
          "pointer-events": "none"
        })
      );
    marker.appendChild(
      element("rect", {
        x: String(-opening / 2),
        y: String(drawbridge ? -width / 2 : -side / 2),
        width: String(opening),
        height: String(drawbridge ? (side + width) / 2 : side),
        fill: "#d5cfbf",
        "pointer-events": "none"
      })
    );
    for (const sign of [-1, 1])
      marker.appendChild(
        element("rect", {
          x: String(sign < 0 ? -opening / 2 - side : opening / 2),
          y: String(-side / 2),
          width: String(side),
          height: String(side),
          class: `ce-gate-tower ce-gate-tower--${gateWallMat}`,
          fill: gateTowerFill
        })
      );
    marker.appendChild(renderGateDecoration(side, opening, width, gateWallMat, drawbridge, element));
    layer.appendChild(marker);
  }
  return layer;
}
