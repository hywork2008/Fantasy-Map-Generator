import { pointInPolygon, polygonArea, polygonCentroid } from "../generators/geom";
import { convexInfillParts, insetConvexKernel } from "../generators/lotGeometry";
import { facePoints } from "../generators/mesh";
import { subtractConvex } from "../generators/parcelGeometry";
import { waterPolygons } from "../generators/waterGeometry";
import type { CityDocument, CityElement, Face, Id, Mesh, Point } from "../types/document";
import { centroid, element } from "./svgPrimitives";

/** Rebuild only static geometry from the embedded plan; never adopt source DOM nodes or links. */
export function renderNormalizedLandmarkSvg(markup: string): SVGGElement {
  const output = element("g", { class: "ce-landmark-art", "pointer-events": "none" }) as SVGGElement;
  if (typeof DOMParser === "undefined" || markup.length > 100_000) return output;
  const source = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (source.querySelector("parsererror") || source.documentElement.localName !== "svg") return output;
  const tags = new Set(["g", "path", "circle", "rect", "ellipse", "polygon", "polyline", "line"]);
  const attrs = new Set([
    "d",
    "points",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "width",
    "height",
    "fill",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "fill-opacity",
    "stroke-opacity",
    "transform"
  ]);
  let count = 0;
  const append = (sourceParent: Element, target: SVGElement): void => {
    for (const child of Array.from(sourceParent.children)) {
      if (++count > 1_000) return;
      if (!tags.has(child.localName)) continue;
      const node = element(child.localName, {});
      for (const attribute of Array.from(child.attributes)) {
        if (!attrs.has(attribute.localName) || attribute.namespaceURI) continue;
        if (/url\s*\(|[<>]|javascript:|data:/i.test(attribute.value)) continue;
        if (attribute.localName === "transform" && /[^\d\s.,+\-eE()a-z]/.test(attribute.value)) continue;
        node.setAttribute(attribute.localName, attribute.value);
      }
      target.appendChild(node);
      if (child.localName === "g") append(child, node);
    }
  };
  append(source.documentElement, output);
  return output;
}

/**
 * Use simple SVG geometry rather than font or emoji glyphs. Browser emoji fonts
 * are not guaranteed to render in an SVG text node, and CSS text transforms can
 * move those nodes away from their cell. Every marker is centred at local 0,0.
 */
export function cityElementMarker(point: Point, kind: string, id: Id): SVGElement {
  const marker = element("g", {
    class: `ce-element ce-element--${kind}`,
    "data-element": id,
    transform: `translate(${point[0]} ${-point[1]})`,
    "pointer-events": "none"
  });
  marker.appendChild(element("circle", { r: "7.5", class: "ce-element-halo" }));
  const common = { class: "ce-element-mark", fill: "none", stroke: "currentColor", "stroke-width": "1.2" };

  switch (kind) {
    case "plaza":
      marker.appendChild(element("rect", { ...common, x: "-4", y: "-4", width: "8", height: "8", rx: "0.5" }));
      break;
    case "citadel":
      marker.appendChild(element("path", { ...common, d: "M-5 4.5V-4H-3V-6H-1V-4H1V-6H3V-4H5V4.5ZM-5 0.5H5" }));
      break;
    case "temple":
      marker.appendChild(element("path", { ...common, d: "M0-6V6M-3-3H3M-4.5 5H4.5" }));
      break;
    case "harbor":
      marker.append(
        element("circle", { ...common, cx: "0", cy: "-3.5", r: "1.5" }),
        element("path", { ...common, d: "M0-2V4M-4 1H4M-5.5 4C-3.5 7.5 3.5 7.5 5.5 4M-5.5 4L-3.5 6M5.5 4L3.5 6" })
      );
      break;
    case "park":
      marker.append(
        element("circle", { ...common, cx: "-2.5", cy: "-1", r: "2.5" }),
        element("circle", { ...common, cx: "2.5", cy: "-1", r: "2.5" }),
        element("path", { ...common, d: "M0 0.5V5.5M-4 5.5H4" })
      );
      break;
    case "gate":
      marker.appendChild(element("path", { ...common, d: "M-5 5V0A5 5 0 0 1 5 0V5M-6.5 5H6.5" }));
      break;
    case "tower":
      marker.appendChild(
        element("path", { ...common, d: "M-3.5 5.5V-4.5H-2V-6H-0.5V-4.5H0.5V-6H2V-4.5H3.5V5.5ZM-5 5.5H5" })
      );
      break;
    default:
      marker.appendChild(element("circle", { ...common, r: "3.5" }));
  }
  return marker;
}

export function wardLandmarkKind(ward: string | null): "plaza" | "citadel" | "harbor" | "park" | null {
  const landmarks = { market: "plaza", castle: "citadel", harbor: "harbor", park: "park" } as const;
  return landmarks[ward as keyof typeof landmarks] ?? null;
}

export function faceRendersWardLandmarkKind(castleFaces: Set<Id>, face: Face, kind: string): boolean {
  if (castleFaces.has(face.id) || face.properties.water !== "land") return false;
  return wardLandmarkKind(face.properties.ward) === kind;
}

export function elementHasDuplicateWardLandmark(
  document: CityDocument,
  castleFaces: Set<Id>,
  cityElement: CityElement
): boolean {
  const kind = cityElement.kind;
  if (kind !== "harbor" && kind !== "plaza" && kind !== "citadel") {
    return false;
  }
  if (cityElement.faceIds?.length) {
    for (const fid of cityElement.faceIds) {
      const face = document.mesh.faces[fid];
      if (face && faceRendersWardLandmarkKind(castleFaces, face, kind)) {
        return true;
      }
    }
  }
  if (cityElement.point) {
    for (const face of Object.values(document.mesh.faces)) {
      if (!faceRendersWardLandmarkKind(castleFaces, face, kind)) continue;
      const poly = facePoints(document.mesh, face);
      if (pointInPolygon(cityElement.point, poly)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The `class` attribute for one face's `<path>`, exactly as renderEditorSvg
 * assigns it in bulk. Exposed so a caller that knows precisely which faces
 * changed (ward/sea painting) can patch the existing `<path>` elements
 * in place instead of rebuilding the whole SVG — the difference between an
 * O(painted cells) and an O(mesh) repaint on a Large grid.
 */
export function faceClassName(face: Face, selected: boolean, urbanCoreHighlighted = false): string {
  return `ce-face ce-face--${face.properties.water} ce-face--ward-${face.properties.ward ?? "unassigned"}${urbanCoreHighlighted ? " ce-face--urban-step" : ""}${selected ? " ce-selected" : ""}`;
}

/**
 * Build one face's Ward landmark marker (the same rule renderEditorSvg uses
 * to populate `.ce-ward-landmarks` in bulk), or null if this face shouldn't
 * show one. Pairs with faceClassName() for patching a single changed face.
 */
export function renderFaceWardLandmark(mesh: Mesh, face: Face, source?: CityDocument): SVGElement | null {
  const kind = wardLandmarkKind(face.properties.ward);
  if (!kind || face.properties.water !== "land") return null;
  const outline = facePoints(mesh, face);
  if (!source || !waterPolygons(source).length) return cityElementMarker(centroid(outline), kind, `ward-${face.id}`);
  let dry = convexInfillParts(outline);
  for (const water of waterPolygons(source))
    for (const wet of convexInfillParts(water)) dry = dry.flatMap(part => subtractConvex(part, wet, 1));
  const safe = dry
    .map(part =>
      insetConvexKernel(
        part,
        part.map(() => 8)
      )
    )
    .filter(part => part.length >= 3)
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  return safe ? cityElementMarker(polygonCentroid(safe), kind, `ward-${face.id}`) : null;
}

export function tree(point: Point, radius: number, id: Id): SVGElement {
  const [x, y] = [point[0], -point[1]];
  const crown = element("g", { class: "ce-tree", "data-element": id, "pointer-events": "none" });
  crown.append(
    element("path", {
      d: `M${x} ${y + radius} L${x} ${y - radius * 0.15}`,
      class: "ce-tree-trunk",
      "stroke-width": String(Math.max(1, radius * 0.22))
    }),
    element("circle", {
      cx: String(x - radius * 0.36),
      cy: String(y - radius * 0.18),
      r: String(radius * 0.48),
      class: "ce-tree-crown"
    }),
    element("circle", {
      cx: String(x + radius * 0.36),
      cy: String(y - radius * 0.18),
      r: String(radius * 0.48),
      class: "ce-tree-crown"
    }),
    element("circle", {
      cx: String(x),
      cy: String(y - radius * 0.58),
      r: String(radius * 0.52),
      class: "ce-tree-crown"
    })
  );
  return crown;
}
