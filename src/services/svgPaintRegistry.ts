/**
 * Indirection seam so `svgSnapshot.ts`'s offscreen export path can trigger a full SVG
 * repaint without importing `controllers/layers.ts` directly — that direct import would
 * close a cycle through `renderers/three-d-renderer.ts` -> `io/export.ts` ->
 * `services/svgSnapshot.ts` (three-d-renderer.ts calls io/export.ts's `getMapURL`, which
 * calls back into this same offscreen-export path). `controllers/layers.ts` registers its
 * `paintSvgMapLayers` implementation here once at module load.
 */
type SvgPaintFn = () => void;

let _paintSvgMapLayers: SvgPaintFn | null = null;

export function registerSvgPaintFunction(fn: SvgPaintFn): void {
  _paintSvgMapLayers = fn;
}

export function paintSvgMapLayers(): void {
  if (!_paintSvgMapLayers) throw new Error("[svgPaintRegistry] paintSvgMapLayers not registered yet");
  _paintSvgMapLayers();
}
