import { featureGroupVertices } from "../core/features";
import type {
  AerialLandmarkPlan,
  Barbican,
  Gallows,
  GuildHall,
  GuildYard,
  Monastery,
  PrecinctBuilding,
  StorageYard,
  Tannery,
  Windmill
} from "../core/gen/aerialLandmarks";
import type { CityDocument, EdgeFeatureGroup, Point, Tool } from "../core/types";
import { renderTowerDecoration, renderWallStructure } from "./wallSvg";

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

// Ground tones shared with the town's own yards and kitchen gardens (svg.ts), so a
// precinct reads as part of the same block rather than as a pasted illustration.
const COURTYARD = "#ddd6c5";
const GARDEN_GROUND = "#c4c6aa";
const BED_TONES = ["#bccd9c", "#aec392"];
const BED_STROKE = "#617b4d";
const CROWN = "#697d64";
const CROWN_STROKE = "#394b40";
const WALL = "#5d5a50";
const CHURCH_ROOF = "#8f8b7e";

/** A footprint drawn exactly like a house; only the roof's shaded half hints at the ridge. */
function roof(g: SVGElement, building: PrecinctBuilding): void {
  // The church is the one darker roof (lead or slate); the class still gives it the house outline.
  const church = building.role === "church" || building.role === "apse";
  g.appendChild(
    el("path", {
      d: polygon(building.polygon),
      class: "ce-building",
      ...(church ? { style: `fill:${CHURCH_ROOF}` } : {})
    })
  );
  if (building.role === "crossing-tower" || building.role === "bell-tower")
    g.appendChild(el("path", { d: polygon(building.polygon), fill: ROOF_SHADE, opacity: "0.75" }));
  if (building.role === "dome") {
    const c = building.polygon.reduce<Point>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    const n = building.polygon.length;
    g.appendChild(
      el("circle", {
        cx: (c[0] / n).toFixed(2),
        cy: (-c[1] / n).toFixed(2),
        r: (Math.hypot(building.polygon[0][0] - c[0] / n, building.polygon[0][1] - c[1] / n) * 0.55).toFixed(2),
        fill: ROOF_SHADE,
        stroke: STROKE,
        "stroke-width": "0.3"
      })
    );
  }
  if (!building.ridge) return;
  const [a, b] = building.ridge;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const side = (p: Point) => dx * (p[1] - a[1]) - dy * (p[0] - a[0]);
  const shaded = building.polygon.filter(p => side(p) < -1e-6);
  if (shaded.length === 2) {
    const along = (p: Point) => (p[0] - a[0]) * dx + (p[1] - a[1]) * dy;
    const [s0, s1] = along(shaded[0]) < along(shaded[1]) ? [shaded[0], shaded[1]] : [shaded[1], shaded[0]];
    g.appendChild(el("path", { d: polygon([a, b, s1, s0]), fill: church ? "#6f6b61" : ROOF_SHADE, opacity: "0.55" }));
  }
  g.appendChild(el("path", { d: line(building.ridge), stroke: STROKE, "stroke-width": "0.3", fill: "none" }));
}

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
  // Courts first: the ground the buildings stand on. The precinct itself has no fill,
  // so the block's own ground shows through between them.
  for (const court of m.courts) {
    const fill = court.kind === "garden" ? GARDEN_GROUND : court.kind === "garth" ? BED_TONES[0] : COURTYARD;
    g.appendChild(
      el("path", {
        d: polygon(court.polygon),
        class: `ce-monastery-court ce-monastery-court--${court.kind}`,
        fill,
        stroke: court.kind === "garth" ? "#a0a58a" : "none",
        "stroke-width": "0.3"
      })
    );
  }
  if (m.walk) {
    // Cloister walk: a roofed ring around the garth, drawn as a house roof with a hole.
    g.appendChild(
      el("path", {
        d: `${polygon(m.walk.outer)} ${polygon(m.walk.garth)}`,
        class: "ce-building ce-cloister-walk",
        "fill-rule": "evenodd"
      })
    );
  }
  for (const [i, bed] of m.beds.entries())
    g.appendChild(
      el("path", {
        d: polygon(bed),
        class: "ce-herb-bed",
        fill: BED_TONES[i % 2],
        stroke: BED_STROKE,
        "stroke-width": "0.3"
      })
    );
  if (!minimal)
    for (const tree of m.trees)
      g.appendChild(
        el("circle", {
          cx: tree.at[0].toFixed(2),
          cy: (-tree.at[1]).toFixed(2),
          r: tree.radius.toFixed(2),
          fill: CROWN,
          stroke: CROWN_STROKE,
          "stroke-width": "0.4"
        })
      );
  if (m.well)
    g.appendChild(
      el("circle", {
        cx: m.well[0].toFixed(2),
        cy: (-m.well[1]).toFixed(2),
        r: "1.1",
        fill: "#8c877b",
        stroke: STROKE,
        "stroke-width": "0.3"
      })
    );
  // Churches and ranges are the same footprints as houses; the apse and towers follow the church.
  for (const building of m.buildings) roof(g, building);
  g.appendChild(
    el("path", {
      d: line(m.wall),
      class: "ce-monastery-wall",
      fill: "none",
      stroke: WALL,
      "stroke-width": "0.8",
      "stroke-linejoin": "miter",
      "stroke-linecap": "butt"
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
  for (const water of plan.domesticWater ?? []) {
    const g = pickGroup(
      `ce-domestic-water ce-domestic-water--${water.kind}`,
      {
        kind: "domesticWater",
        id: water.id,
        label: water.name,
        waterKind: water.kind,
        use: water.use,
        placement: water.placement
      },
      options
    );
    const title = el("title", {});
    title.textContent = water.name;
    g.appendChild(title);
    g.appendChild(el("path", { d: line(water.access), fill: "none", stroke: EARTH, "stroke-width": "1" }));
    const [x, y] = water.center;
    g.appendChild(
      el("circle", {
        cx: `${x}`,
        cy: `${-y}`,
        r: `${water.radius}`,
        fill: water.kind === "pond" ? "#88a5a0" : "#d0c8b7",
        stroke: STROKE,
        "stroke-width": "0.4"
      })
    );
    if (water.kind !== "pond")
      g.appendChild(
        el("circle", {
          cx: `${x}`,
          cy: `${-y}`,
          r: `${water.radius * 0.65}`,
          fill: "#719ca8",
          stroke: STROKE,
          "stroke-width": "0.2"
        })
      );
    if (water.kind === "well")
      g.appendChild(
        el("path", {
          d: line([
            [x - water.radius, y],
            [x + water.radius, y]
          ]),
          fill: "none",
          stroke: "#74583d",
          "stroke-width": "0.45"
        })
      );
    if (water.kind === "cistern")
      g.appendChild(
        el("path", {
          d: line([
            [x, y - water.radius * 0.5],
            [x, y + water.radius * 0.5]
          ]),
          fill: "none",
          stroke: "#d0c8b7",
          "stroke-width": "0.7"
        })
      );
    layer.appendChild(g);
  }
  for (const m of plan.monasteries) layer.appendChild(renderMonastery(m, options, minimal));
  for (const t of plan.tanneries) layer.appendChild(renderTannery(t, options, minimal));
  for (const hall of plan.guildHalls ?? []) layer.appendChild(renderGuildHall(hall, options));
  for (const yard of plan.guildYards ?? []) layer.appendChild(renderGuildYard(yard, options, minimal));
  for (const yard of plan.storageYards ?? []) layer.appendChild(renderStorageYard(yard, options));
  for (const gw of plan.gallows) layer.appendChild(renderGallows(gw, options));
  for (const w of plan.windmills) layer.appendChild(renderWindmill(w, options));
  return layer;
}

const HALL_LABEL: Record<string, string> = {
  textiles: "布地会館",
  leather: "皮革会館",
  woodworking: "木工会館",
  masonry: "石工会館",
  metallurgy: "鍛冶会館",
  glassware: "ガラス会館",
  instruments: "楽器会館",
  printing: "印刷会館"
};

const YARD_LABEL: Record<GuildYard["kind"], string> = {
  bleachingField: "漂白場",
  timberYard: "材木置場",
  stoneYard: "石置場",
  limeKiln: "石灰窯",
  smithyYard: "鍛冶場",
  sandYard: "砂置場"
};

function staffLabel(practitioners: number, year: number): string {
  const staff = practitioners > 0 ? `職人${practitioners}人` : "職人なし";
  return year > 0 ? `${year}年・${staff}` : staff;
}

const STORAGE_LABEL: Record<StorageYard["form"], string> = {
  livestockPen: "家畜市",
  timberYard: "材木置場",
  stoneYard: "石置場",
  fuelStack: "燃料置場",
  granary: "穀倉",
  cellar: "樽倉",
  warehouse: "倉庫"
};

const STORAGE_FILL: Record<StorageYard["form"], string> = {
  livestockPen: "#c4b08a",
  timberYard: "#b08968",
  stoneYard: "#c5c1b6",
  fuelStack: "#6e6256",
  granary: "#d9c48a",
  cellar: "#8d7b66",
  warehouse: "#a89880"
};

function renderStorageYard(yard: StorageYard, options: PickOptions): SVGElement {
  const goods = yard.mainGoods.length ? yard.mainGoods.join("・") : STORAGE_LABEL[yard.form];
  const dated = yard.year > 0 ? `${yard.year}年・` : "";
  const g = pickGroup(
    `ce-storage-yard ce-storage-yard--${yard.form}`,
    {
      kind: "storageYard",
      id: yard.id,
      label: `${yard.name}（${STORAGE_LABEL[yard.form]}・${dated}${goods}・${yard.areaM2} m²）`,
      form: yard.form,
      areaM2: yard.areaM2,
      waterborne: yard.waterborne
    },
    options
  );
  g.appendChild(
    el("path", {
      d: polygon(yard.polygon),
      fill: STORAGE_FILL[yard.form],
      stroke: "#796b55",
      "stroke-width": "0.45"
    })
  );
  return g;
}

function renderGuildHall(hall: GuildHall, options: PickOptions): SVGElement {
  const label = HALL_LABEL[hall.domain] ?? "ギルド会館";
  const g = pickGroup(
    "ce-guild-hall",
    {
      kind: "guildHall",
      id: hall.id,
      label: `${hall.name}（${label}・${staffLabel(hall.practitioners, hall.year)}）`,
      domain: hall.domain,
      practitioners: hall.practitioners
    },
    options
  );
  const roof = hall.domain === "textiles" ? "#8d4d3c" : ROOF;
  gabled(g, hall.footprint, hall.ridge, roof, hall.domain === "textiles" ? "#6e3b2e" : ROOF_SHADE);
  if (hall.tower) {
    g.appendChild(
      el("path", {
        d: polygon(hall.tower),
        fill: "#6e5b48",
        stroke: STROKE,
        "stroke-width": "0.45"
      })
    );
    const [x, y] = hall.tower.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
    const n = hall.tower.length || 1;
    g.appendChild(
      el("circle", {
        cx: (x / n).toFixed(2),
        cy: (-y / n).toFixed(2),
        r: "1.3",
        fill: "#d7c7a2",
        stroke: STROKE,
        "stroke-width": "0.25"
      })
    );
  }
  return g;
}

function renderGuildYard(yard: GuildYard, options: PickOptions, minimal: boolean): SVGElement {
  const label = YARD_LABEL[yard.kind];
  const g = pickGroup(
    `ce-guild-yard ce-guild-yard--${yard.kind}`,
    {
      kind: "guildYard",
      id: yard.id,
      label: `${yard.name}（${label}・${staffLabel(yard.practitioners, yard.year)}）`,
      domain: yard.domain,
      yardKind: yard.kind,
      practitioners: yard.practitioners
    },
    options
  );
  const fill =
    yard.kind === "bleachingField"
      ? "#e7e2d4"
      : yard.kind === "timberYard"
        ? "#b08968"
        : yard.kind === "sandYard"
          ? "#e6d7a8"
          : yard.kind === "smithyYard"
            ? "#8a8175"
            : "#c5c1b6";
  g.appendChild(
    el("path", {
      d: polygon(yard.polygon),
      fill,
      stroke: "#796b55",
      "stroke-width": "0.45"
    })
  );
  if (!minimal && yard.frames)
    for (const [a, b] of yard.frames)
      g.appendChild(
        el("path", {
          d: line([a, b]),
          stroke: "#f4f1e8",
          "stroke-width": "1.05",
          fill: "none"
        })
      );
  if (yard.kind === "limeKiln" || yard.kind === "smithyYard") {
    const [x, y] = yard.polygon.reduce<Point>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
    const n = yard.polygon.length || 1;
    g.appendChild(
      el("circle", {
        cx: (x / n).toFixed(2),
        cy: (-y / n).toFixed(2),
        r: yard.kind === "limeKiln" ? "3.2" : "2.4",
        fill: yard.kind === "limeKiln" ? "#d8d2c4" : "#5c5348",
        stroke: STROKE,
        "stroke-width": "0.35"
      })
    );
  }
  return g;
}

function renderBarbican(b: Barbican, options: PickOptions, document: CityDocument): SVGElement {
  const gate = document.gates.find(g => g.id === b.gateId);
  const wall = gate
    ? document.featureGroups.find(
        (g): g is EdgeFeatureGroup => g.kind === "wall" && featureGroupVertices(document, g).includes(gate.vertexId)
      )
    : undefined;
  const material = wall?.wallMaterial ?? "stone";
  const color = material === "wood" ? "#634327" : STONE;
  const barbicanWall: EdgeFeatureGroup = {
    ...wall,
    id: b.id,
    kind: "wall",
    name: b.name,
    segments: [],
    locked: false,
    wallMaterial: material,
    style: { color, widthMeters: b.wallWidth }
  };
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
  // Outwork walls enclose the barbican court, not the city center.
  const interiorPoint: Point = b.court.length
    ? [
        b.court.reduce((sum, p) => sum + p[0], 0) / b.court.length,
        b.court.reduce((sum, p) => sum + p[1], 0) / b.court.length
      ]
    : b.curtain[0][0];
  for (const run of b.curtain) {
    g.appendChild(
      el("path", {
        d: line(run),
        fill: "none",
        stroke: color,
        "stroke-width": String(b.wallWidth),
        "stroke-linejoin": "round",
        "stroke-linecap": "butt"
      })
    );
    g.appendChild(renderWallStructure(document, barbicanWall, run, el, interiorPoint));
  }
  for (const tower of b.frontTowers) {
    g.appendChild(
      el("path", {
        d: polygon(tower),
        // The enclosed tower top is a floor, not the dark wall foundation.
        fill: material === "wood" ? "#9e774f" : "#beb9ab",
        stroke: material === "wood" ? "#38200b" : "#181916",
        "stroke-width": "0.3"
      })
    );
    g.appendChild(renderWallStructure(document, barbicanWall, [...tower, tower[0]], el));
  }
  for (const point of b.turrets) {
    const radius = b.wallWidth * 0.75;
    g.appendChild(
      el("circle", {
        cx: point[0].toFixed(2),
        cy: (-point[1]).toFixed(2),
        r: String(radius),
        fill: color
      })
    );
    g.appendChild(renderTowerDecoration(point, radius, material, el));
  }
  return g;
}

/** Gate outworks; drawn above the curtain wall, moat and approach road. */
export function renderBarbicans(
  document: CityDocument,
  plan: AerialLandmarkPlan | undefined,
  tool: Tool = "select",
  inspectedId: number | string | null = null
): SVGGElement {
  const layer = el("g", {
    class: "ce-barbicans",
    "pointer-events": tool === "select" ? "all" : "none"
  }) as SVGGElement;
  for (const b of plan?.barbicans ?? []) layer.appendChild(renderBarbican(b, { tool, inspectedId }, document));
  return layer;
}
