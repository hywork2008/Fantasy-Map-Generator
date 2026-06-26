/**
 * Creates a <canvas> inside an SVG <foreignObject> appended to the given SVG group element.
 *
 * The canvas inherits all SVG presentation properties from ancestor groups:
 *   - zoom / pan transform (via #viewbox)
 *   - opacity, visibility, display
 *   - mask (e.g. mask: url(#land) on #landHeights clips canvas to land area)
 *   - filter (e.g. blur, turbulence)
 *
 * This means callers can draw without worrying about masks, filters, or transform sync.
 * Any previous foreignObject canvas on the same parent is replaced.
 *
 * Canvas is sized to [width × height] in SVG world-coordinate units.
 * At zoom > 1 the browser upscales the canvas content; acceptable for background layers.
 */
export function createLayerCanvas(svgGroup: SVGGElement, width: number, height: number): CanvasRenderingContext2D {
  svgGroup.querySelector("foreignObject.fmc")?.remove();

  const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
  fo.setAttribute("class", "fmc");
  fo.setAttribute("x", "0");
  fo.setAttribute("y", "0");
  fo.setAttribute("width", String(width));
  fo.setAttribute("height", String(height));
  fo.setAttribute("pointer-events", "none");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = `width:${width}px;height:${height}px;display:block;pointer-events:none;`;

  fo.appendChild(canvas);
  svgGroup.appendChild(fo);

  return canvas.getContext("2d")!;
}
