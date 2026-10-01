import type { GenerationDebugPreview } from "../core/generationDebug";
import { MoatReservation } from "../core/moats";
import type { Point } from "../core/types";

const NS = "http://www.w3.org/2000/svg";
/** Tolerates broken meshes; avoids town infill and picking on rejected geometry. */
export function renderGenerationDebugSvg(preview: GenerationDebugPreview, viewBox: string): SVGSVGElement {
  const { document: city, highlights } = preview;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("class", "ce-svg ce-generation-debug");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `生成失敗の途中図: ${preview.sample.failure?.message ?? ""}`);
  svg.setAttribute("data-attempt", String(preview.sample.attempt));
  svg.setAttribute("data-seed", preview.seed);
  const title = document.createElementNS(NS, "title");
  title.textContent = preview.sample.failure?.message ?? "生成失敗";
  svg.append(title);
  const point = (id: string): Point | undefined => {
    const p = city.mesh.vertices[id]?.point;
    return p?.every(Number.isFinite) ? p : undefined;
  };
  const path = (points: Point[], closed = false): string =>
    points.map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`).join(" ") + (closed ? " Z" : "");
  const addPath = (d: string, fill: string, stroke: string, width: number, id?: string) => {
    const node = document.createElementNS(NS, "path");
    node.setAttribute("d", d);
    node.setAttribute("fill", fill);
    node.setAttribute("stroke", stroke);
    node.setAttribute("stroke-width", String(width));
    node.setAttribute("stroke-linejoin", "round");
    node.setAttribute("stroke-linecap", "round");
    if (id) {
      node.setAttribute("class", "ce-generation-debug-highlight");
      node.setAttribute("data-location", id);
      const tip = document.createElementNS(NS, "title");
      tip.textContent = `${highlights.contextual ? "関連領域" : "検証対象"}: ${id}`;
      node.append(tip);
    }
    svg.append(node);
    return node;
  };
  const facePoints = (id: string) =>
    (city.mesh.faces[id]?.boundary ?? []).flatMap(ref => {
      const edge = city.mesh.edges[ref.edgeId];
      const p = edge && point(ref.forward ? edge.a : edge.b);
      return p ? [p] : [];
    });
  for (const face of Object.values(city.mesh.faces)) {
    const points = facePoints(face.id);
    if (points.length < 3) continue;
    addPath(
      path(points, true),
      face.properties.water !== "land" ? "#b4d8ed" : face.properties.buildable ? "#e2dbc8" : "#edf0e4",
      "#a4ab9f",
      0.6
    );
  }
  // Moat geometry needs intact boundaries. Skip it on malformed meshes.
  const intact = Object.values(city.mesh.faces).every(f =>
    f.boundary.every(ref => {
      const edge = city.mesh.edges[ref.edgeId];
      return edge && point(edge.a) && point(edge.b);
    })
  );
  if (intact && city.defenseCircuits?.some(c => c.moat?.enabled))
    for (const part of new MoatReservation(city).parts) addPath(path(part.polygon, true), "#79adc7", "none", 0);
  for (const castle of city.castles ?? []) {
    for (const court of castle.courtyards) addPath(path(court, true), "#e7d9b6", "#6c6253", 0.6);
    for (const part of castle.parts) addPath(path(part.footprint, true), "#8c8071", "#41382e", 0.6);
  }
  for (const group of city.featureGroups) {
    const color = group.kind === "river" ? "#4f8aad" : group.kind === "wall" ? "#41382e" : "#96734e";
    if (group.kind === "river") {
      // Draw individual segments so missing vertices never join unrelated pieces.
      for (let i = 1; i < group.vertices.length; i++) {
        const a = point(group.vertices[i - 1]),
          b = point(group.vertices[i]);
        if (a && b) addPath(path([a, b]), "none", color, group.style.widthMeters);
      }
    } else
      for (const ref of group.segments) {
        const edge = city.mesh.edges[ref.edgeId];
        const a = edge && point(edge.a),
          b = edge && point(edge.b);
        if (a && b) addPath(path([a, b]), "none", color, group.style.widthMeters);
      }
  }
  for (const element of city.elements) {
    if (!element.point?.every(Number.isFinite)) continue;
    const node = document.createElementNS(NS, "text");
    node.setAttribute("x", String(element.point[0]));
    node.setAttribute("y", String(-element.point[1]));
    node.setAttribute("font-size", String(Math.max(5, city.frame.blockSizeMeters * 0.18)));
    node.textContent = element.kind;
    svg.append(node);
  }
  const color = highlights.contextual ? "#c77800" : "#dc2638";
  const width = Math.max(2, city.frame.extentMeters / 250);
  for (const id of highlights.faces) {
    const points = facePoints(id);
    if (points.length >= 3)
      addPath(path(points, true), highlights.contextual ? "#ffc24b44" : "#ff294d44", color, width, id);
  }
  for (const id of highlights.edges) {
    const edge = city.mesh.edges[id];
    const a = edge && point(edge.a),
      b = edge && point(edge.b);
    if (a && b) addPath(path([a, b]), "none", color, width * 2, id);
  }
  for (const id of [...new Set([...city.gates.map(g => g.vertexId), ...highlights.vertices])]) {
    const p = point(id);
    if (!p) continue;
    const highlighted = highlights.vertices.includes(id);
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", String(p[0]));
    circle.setAttribute("cy", String(-p[1]));
    circle.setAttribute("r", String(highlighted ? width * 3 : width));
    circle.setAttribute("fill", highlighted ? `${color}44` : "#ffffff");
    circle.setAttribute("stroke", highlighted ? color : "#41382e");
    circle.setAttribute("stroke-width", String(highlighted ? width : 1));
    if (highlighted) {
      circle.setAttribute("class", "ce-generation-debug-highlight");
      circle.setAttribute("data-location", id);
    }
    const tip = document.createElementNS(NS, "title");
    tip.textContent = id;
    circle.append(tip);
    svg.append(circle);
  }
  return svg;
}

/** Standalone, full-frame snapshot independent of the editor camera and CSS. */
export function serializeGenerationDebugSvg(preview: GenerationDebugPreview): string {
  const extent = preview.document.frame.extentMeters;
  const svg = renderGenerationDebugSvg(preview, `${-extent / 2} ${-extent / 2} ${extent} ${extent}`);
  svg.setAttribute("width", "1200");
  svg.setAttribute("height", "1200");
  svg.removeAttribute("class");
  const description = document.createElementNS(NS, "desc");
  description.textContent = `生成失敗の途中図。${preview.highlights.contextual ? "橙は関連領域（失敗位置は未特定）" : "赤は検証で指摘された箇所"}。工程: ${preview.sample.phase}。理由: ${preview.sample.failure?.reason ?? ""}。Seed: ${preview.seed}`;
  svg.prepend(description);
  const metadata = document.createElementNS(NS, "metadata");
  metadata.textContent = JSON.stringify({ seed: preview.seed, sample: preview.sample, highlights: preview.highlights });
  svg.prepend(metadata);
  return new XMLSerializer().serializeToString(svg);
}
