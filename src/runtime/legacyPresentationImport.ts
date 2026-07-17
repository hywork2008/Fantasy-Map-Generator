import type { PresentationStyleValue } from "./presentationData";
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
 */
export function importLegacyPresentationFromSvg(root: ParentNode = document): void {
  const styles: Record<string, Record<string, PresentationStyleValue>> = {};

  root.querySelectorAll<SVGGElement>("#viewbox > g[id]").forEach(element => {
    styles[`#${element.id}`] = attributesOf(element);

    element.querySelectorAll<SVGElement>(":scope > [id]").forEach(child => {
      const selector =
        element.id === "burgIcons" || element.id === "burgLabels" || element.id === "anchors"
          ? `#${element.id} > g#${child.id}`
          : `#${child.id}`;
      styles[selector] = attributesOf(child);
    });
  });

  patchPresentation({ styles });
}
