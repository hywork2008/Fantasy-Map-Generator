// Paint a bastioned town from the saved plan, outside in, under the roads.
import type { CityDocument, DefenseRegion, Point } from "../types/document";
import { element, line, polygon } from "./svgPrimitives";

const FILL = {
  glacis: "#d9d3c3",
  covered: "#cfc6b4",
  ditchDry: "#8a7a62",
  ditchWet: "#4f86a8",
  ravelin: "#6e624f",
  rampart: "#5c5144",
  parapet: "#3e362d",
  bridge: "#d5cfbf"
} as const;

function regionPath(region: DefenseRegion): string {
  return region.map(poly => `${polygon(poly.outer)}${poly.holes.map(hole => ` ${polygon(hole)}`).join("")}`).join(" ");
}

function paint(parent: SVGElement, points: Point[], className: string, fill: string): void {
  if (points.length < 3) return;
  parent.appendChild(element("path", { d: polygon(points), class: className, fill }));
}

function paintRegion(parent: SVGElement, region: DefenseRegion, className: string, fill: string): void {
  if (!region.length) return;
  parent.appendChild(element("path", { d: regionPath(region), class: className, fill, "fill-rule": "evenodd" }));
}

export function renderBastionedTown(document: CityDocument): SVGGElement {
  const layer = element("g", { class: "ce-bastioned-town" }) as SVGGElement;
  const plan = document.bastionedTown;
  if (!plan) return layer;
  for (const region of plan.glacis) paintRegion(layer, region, "ce-bastion-glacis", FILL.glacis);
  for (const path of plan.coveredWays) paintRegion(layer, path.region, "ce-bastion-covered", FILL.covered);
  for (const ditch of plan.ditches) {
    const wet = ditch.kind === "wet";
    paintRegion(
      layer,
      ditch.region,
      wet ? "ce-bastion-ditch ce-bastion-ditch-wet" : "ce-bastion-ditch ce-bastion-ditch-dry",
      wet ? FILL.ditchWet : FILL.ditchDry
    );
  }
  for (const work of plan.outworks) {
    paint(layer, work.outline, "ce-bastion-ravelin", FILL.ravelin);
    paint(layer, work.platform, "ce-bastion-parapet", FILL.parapet);
  }
  for (const bastion of plan.bastions) {
    paint(layer, bastion.rampart, "ce-bastion-rampart", FILL.rampart);
    paint(layer, bastion.platform, "ce-bastion-parapet", FILL.parapet);
  }
  for (const curtain of plan.curtains) paint(layer, curtain.rampart, "ce-bastion-rampart", FILL.rampart);
  for (const access of plan.accesses) {
    layer.appendChild(
      element("path", {
        d: line(access.bridge),
        class: "ce-bastion-bridge",
        fill: "none",
        stroke: FILL.bridge,
        "stroke-width": String(access.widthMeters)
      })
    );
  }
  return layer;
}
