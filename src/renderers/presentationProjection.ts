import type { PresentationData, PresentationStyleValue } from "../runtime/presentationData";

function applyAttribute(element: Element, attribute: string, value: PresentationStyleValue): void {
  if (value === null) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, String(value));
}

/**
 * Applies persisted presentation rules to the SVG compatibility adapter.
 * WebGL reads the same PresentationData directly; this is only the SVG
 * output projection used after archive replacement.
 */
export function projectPresentationToSvg(root: ParentNode | null, presentation: Readonly<PresentationData>): void {
  if (!root) return;

  for (const [selector, attributes] of Object.entries(presentation.styles)) {
    let elements: NodeListOf<Element>;
    try {
      elements = root.querySelectorAll(selector);
    } catch {
      // A malformed saved selector must not prevent a validated world from
      // loading; it is ignored like an unknown legacy SVG attribute.
      continue;
    }
    for (const element of elements) {
      for (const [attribute, value] of Object.entries(attributes)) applyAttribute(element, attribute, value);
    }
  }
}
