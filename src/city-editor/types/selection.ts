import type { Id } from "./document";
export interface RenderSelection {
  faceId: Id | null;
  edgeId: Id | null;
  vertexId: Id | null;
  groupId: Id | null;
  inspectedId?: number | string | null;
  hoverGroupId?: Id | null;
  hoverVertexId?: Id | null;
  hoverEdgeId?: Id | null;
}
export interface SvgPickInfo {
  layer: string;
  kind: string;
  id?: number | string;
  label: string;
  [key: string]: unknown;
}
