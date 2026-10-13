import type { Id, Tool } from "../../types/document";
import type { RoutePaintKind } from "../../types/editor";
import type { RenderSelection } from "../../types/selection";
export function emptySelection(): RenderSelection {
  return {
    faceId: null,
    edgeId: null,
    vertexId: null,
    groupId: null,
    hoverGroupId: null,
    hoverVertexId: null,
    hoverEdgeId: null
  };
}

export function isRoutePaintTool(tool: Tool): tool is RoutePaintKind {
  return tool === "river" || tool === "road" || tool === "wall";
}

export function isBrushTool(tool: Tool): tool is "ward" | "sea" | "junction" {
  return isPaintBrushTool(tool) || tool === "junction";
}

export function isPaintBrushTool(tool: Tool): tool is "ward" | "sea" {
  return tool === "ward" || tool === "sea";
}

export function targetId(event: Event, kind: "vertex" | "route-vertex" | "edge" | "face" | "group"): Id | null {
  const target = event.target instanceof Element ? event.target.closest(`[data-${kind}]`) : null;
  return target?.getAttribute(`data-${kind}`) ?? null;
}
