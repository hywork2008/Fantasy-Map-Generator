import type { AerialLandmarkPlan, Barbican, Gallows, Monastery, Tannery, Windmill } from "../core/gen/aerialLandmarks";
import type { Point, Tool } from "../core/types";

const NS = "http://www.w3.org/2000/svg";

function el(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function line(points: Point[]): string {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`).join(" ");
}

function polygon(points: Point[]): string {
  return `${line(points)} Z`;
}

const STROKE = "#49483f";
const ROOF = "#b2afa2";
const ROOF_SHADE = "#9d9a8d";
const CHURCH_ROOF = "#9a5b42";
const CHURCH_SHADE = "#7f4834";
const GREEN = "#7ea867";
const GREEN_DARK = "#4d733b";
const EARTH = "#c5b99d";
const STONE = "#292a26";
const PIT_TONES = ["#ecebe2", "#d6d0b6", "#b98a4b", "#7d5a33", "#57442c"];

interface PickOptions {
  tool: Tool;
  inspectedId: number | string | null;
}

function pickGroup(
  className: string,
  info: { kind: string; id: string; label: string } & Record<string, unknown>,
  options: PickOptions
): SVGElement {
  const selected = options.inspectedId === info.id;
  const g = el("g", {
    class: `${className}${selected ? " ce-is-selected cg-is-selected" : ""}`,
    "data-pick": encodeURIComponent(JSON.stringify({ layer: "buildings", ...info }))
  });
  if (options.tool === "select") g.setAttribute("style", "cursor:pointer");
  return g;
}

function gabled(g: SVGElement, polygonPoints: Point[], ridge: [Point, Point], fill: string, shade: string): void {
  g.appendChild(
    el("path", {
      d: polygon(polygonPoints),
      fill,
      stroke: STROKE,
      "stroke-width": "0.4"
    })
  );
  // Shade the half of the roof on one side of the ridge.
  const [a, b] = ridge;
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const side = (p: Point) => dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
  const shaded = polygonPoints.filter(p => side(p) < 0);
  if (shaded.length === 2) {
    const [p, q] = shaded;
    // Order the quad so it does not self-intersect.
    const along = (p: Point) => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy;
    const [s0, s1] = along(p) < along(q) ? [p, q] : [q, p];
    g.appendChild(el("path", { d: polygon([a, b, s1, s0]), fill: shade, opacity: "0.55" }));
  }
  g.appendChild(
    el("path", {
      d: line(ridge),
      stroke: STROKE,
      "stroke-width": "0.35",
      fill: "none"
    })
  );
}

const MONASTERY_LABELS: Record<Monastery["kind"], string> = {
  abbey: "修道院",
  friary: "托鉢修道会修道院",
  orthodoxMonastery: "正教修道院"
};

function renderMonastery(m: Monastery, options: PickOptions, minimal: boolean): SVGElement {
  const g = pickGroup(
    `ce-monastery ce-monastery--${m.kind}`,
    {
      kind: "monastery",
      id: m.id,
      label: `${m.name}（${MONASTERY_LABELS[m.kind]}）`,
      monasteryKind: m.kind
    },
    options
  );
  // Precinct ground and wall.
  g.appendChild(
    el("path", {
      d: polygon(m.precinct),
      class: "ce-monastery-precinct",
      fill: "#d9d3c1"
    })
  );
  // Orchard: rows of round crowns.
  g.appendChild(el("path", { d: polygon(m.orchard), fill: "#b9bc9d", opacity: "0.8" }));
  if (!minimal) {
    const [o0, o1, , o3] = m.orchard;
    const lenU = Math.hypot(o1[0] - o0[0], o1[1] - o0[1]);
    const lenV = Math.hypot(o3[0] - o0[0], o3[1] - o0[1]);
    const cols = Math.max(1, Math.floor(lenU / 6));
    const rows = Math.max(1, Math.floor(lenV / 5.5));
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const fu = (i + 0.5) / cols,
          fv = (j + 0.5) / rows;
        const x = o0[0] + (o1[0] - o0[0]) * fu + (o3[0] - o0[0]) * fv;
        const y = o0[1] + (o1[1] - o0[1]) * fu + (o3[1] - o0[1]) * fv;
        g.appendChild(
          el("circle", {
            cx: x.toFixed(2),
            cy: (-y).toFixed(2),
            r: "1.9",
            fill: "#688e5b",
            stroke: "#385230",
            "stroke-width": "0.3"
          })
        );
      }
  }
  // Physic garden: raised beds on a gravel ground.
  g.appendChild(el("path", { d: polygon(m.herbGarden.bounds), fill: "#d7c9a6" }));
  for (const [i, bed] of m.herbGarden.beds.entries())
    g.appendChild(
      el("path", {
        d: polygon(bed),
        class: "ce-herb-bed",
        fill: ["#8fae6c", "#a2b877", "#7f9f63", "#b0b884"][i % 4],
        stroke: "#5d6e43",
        "stroke-width": "0.3"
      })
    );
  // Cloister: green garth with cross paths and a well, then the roofed walk.
  g.appendChild(
    el("path", {
      d: polygon(m.walk),
      class: "ce-cloister-walk",
      fill: "#a8a496",
      stroke: STROKE,
      "stroke-width": "0.4"
    })
  );
  g.appendChild(
    el("path", {
      d: polygon(m.garth),
      class: "ce-cloister-garth",
      fill: GREEN,
      stroke: GREEN_DARK,
      "stroke-width": "0.35"
    })
  );
  const [g0, g1, g2, g3] = m.garth;
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  g.appendChild(
    el("path", {
      d: `${line([mid(g0, g1), mid(g2, g3)])} ${line([mid(g1, g2), mid(g3, g0)])}`,
      stroke: "#d7c9a6",
      "stroke-width": "1.1",
      fill: "none"
    })
  );
  g.appendChild(
    el("circle", {
      cx: String(m.well[0]),
      cy: String(-m.well[1]),
      r: "1.3",
      fill: "#8c877b",
      stroke: STONE,
      "stroke-width": "0.3"
    })
  );
  // Arcade columns along the inner edge of the walk.
  if (!minimal)
    for (let k = 0; k < 4; k++) {
      const a = m.garth[k],
        b = m.garth[(k + 1) % 4];
      const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.4));
      for (let i = 0; i <= n; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / n,
          y = a[1] + ((b[1] - a[1]) * i) / n;
        g.appendChild(
          el("circle", {
            cx: x.toFixed(2),
            cy: (-y).toFixed(2),
            r: "0.32",
            fill: STONE
          })
        );
      }
    }
  for (const range of m.ranges) gabled(g, range.polygon, range.ridge, ROOF, ROOF_SHADE);
  // Church: transept under the nave roof, apse at the east end.
  g.appendChild(
    el("path", {
      d: polygon(m.church.apse),
      fill: CHURCH_SHADE,
      stroke: STROKE,
      "stroke-width": "0.4"
    })
  );
  gabled(g, m.church.nave, m.church.ridge, CHURCH_ROOF, CHURCH_SHADE);
  g.appendChild(
    el("path", {
      d: polygon(m.church.transept),
      fill: CHURCH_ROOF,
      stroke: STROKE,
      "stroke-width": "0.4"
    })
  );
  const t = m.church.transept;
  g.appendChild(
    el("path", {
      d: line([mid(t[0], t[1]), mid(t[2], t[3])]),
      stroke: STROKE,
      "stroke-width": "0.35",
      fill: "none"
    })
  );
  // Crossing tower.
  const nave = m.church.nave;
  const ridgeMid = mid(...m.church.ridge);
  const crossing = mid(mid(t[0], t[2]), ridgeMid);
  const tw = Math.hypot(nave[3][0] - nave[0][0], nave[3][1] - nave[0][1]) * 0.28;
  g.appendChild(
    el("rect", {
      x: (crossing[0] - tw).toFixed(2),
      y: (-crossing[1] - tw).toFixed(2),
      width: (tw * 2).toFixed(2),
      height: (tw * 2).toFixed(2),
      fill: "#6e6a5e",
      stroke: STROKE,
      "stroke-width": "0.4"
    })
  );
  // Precinct wall with its gatehouse.
  g.appendChild(
    el("path", {
      d: polygon(m.precinct),
      class: "ce-monastery-wall",
      fill: "none",
      stroke: "#5d5a50",
      "stroke-width": "0.9",
      "stroke-linejoin": "miter"
    })
  );
  g.appendChild(
    el("circle", {
      cx: String(m.gate[0]),
      cy: String(-m.gate[1]),
      r: "1.6",
      fill: "#d9d3c1",
      stroke: "#5d5a50",
      "stroke-width": "0.6"
    })
  );
  return g;
}

function renderTannery(t: Tannery, options: PickOptions, minimal: boolean): SVGElement {
  const g = pickGroup(
    "ce-tannery",
    {
      kind: "tannery",
      id: t.id,
      label: `${t.name}（皮革なめし場）`,
      riverId: t.riverId
    },
    options
  );
  g.appendChild(
    el("path", {
      d: polygon(t.yard),
      fill: "#c8bb9c",
      stroke: "#796b55",
      "stroke-width": "0.5"
    })
  );
  g.appendChild(
    el("path", {
      d: polygon(t.washStrip),
      fill: "#a9a395",
      stroke: "#6d675a",
      "stroke-width": "0.25"
    })
  );
  for (const pit of t.pits)
    g.appendChild(
      el("path", {
        d: polygon(pit.polygon),
        class: "ce-tannery-pit",
        fill: PIT_TONES[pit.tone] ?? PIT_TONES[2],
        stroke: "#5b5142",
        "stroke-width": minimal ? "0.15" : "0.35"
      })
    );
  for (const [a, b] of t.racks)
    g.appendChild(
      el("path", {
        d: line([a, b]),
        stroke: "#e6dcc4",
        "stroke-width": "1.1",
        "stroke-dasharray": "0.9 0.35",
        fill: "none"
      })
    );
  for (const shed of t.sheds) gabled(g, shed.polygon, shed.ridge, ROOF, ROOF_SHADE);
  return g;
}

function renderWindmill(w: Windmill, options: PickOptions): SVGElement {
  const g = pickGroup(
    `ce-windmill ce-windmill--${w.kind}`,
    {
      kind: "windmill",
      id: w.id,
      label: `${w.name}（${w.kind === "tower" ? "塔型風車" : "ポスト型風車"}）`,
      millKind: w.kind
    },
    options
  );
  const [cx, cy] = w.center;
  const deg = (-w.facing * 180) / Math.PI;
  if (w.kind === "post") {
    // Earth mound with the trestle hidden under a timber body.
    g.appendChild(
      el("circle", {
        cx: String(cx),
        cy: String(-cy),
        r: String(w.baseRadius),
        fill: EARTH,
        stroke: "#968a76",
        "stroke-width": "0.5"
      })
    );
  } else {
    g.appendChild(
      el("circle", {
        cx: String(cx),
        cy: String(-cy),
        r: String(w.baseRadius),
        fill: "#a29b8b",
        stroke: STONE,
        "stroke-width": "0.5"
      })
    );
  }
  const body = el("g", {
    transform: `translate(${cx.toFixed(2)} ${(-cy).toFixed(2)}) rotate(${deg.toFixed(1)})`
  });
  if (w.kind === "post") {
    body.appendChild(
      el("rect", {
        x: "-2.6",
        y: "-1.9",
        width: "4.4",
        height: "3.8",
        fill: "#8c7657",
        stroke: "#3d342a",
        "stroke-width": "0.35"
      })
    );
    // Tail pole for turning the body into the wind.
    body.appendChild(
      el("path", {
        d: "M-2.6 0 L-6.4 0",
        stroke: "#3d342a",
        "stroke-width": "0.45"
      })
    );
  } else {
    body.appendChild(
      el("ellipse", {
        cx: "0",
        cy: "0",
        rx: "2.4",
        ry: "2.7",
        fill: "#7a6245",
        stroke: "#3d342a",
        "stroke-width": "0.35"
      })
    );
  }
  // Sails as the cartographic X cross, hub on the windward face of the body.
  const sailDeg = (-w.sailAngle * 180) / Math.PI;
  const sails = el("g", {
    class: "ce-windmill-sails",
    transform: `translate(2.2 0) rotate(${sailDeg.toFixed(1)})`
  });
  const L = w.sailLength;
  for (let k = 0; k < 4; k++) {
    const blade = el("g", { transform: `rotate(${k * 90})` });
    // Lattice frame with a cloth panel on one side of the whip.
    blade.appendChild(
      el("rect", {
        x: "0.7",
        y: "0",
        width: (L - 0.7).toFixed(2),
        height: "1.5",
        fill: "#efe9da",
        stroke: "#3d342a",
        "stroke-width": "0.25"
      })
    );
    blade.appendChild(
      el("path", {
        d: `M0.7 0.75 L${L.toFixed(2)} 0.75`,
        stroke: "#8c7657",
        "stroke-width": "1.5",
        "stroke-dasharray": "0.25 1.1",
        fill: "none"
      })
    );
    blade.appendChild(
      el("path", {
        d: `M0 0 L${L.toFixed(2)} 0`,
        stroke: "#3d342a",
        "stroke-width": "0.45"
      })
    );
    sails.appendChild(blade);
  }
  body.appendChild(sails);
  body.appendChild(el("circle", { cx: "2.2", cy: "0", r: "0.55", fill: "#3d342a" }));
  g.appendChild(body);
  return g;
}

function renderGallows(gw: Gallows, options: PickOptions): SVGElement {
  const g = pickGroup("ce-gallows", { kind: "gallows", id: gw.id, label: `${gw.name}（常設絞首台）` }, options);
  g.appendChild(
    el("path", {
      d: line(gw.path),
      stroke: "#b6ac99",
      "stroke-width": "1.6",
      "stroke-dasharray": "2 1",
      fill: "none"
    })
  );
  const [cx, cy] = gw.center;
  g.appendChild(
    el("circle", {
      cx: String(cx),
      cy: String(-cy),
      r: String(gw.moundRadius),
      fill: EARTH,
      stroke: "#968a76",
      "stroke-width": "0.5"
    })
  );
  g.appendChild(
    el("circle", {
      cx: String(cx),
      cy: String(-cy),
      r: "3.9",
      fill: "#a9a395",
      stroke: STONE,
      "stroke-width": "0.45"
    })
  );
  // Three masonry pillars joined by timber cross-beams.
  g.appendChild(
    el("path", {
      d: polygon(gw.pillars),
      fill: "none",
      stroke: "#3d2a1a",
      "stroke-width": "0.7"
    })
  );
  for (const [x, y] of gw.pillars)
    g.appendChild(
      el("circle", {
        cx: x.toFixed(2),
        cy: (-y).toFixed(2),
        r: "0.85",
        fill: STONE
      })
    );
  return g;
}

/** Ground-level landmarks: monasteries, tanneries, windmills and the gallows. */
export function renderAerialLandmarks(
  plan: AerialLandmarkPlan | undefined,
  tool: Tool = "select",
  inspectedId: number | string | null = null,
  minimal = false
): SVGGElement {
  const layer = el("g", {
    class: "ce-aerial-landmarks",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;
  if (!plan) return layer;
  const options = { tool, inspectedId };
  for (const m of plan.monasteries) layer.appendChild(renderMonastery(m, options, minimal));
  for (const t of plan.tanneries) layer.appendChild(renderTannery(t, options, minimal));
  for (const gw of plan.gallows) layer.appendChild(renderGallows(gw, options));
  for (const w of plan.windmills) layer.appendChild(renderWindmill(w, options));
  return layer;
}

function renderBarbican(b: Barbican, options: PickOptions): SVGElement {
  const g = pickGroup(
    `ce-barbican ce-barbican--${b.form}`,
    {
      kind: "barbican",
      id: b.id,
      label: `${b.name}（バービカン）`,
      gateId: b.gateId
    },
    options
  );
  if (b.causeway)
    g.appendChild(
      el("path", {
        d: polygon(b.causeway),
        fill: "#9e774f",
        stroke: "#54371e",
        "stroke-width": "0.35"
      })
    );
  for (const run of b.curtain) {
    g.appendChild(
      el("path", {
        d: line(run),
        fill: "none",
        stroke: STONE,
        "stroke-width": String(b.wallWidth),
        "stroke-linejoin": "round",
        "stroke-linecap": "butt"
      })
    );
    g.appendChild(
      el("path", {
        d: line(run),
        fill: "none",
        stroke: "#4a4b44",
        "stroke-width": String(Math.max(0.2, b.wallWidth * 0.35)),
        opacity: "0.6"
      })
    );
  }
  for (const tower of b.frontTowers)
    g.appendChild(
      el("path", {
        d: polygon(tower),
        fill: STONE,
        stroke: "#181916",
        "stroke-width": "0.3"
      })
    );
  for (const [x, y] of b.turrets)
    g.appendChild(
      el("circle", {
        cx: x.toFixed(2),
        cy: (-y).toFixed(2),
        r: String(b.wallWidth * 0.75),
        fill: STONE
      })
    );
  return g;
}

/** Gate outworks; drawn above the curtain wall, moat and approach road. */
export function renderBarbicans(
  plan: AerialLandmarkPlan | undefined,
  tool: Tool = "select",
  inspectedId: number | string | null = null
): SVGGElement {
  const layer = el("g", {
    class: "ce-barbicans",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;
  for (const b of plan?.barbicans ?? []) layer.appendChild(renderBarbican(b, { tool, inspectedId }));
  return layer;
}
