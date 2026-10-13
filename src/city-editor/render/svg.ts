/**
 * Compatibility entry for the City Editor SVG renderers. New code imports the
 * owning module directly; this facade is retired in Phase 6 once callers move.
 */
export { renderApproachLabels } from "./approachLabelSvg";
export { isNewStyleCastleCircuit, isNewStyleCastleGate, isNewStyleCastleWall } from "./castleStyle";
export { renderCemeteries } from "./cemeterySvg";
export { type RenderQuality, renderEditorSvg } from "./editorSvg";
export { faceClassName, renderFaceWardLandmark } from "./landmarkSvg";
export { renderMoats } from "./moatSvg";
export {
  appendFaceSelectionLabels,
  type GridOverlay,
  type RenderSelection,
  renderHoverOverlay,
  renderMeasureOverlay,
  renderRoutePreview,
  selectionLabelFontSize,
  vertexHandleRadius
} from "./overlays";
export { parsePickInfo, type SvgPickInfo } from "./pickInfo";
export { renderStandaloneCitySvg, STANDALONE_SVG_STYLE, serializeCitySvg } from "./standaloneSvg";
