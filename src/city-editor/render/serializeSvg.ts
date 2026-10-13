/** The one place that turns a built SVG tree into standalone file text. */
export function serializeSvgFile(svg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n${new XMLSerializer().serializeToString(svg)}`;
}
