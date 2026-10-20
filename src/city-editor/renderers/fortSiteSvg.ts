import { editorText } from "../../i18n/editorMessages";
import { fortCircle, fortDefenseRuns, fortWaterPolygons } from "../generators/fortSiteGeometry";
import type { CityDocument, Point } from "../types/document";
import { element, line, polygon } from "./svgPrimitives";

const pick = (id: string, kind: string, label: string) =>
  encodeURIComponent(JSON.stringify({ id, kind, label, layer: "fortifications" }));
export function renderFortSiteGround(document: CityDocument): SVGElement {
  const group = element("g", { class: "ce-fort-earthworks" }),
    site = document.fortSite;
  if (!site) return group;
  const hill = fortCircle(site.motte.center, site.motte.baseRadiusMeters),
    top = fortCircle(site.motte.center, site.motte.summitRadiusMeters);
  group.append(
    element("path", {
      d: polygon(fortCircle(site.bailey.center, site.bailey.radiusMeters)),
      fill: "#b4bd78",
      stroke: "#777958",
      "stroke-width": "0.4",
      "data-pick": pick(site.id, "fort-earthwork", editorText("cityEditor.messages.fortEarthworks"))
    })
  );
  group.append(
    element("path", {
      d: polygon(hill),
      fill: "#9da75d",
      stroke: "#697648",
      "stroke-width": "0.5",
      class: "ce-motte-mound-slope",
      "data-pick": pick(site.id, "fort-earthwork", editorText("cityEditor.messages.fortEarthworks"))
    })
  );
  for (let i = 0; i < hill.length; i += 2)
    group.append(
      element("path", {
        d: line([top[i], hill[i]]),
        stroke: "#6d7547",
        "stroke-width": "0.35",
        "pointer-events": "none"
      })
    );
  group.append(
    element("path", {
      d: polygon(top),
      fill: "#c1c787",
      stroke: "#788052",
      "stroke-width": "0.4",
      "pointer-events": "none"
    })
  );
  const water = fortWaterPolygons(site);
  for (const moat of site.moats) {
    const parts = water.filter(part => part.moatId === moat.id);
    group.append(
      element("path", {
        d: parts.map(part => polygon(part.polygon)).join(" "),
        fill: "#62adbc",
        stroke: "none",
        "data-pick": pick(moat.id, "fort-moat", editorText("cityEditor.messages.fortMoat"))
      })
    );
  }
  return group;
}

export function renderFortSiteObjects(document: CityDocument): SVGElement {
  const group = element("g", { class: "ce-fort-assembly" }),
    site = document.fortSite;
  if (!site) return group;
  for (const route of site.routes) {
    const bridge = route.kind !== "path";
    group.append(
      element("path", {
        d: line(route.points),
        fill: "none",
        stroke: bridge ? "#62462c" : "#bba477",
        "stroke-width": String(route.widthMeters + (bridge ? 0.5 : 0)),
        "stroke-linejoin": "round",
        "data-pick": pick(route.id, "fort-route", editorText("cityEditor.messages.fortRoute"))
      })
    );
    if (bridge) {
      group.append(
        element("path", {
          d: line(route.points),
          fill: "none",
          stroke: "#b99a63",
          "stroke-width": String(route.widthMeters),
          "pointer-events": "none"
        })
      );
      const [a, b] = route.points,
        length = Math.hypot(b[0] - a[0], b[1] - a[1]),
        steps =
          route.kind === "stairs"
            ? Math.ceil(Math.abs(route.elevationsMeters[1] - route.elevationsMeters[0]) / 0.18)
            : Math.ceil(length / 0.6);
      for (let i = 1; i < steps; i++) {
        const t = i / steps,
          p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
          dx = ((-(b[1] - a[1]) / length) * route.widthMeters) / 2,
          dy = (((b[0] - a[0]) / length) * route.widthMeters) / 2;
        group.append(
          element("path", {
            d: line([
              [p[0] - dx, p[1] - dy],
              [p[0] + dx, p[1] + dy]
            ]),
            stroke: "#73573a",
            "stroke-width": "0.14",
            "pointer-events": "none"
          })
        );
      }
    }
  }
  for (const defense of site.defenses) {
    group.append(
      element("path", {
        d: fortDefenseRuns(site, defense).map(line).join(" "),
        fill: "none",
        stroke: "#513e27",
        "stroke-width": String(defense.widthMeters + 0.5),
        "stroke-dasharray": "0.6 0.2",
        "data-pick": pick(defense.id, "fort-defense", editorText("cityEditor.messages.fortPalisade"))
      })
    );
  }
  for (const gate of site.gates) {
    const defense = site.defenses.find(d => d.id === gate.defenseId);
    if (!defense) continue;
    const p: Point = [
      defense.center[0] + Math.cos(gate.angleRadians) * defense.radiusMeters,
      defense.center[1] + Math.sin(gate.angleRadians) * defense.radiusMeters
    ];
    group.append(
      element("rect", {
        x: String(p[0] - gate.widthMeters / 2 - 0.5),
        y: String(-p[1] - 0.7),
        width: String(gate.widthMeters + 1),
        height: "1.4",
        fill: "#55432f",
        "data-pick": pick(gate.id, "fort-gate", editorText("cityEditor.messages.fortGate"))
      })
    );
  }
  const castle = document.castles?.find(c => c.id === site.castleId);
  if (castle) {
    const buildings = element("g", {
      class: "ce-castle-precinct ce-fort-buildings",
      "data-pick": pick(castle.id, "castle", editorText("cityEditor.messages.fortBuildings"))
    });
    for (const part of castle.parts) {
      const spec = site.buildings.find(b => b.partId === part.id);
      const node = element("g", {
        "data-pick": pick(
          part.id,
          "fort-building",
          editorText(
            `cityEditor.messages.fortUse${spec?.use ?? "keep"}` as import("../../i18n/editorMessages").EditorMessageKey
          )
        )
      });
      node.append(
        element("path", {
          d: polygon(part.footprint),
          fill: part.role === "keep" ? "#8c887b" : "#897153",
          stroke: "#433c30",
          "stroke-width": "0.6"
        })
      );
      if (part.role === "keep")
        for (const p of part.footprint)
          node.append(
            element("rect", {
              x: String(p[0] - 1.8),
              y: String(-p[1] - 1.8),
              width: "3.6",
              height: "3.6",
              fill: "#a39e8f",
              stroke: "#433c30",
              "stroke-width": "0.4"
            })
          );
      else
        node.append(
          element("path", {
            d: line([
              [(part.footprint[0][0] + part.footprint[3][0]) / 2, (part.footprint[0][1] + part.footprint[3][1]) / 2],
              [(part.footprint[1][0] + part.footprint[2][0]) / 2, (part.footprint[1][1] + part.footprint[2][1]) / 2]
            ]),
            stroke: "#594a34",
            "stroke-width": "0.4"
          })
        );
      buildings.append(node);
    }
    group.append(buildings);
  }
  return group;
}
