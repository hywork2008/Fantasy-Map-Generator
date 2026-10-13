import type { HarborPlan } from "../core/gen/harborFabric";
import type { FallbackPier } from "./harborPierFacts";
import { element, polygon } from "./svgPrimitives";
export function renderTownQuays(
  harbor: HarborPlan | undefined,
  plannedPiers: HarborPlan["piers"],
  fallbackPiers: FallbackPier[]
): SVGGElement {
  const layer = element("g", { class: "ce-quays", "pointer-events": "none" }) as SVGGElement;
  if (harbor) {
    for (const pier of plannedPiers)
      layer.appendChild(
        element("path", {
          d: polygon(pier.polygon),
          class: "ce-pier",
          "data-water-face": pier.waterFaceId,
          "data-depth-m": String(pier.depth),
          fill: "#c8beaa",
          stroke: "#4a463c",
          "stroke-width": "0.6"
        })
      );

    // Cargo piles along the harbor
    if (harbor.cargoPiles?.length) {
      const cargoLayer = element("g", { class: "ce-cargo-layer" });
      for (const pile of harbor.cargoPiles) {
        const [cx, cy] = [pile.point[0], -pile.point[1]];
        const rot = -(pile.rotation * 180) / Math.PI;
        const g = element("g", {
          class: `ce-cargo-pile ce-cargo-pile--${pile.kind}`,
          transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)}) rotate(${rot.toFixed(1)})`
        });
        const hw = pile.widthMeters / 2;
        const hh = pile.heightMeters / 2;
        if (pile.kind === "barrels") {
          const r = 0.55;
          const coords = [
            [-hw + r, -hh + r],
            [0, -hh + r],
            [hw - r, -hh + r],
            [-hw * 0.5, hh - r],
            [hw * 0.5, hh - r]
          ];
          for (const [bx, by] of coords) {
            g.appendChild(
              element("circle", {
                cx: bx.toFixed(2),
                cy: by.toFixed(2),
                r: String(r),
                fill: "#7a6245",
                stroke: "#3d2e1c",
                "stroke-width": "0.3"
              })
            );
          }
        } else if (pile.kind === "crates") {
          g.appendChild(
            element("rect", {
              x: (-hw).toFixed(2),
              y: (-hh).toFixed(2),
              width: (pile.widthMeters * 0.6).toFixed(2),
              height: pile.heightMeters.toFixed(2),
              fill: "#968163",
              stroke: "#4a3c2b",
              "stroke-width": "0.35"
            })
          );
          g.appendChild(
            element("rect", {
              x: (-hw + pile.widthMeters * 0.45).toFixed(2),
              y: (-hh * 0.8).toFixed(2),
              width: (pile.widthMeters * 0.55).toFixed(2),
              height: (pile.heightMeters * 0.85).toFixed(2),
              fill: "#887458",
              stroke: "#4a3c2b",
              "stroke-width": "0.35"
            })
          );
        }
        cargoLayer.appendChild(g);
      }
      layer.appendChild(cargoLayer);
    }

    // Historical harbor cranes (treadwheel cranes, Roman Magna Rota, derricks)
    if (harbor.cranes?.length) {
      const cranesLayer = element("g", { class: "ce-harbor-cranes" });
      for (const crane of harbor.cranes) {
        const [cx, cy] = [crane.point[0], -crane.point[1]];
        const armAngleDeg = (-crane.armAngleRad * 180) / Math.PI;
        const g = element("g", {
          class: `ce-crane ce-crane--${crane.kind}`,
          transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)})`
        });

        // Crane house or base
        if (crane.kind === "treadwheel") {
          g.appendChild(
            element("circle", {
              cx: "0",
              cy: "0",
              r: String(crane.radiusMeters),
              fill: "#6d5b45",
              stroke: "#362a1c",
              "stroke-width": "0.6"
            })
          );
          g.appendChild(
            element("circle", {
              cx: "0",
              cy: "0",
              r: String(crane.radiusMeters * 0.45),
              fill: "#4f4030",
              stroke: "#291e13",
              "stroke-width": "0.4"
            })
          );
        } else {
          g.appendChild(
            element("circle", {
              cx: "0",
              cy: "0",
              r: String(crane.radiusMeters),
              fill: "#786d5e",
              stroke: "#3d362d",
              "stroke-width": "0.5"
            })
          );
        }

        // Crane Jib Arm toward water
        const armGroup = element("g", {
          transform: `rotate(${armAngleDeg.toFixed(1)})`
        });
        armGroup.appendChild(
          element("path", {
            d: `M0 0 L${crane.armLengthMeters.toFixed(2)} 0`,
            stroke: "#362a1c",
            "stroke-width": "1.0",
            "stroke-linecap": "round"
          })
        );
        armGroup.appendChild(
          element("path", {
            d: `M${(crane.armLengthMeters * 0.3).toFixed(2)} -0.7 L${(crane.armLengthMeters * 0.7).toFixed(2)} 0 L${(crane.armLengthMeters * 0.3).toFixed(2)} 0.7`,
            fill: "none",
            stroke: "#4a3b2b",
            "stroke-width": "0.5"
          })
        );
        armGroup.appendChild(
          element("circle", {
            cx: crane.armLengthMeters.toFixed(2),
            cy: "0",
            r: "0.5",
            fill: "#221c15"
          })
        );
        armGroup.appendChild(
          element("rect", {
            x: (crane.armLengthMeters + 0.3).toFixed(2),
            y: "-0.6",
            width: "1.2",
            height: "1.2",
            fill: "#8c7657",
            stroke: "#3a2f21",
            "stroke-width": "0.3"
          })
        );

        g.appendChild(armGroup);
        cranesLayer.appendChild(g);
      }
      layer.appendChild(cranesLayer);
    }

    if (harbor.piers.length > 0) {
      return layer;
    }
  }
  for (const pier of fallbackPiers)
    layer.appendChild(
      element("path", {
        d: polygon(pier.deck),
        class: "ce-pier",
        "data-water-face": pier.waterFaceId,
        "data-depth-m": String(pier.depthMeters),
        fill: "#d5cfbf",
        stroke: "#514f45",
        "stroke-width": "0.6"
      })
    );
  return layer;
}
