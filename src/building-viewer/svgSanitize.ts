/** Drop script, foreignObject, and event handlers before inserting a plan. */
export function sanitizeSvg(markup: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return null;
  const svg = parsed.querySelector("svg");
  if (!svg) return null;
  const drop = [...svg.querySelectorAll("*")].filter(node => {
    const tag = node.tagName.toLowerCase();
    return tag === "script" || tag === "foreignobject";
  });
  for (const node of drop) node.remove();
  for (const node of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const scriptHref = (name === "href" || name.endsWith(":href")) && value.startsWith("javascript:");
      if (name.startsWith("on") || scriptHref) node.removeAttribute(attr.name);
    }
  }
  return svg;
}
