import { OVERLAY_STYLE_SELECTORS, type PresentationStyleValue } from "./presentationData";
import { patchPresentation } from "./worldRuntime";

function attributesOf(element: Element): Record<string, PresentationStyleValue> {
  const attributes: Record<string, PresentationStyleValue> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name !== "id" && attribute.name !== "class") attributes[attribute.name] = attribute.value;
  }
  const inlineStyle = element.getAttribute("style");
  if (inlineStyle?.includes("text-shadow")) attributes.style = inlineStyle;
  if (element instanceof SVGElement && element.style.display) attributes.display = element.style.display;
  return attributes;
}

/**
 * Compatibility adapter for legacy `.map` documents. This is deliberately the
 * sole DOM-to-PresentationData import path; normal editing and rendering never
 * infer canonical styles from live SVG attributes.
 *
 * Layer paint order stays whatever the loaded SVG already established. Explicit
 * `layerOrder` is only written by the Layers panel and survives `.fmg` round-trips.
 */
export function importLegacyPresentationFromSvg(root: ParentNode = document): void {
  const styles: Record<string, Record<string, PresentationStyleValue>> = {};
  const overlays: Record<string, Record<string, PresentationStyleValue>> = {};

  root.querySelectorAll<SVGGElement>("#viewbox > g[id]").forEach(element => {
    const selector = `#${element.id}`;
    const attributes = attributesOf(element);
    styles[selector] = attributes;

    const overlayId = OVERLAY_STYLE_SELECTORS[selector];
    if (overlayId) overlays[overlayId] = { ...attributes };

    element.querySelectorAll<SVGElement>(":scope > [id]").forEach(child => {
      const childSelector =
        element.id === "burgIcons" || element.id === "burgLabels" || element.id === "anchors"
          ? `#${element.id} > g#${child.id}`
          : `#${child.id}`;
      const childAttributes = attributesOf(child);
      styles[childSelector] = childAttributes;
      const childOverlayId = OVERLAY_STYLE_SELECTORS[childSelector];
      if (childOverlayId) overlays[childOverlayId] = { ...childAttributes };
    });

    // Nested compass rose uses a selector that is not `:scope > [id]`.
    if (element.id === "compass") {
      const rose = element.querySelector("use");
      if (rose) {
        const roseAttributes = attributesOf(rose);
        styles["#compass > use"] = roseAttributes;
        overlays.compassRose = { ...roseAttributes };
      }
    }
  });

  patchPresentation({ styles, overlays });
}
