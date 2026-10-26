import { objectDrawing, placeableObject } from "../../buildings/placeableObjects";
import { objectScale } from "../generators/objectPlacement";
import type { CityElement } from "../types/document";
import { element } from "./svgPrimitives";

export function renderObjectSvg(item: CityElement, selected = false): SVGElement {
  const node = element("g", {
    class: `ce-object${selected ? " ce-is-selected cg-is-selected" : ""}`,
    "data-object-type": item.objectType ?? "",
    "data-object-scale": String(objectScale(item.objectScale)),
    "data-element": item.id
  });
  const definition = placeableObject(item.objectType);
  if (!definition || !item.point) return node;
  const { bounds, plan } = objectDrawing(definition);
  const x = (bounds.min.x + bounds.max.x) / 2;
  const z = (bounds.min.z + bounds.max.z) / 2;
  node.setAttribute(
    "transform",
    `translate(${item.point[0]} ${-item.point[1]}) rotate(${(-(item.rotation ?? 0) * 180) / Math.PI}) scale(${objectScale(item.objectScale)}) translate(${-x} ${-z})`
  );
  const drawing = new DOMParser().parseFromString(plan, "image/svg+xml").documentElement;
  for (const child of Array.from(drawing.children)) node.appendChild(document.importNode(child, true));
  // A continuous pick surface also makes sparse timber frames easy to grab.
  node.appendChild(
    element("rect", {
      x: String(bounds.min.x),
      y: String(bounds.min.z),
      width: String(bounds.max.x - bounds.min.x),
      height: String(bounds.max.z - bounds.min.z),
      class: "ce-object-selection",
      fill: "transparent",
      stroke: "none",
      "vector-effect": "non-scaling-stroke"
    })
  );
  node.appendChild(element("title", {}, definition.name));
  return node;
}

/** Rotation handles stay outside the detailed SVG so selection never filters model parts. */
export function renderObjectRotationHandle(item: CityElement): SVGElement {
  const group = element("g", {
    class: "ce-object-handle-group",
    "data-object-handle": "rotate",
    "data-object-id": item.id
  });
  const definition = placeableObject(item.objectType);
  if (!definition || !item.point || item.locked) return group;
  const { bounds } = objectDrawing(definition);
  const reach = ((bounds.max.x - bounds.min.x) * objectScale(item.objectScale)) / 2 + 8;
  const rotation = item.rotation ?? 0;
  const x = item.point[0] + Math.cos(rotation) * reach;
  const y = item.point[1] + Math.sin(rotation) * reach;
  group.appendChild(
    element("line", {
      x1: String(item.point[0]),
      y1: String(-item.point[1]),
      x2: String(x),
      y2: String(-y),
      stroke: "#2679a8",
      "stroke-width": "1.2",
      "stroke-dasharray": "3 2",
      "pointer-events": "none"
    })
  );
  group.appendChild(
    element("circle", {
      cx: String(x),
      cy: String(-y),
      r: "10",
      fill: "transparent",
      stroke: "none",
      class: "ce-object-rotate-hit",
      style: "cursor: grab;"
    })
  );
  group.appendChild(
    element("circle", {
      cx: String(x),
      cy: String(-y),
      r: "4.5",
      fill: "#ffffff",
      stroke: "#1d638d",
      "stroke-width": "2",
      class: "ce-object-rotate-knob",
      style: "cursor: grab;"
    })
  );
  return group;
}
