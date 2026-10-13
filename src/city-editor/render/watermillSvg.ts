import { editorText } from "../../i18n/editorMessages";
import type { CityDocument, Tool } from "../core/types";
import { element, line, polygon } from "./svgPrimitives";
export function renderTownWatermills(
  _document: CityDocument,
  plan?: import("../core/gen/watermillFabric").WatermillPlan,
  tool: Tool = "select",
  inspectedId: number | string | null = null
): SVGGElement {
  const layer = element("g", {
    class: "ce-watermills",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;

  if (!plan?.mills?.length) return layer;

  // 1. Weirs and water rapids/foam (堰と白波)
  const weirsLayer = element("g", { class: "ce-watermill-weirs", "pointer-events": "none" });
  for (const mill of plan.mills) {
    if (mill.weir) {
      const g = element("g", { class: "ce-watermill-weir" });
      // Weir beam / crest (timber piles / masonry weir)
      g.appendChild(
        element("path", {
          d: line(mill.weir.points),
          class: "ce-weir-crest",
          fill: "none",
          stroke: "#3d342a",
          "stroke-width": String(mill.weir.crestWidth),
          "stroke-linecap": "round"
        })
      );
      // Small timber post markers along weir
      const [w0, w1] = mill.weir.points;
      const wlen = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]);
      const posts = Math.max(2, Math.floor(wlen / 2.5));
      for (let p = 0; p <= posts; p++) {
        const frac = p / posts;
        const postX = w0[0] + (w1[0] - w0[0]) * frac;
        const postY = -(w0[1] + (w1[1] - w0[1]) * frac);
        g.appendChild(
          element("circle", {
            cx: postX.toFixed(2),
            cy: postY.toFixed(2),
            r: "0.45",
            fill: "#262019"
          })
        );
      }
      // Weir overflow foam / white water
      if (mill.weir.foamPoints?.length >= 2) {
        g.appendChild(
          element("path", {
            d: line(mill.weir.foamPoints),
            class: "ce-weir-foam",
            fill: "none",
            stroke: "#eef5f7",
            "stroke-width": "1.6",
            "stroke-dasharray": "2.5 1.5",
            opacity: "0.85"
          })
        );
      }
      weirsLayer.appendChild(g);
    }

    // Wake / Tailrace ripples downstream of waterwheel
    if (mill.wakePolyline?.length >= 2) {
      weirsLayer.appendChild(
        element("path", {
          d: line(mill.wakePolyline),
          class: "ce-wheel-wake",
          fill: "none",
          stroke: "#e8f2f5",
          "stroke-width": "1.2",
          "stroke-dasharray": "1.8 1.4",
          opacity: "0.8"
        })
      );
    }
  }
  layer.appendChild(weirsLayer);

  // 2. Millhouses (水車小屋建物)
  const housesLayer = element("g", { class: "ce-millhouses" });
  for (const mill of plan.mills) {
    const isSelected = inspectedId === mill.id || inspectedId === `millhouse-${mill.id}`;
    const pickInfo = {
      layer: "buildings",
      kind: "watermill",
      id: mill.id,
      label: `${mill.name}（${mill.kind === "gristmill" ? editorText("cityEditor.messages.gristmill") : mill.kind === "fulling" ? editorText("cityEditor.messages.fullingMill") : editorText("cityEditor.messages.forgeMill")}）`,
      millKind: mill.kind,
      bankSide: mill.bankSide,
      riverId: mill.riverId
    };

    const g = element("g", {
      class: `ce-millhouse-group${isSelected ? " ce-is-selected cg-is-selected" : ""}`,
      "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
      style: tool === "select" ? "cursor:pointer" : ""
    });

    // Base building perimeter
    g.appendChild(
      element("path", {
        d: polygon(mill.millhousePolygon),
        class: "ce-millhouse-base ce-building",
        fill: "#b5ab96",
        stroke: "#292a26",
        "stroke-width": "0.45"
      })
    );

    // Roof slopes (river-side slope and land-side slope with subtle shading)
    g.appendChild(
      element("path", {
        d: polygon(mill.riverSideRoof),
        class: "ce-millhouse-roof-riverside",
        fill: "#a89d87",
        stroke: "none",
        opacity: "0.7"
      })
    );
    g.appendChild(
      element("path", {
        d: polygon(mill.landSideRoof),
        class: "ce-millhouse-roof-landside",
        fill: "#c4baa6",
        stroke: "none",
        opacity: "0.7"
      })
    );

    // Gable ridge line (棟木)
    g.appendChild(
      element("path", {
        d: line(mill.millhouseRidge),
        class: "ce-millhouse-ridge",
        fill: "none",
        stroke: "#423d33",
        "stroke-width": "0.55"
      })
    );

    housesLayer.appendChild(g);
  }
  layer.appendChild(housesLayer);

  // 3. Waterwheels (水車輪とパドル・車軸)
  const wheelsLayer = element("g", { class: "ce-waterwheels" });
  for (const mill of plan.mills) {
    const isSelected = inspectedId === mill.id || inspectedId === `waterwheel-${mill.id}`;
    const pickInfo = {
      layer: "features",
      kind: "waterwheel",
      id: `wheel-${mill.id}`,
      label: editorText("cityEditor.messages.waterWheel", { value0: mill.name }),
      millId: mill.id
    };

    const [cx, cy] = [mill.wheel.center[0], -mill.wheel.center[1]];
    const rotDeg = (-mill.wheel.angleRad * 180) / Math.PI;

    const g = element("g", {
      class: `ce-waterwheel-unit${isSelected ? " ce-is-selected cg-is-selected" : ""}`,
      transform: `translate(${cx.toFixed(2)},${cy.toFixed(2)}) rotate(${rotDeg.toFixed(1)})`,
      "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
      style: tool === "select" ? "cursor:pointer" : ""
    });

    const hw = mill.wheel.width / 2;
    const hr = mill.wheel.radius;

    // Wheel frame outer box
    g.appendChild(
      element("rect", {
        x: (-hr).toFixed(2),
        y: (-hw).toFixed(2),
        width: (hr * 2).toFixed(2),
        height: (hw * 2).toFixed(2),
        rx: "0.3",
        ry: "0.3",
        fill: "#3b2a1a",
        stroke: "#1c140d",
        "stroke-width": "0.35"
      })
    );

    // Wheel inner rim
    const innerHw = hw * 0.65;
    g.appendChild(
      element("rect", {
        x: (-hr * 0.85).toFixed(2),
        y: (-innerHw).toFixed(2),
        width: (hr * 1.7).toFixed(2),
        height: (innerHw * 2).toFixed(2),
        fill: "#2e2014",
        stroke: "#140e09",
        "stroke-width": "0.2"
      })
    );

    // Wheel paddles (blades)
    const bladeCount = mill.wheel.bladeCount;
    for (let b = 0; b < bladeCount; b++) {
      const bx = -hr + (hr * 2 * (b + 0.5)) / bladeCount;
      g.appendChild(
        element("line", {
          x1: bx.toFixed(2),
          y1: (-hw).toFixed(2),
          x2: bx.toFixed(2),
          y2: hw.toFixed(2),
          stroke: "#543e29",
          "stroke-width": "0.3"
        })
      );
    }

    // Axle shaft
    g.appendChild(
      element("circle", {
        cx: "0",
        cy: "0",
        r: "0.5",
        fill: "#1f150e",
        stroke: "#0a0704",
        "stroke-width": "0.2"
      })
    );

    // Splash highlights on sides of wheel
    g.appendChild(
      element("circle", {
        cx: (-hr * 0.7).toFixed(2),
        cy: (-hw - 0.4).toFixed(2),
        r: "0.35",
        fill: "#eef5f7",
        opacity: "0.7"
      })
    );
    g.appendChild(
      element("circle", {
        cx: (hr * 0.7).toFixed(2),
        cy: (-hw - 0.4).toFixed(2),
        r: "0.35",
        fill: "#eef5f7",
        opacity: "0.7"
      })
    );

    wheelsLayer.appendChild(g);
  }
  layer.appendChild(wheelsLayer);

  return layer;
}
