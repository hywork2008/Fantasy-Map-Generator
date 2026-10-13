import { editorText } from "../../i18n/editorMessages";
import type { Id, Point } from "../types/document";
import type { SvgPickInfo } from "../types/selection";
import { vertexHandleRadius } from "./labelLayout";
import type { RenderContext } from "./renderContext";
import { element, line } from "./svgPrimitives";
/** Vertex handles and the dotted generation-step walk trails. */
export function renderEditHandles(
  ctx: RenderContext,
  svg: SVGSVGElement,
  stepWalkPaths: readonly (readonly Point[])[] | null
) {
  const { document, tool, selection, zoom } = ctx;
  const showAllVertices = tool === "vertex" || tool === "river";
  const visibleVertexIds = new Set([selection.vertexId].filter((id): id is Id => !!id));
  if (showAllVertices || visibleVertexIds.size) {
    const vertices = element("g", { class: "ce-vertices" });
    for (const vertex of Object.values(document.mesh.vertices)) {
      if (!showAllVertices && !visibleVertexIds.has(vertex.id)) continue;
      const isSelected = selection.vertexId === vertex.id;
      const isPickSelected = selection.inspectedId === vertex.id || selection.inspectedId === `vertex-${vertex.id}`;
      const pickInfo: SvgPickInfo = {
        layer: "vertices",
        kind: "vertex",
        id: vertex.id,
        label: editorText("cityEditor.messages.vertexIdentifier", { value0: vertex.id }),
        point: vertex.point
      };
      vertices.appendChild(
        element("circle", {
          cx: String(vertex.point[0]),
          cy: String(-vertex.point[1]),
          r: String(vertexHandleRadius(zoom)),
          class: `ce-vertex${isSelected ? " ce-selected" : ""}${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
          "data-vertex": vertex.id,
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo))
        })
      );
    }
    svg.appendChild(vertices);
  }

  const nonEmptyWalks = stepWalkPaths?.filter(p => p.length) ?? [];
  if (nonEmptyWalks.length) {
    const walk = element("g", { class: "ce-generate-step-path", "pointer-events": "none" });
    const lastPath = nonEmptyWalks[nonEmptyWalks.length - 1];
    for (const path of nonEmptyWalks) {
      if (path.length >= 2) walk.appendChild(element("path", { d: line(path as Point[]), class: "ce-step-path-line" }));
      path.forEach((p, i) => {
        const current = path === lastPath && i === path.length - 1;
        walk.appendChild(
          element("circle", {
            cx: String(p[0]),
            cy: String(-p[1]),
            r: current ? "4.5" : "2.5",
            class: `ce-step-path-point${current ? " ce-step-path-point--current" : ""}`
          })
        );
      });
    }
    svg.appendChild(walk);
  }
}
