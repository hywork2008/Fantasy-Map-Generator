import {
  OVERLAY_SELECTOR_BY_ID,
  type PresentationData,
  type PresentationStyleValue
} from "../runtime/presentationData";

function applyAttribute(element: Element, attribute: string, value: PresentationStyleValue): void {
  if (value === null) {
    element.removeAttribute(attribute);
    return;
  }
  element.setAttribute(attribute, String(value));
}

function applySelectorAttributes(
  root: ParentNode,
  selector: string,
  attributes: Readonly<Record<string, PresentationStyleValue>>
): void {
  let elements: NodeListOf<Element>;
  try {
    elements = root.querySelectorAll(selector);
  } catch {
    // A malformed saved selector must not prevent a validated world from
    // loading; it is ignored like an unknown legacy SVG attribute.
    return;
  }
  for (const element of elements) {
    for (const [attribute, value] of Object.entries(attributes)) applyAttribute(element, attribute, value);
  }
}

/**
 * Applies persisted presentation rules to the SVG compatibility adapter.
 * WebGL reads the same PresentationData directly; this is only the SVG
 * output projection used after archive replacement.
 */
export function projectPresentationToSvg(root: ParentNode | null, presentation: Readonly<PresentationData>): void {
  if (!root) return;

  for (const [selector, attributes] of Object.entries(presentation.styles)) {
    applySelectorAttributes(root, selector, attributes);
  }

  // Overlays are the semantic chrome layout slice. Project them after styles so
  // an explicit overlay record wins when both are present (e.g. partial style
  // import from an older archive).
  for (const [overlayId, attributes] of Object.entries(presentation.overlays)) {
    const selector = OVERLAY_SELECTOR_BY_ID[overlayId] ?? `#${overlayId}`;
    applySelectorAttributes(root, selector, attributes);
  }
}
