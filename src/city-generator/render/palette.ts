// Parchment-map palette, shared by the SVG renderer and the page CSS.

export const PALETTE = {
  paper: "#ccc5b8",
  ink: "#1a1917",
  inkSoft: "#67635c",
  /** Interior grid cell fill (pre-classification). */
  cell: "#d7d1c4",
  /** Fill for cells trimmed by the window edge. */
  cellEdge: "#cdc6b6",
  cellStroke: "#8d887e",
  site: "#b1443a",
  radius: "#3f7d54"
} as const;

/** Fill per classification tag. */
export const TAG_FILL: Record<string, string> = {
  land: "#d7d1c4",
  sea: "#9fb2ae",
  urban: "#c7b596",
  outskirts: "#d3c7ac",
  rural: "#dad4c7",
  shanty: "#d8cdb4"
};

// The river is a band drawn on the cell edges (no cells are tagged as water).
// A hair darker than the sea so the mouth still reads where it meets sea cells.
export const RIVER = { fill: "#8ba2a6" } as const;
// Extramural road: the parchment double line (dark casing + pale fill). Only
// the S5 `roads` are drawn this way; intramural streets are not drawn. Kept
// clearly darker/lighter than the outskirts cell fill so it reads at map zoom.
export const ROAD = { casing: "#544a3a", fill: "#eadfc6" } as const;
export const SHORELINE = "#5c6a68";
export const GATE = "#b1443a";
export const WALL = "#6b6459";
export const TOWER = "#4f493f";
export const QUAY = "#7c7468";
/** The visible intramural street: cell fill under S7 buildings. */
export const STREET = "#d9d0c0";
export const BUILDING = { fill: "#efe6d4", stroke: "#5c564c" } as const;
export const BUILDING_CASTLE = { fill: "#f2ead8", stroke: "#4f493f" } as const;
export const BUILDING_TEMPLE = { fill: "#e8e0ee", stroke: "#5c564c" } as const;
export const PRECINCT_FILL: Record<string, string> = {
  citadel: "#b9a789",
  plaza: "#e7dfc9",
  temple: "#c9bfe0",
  harbor: "#a9b8b0"
};

/** S6 district fills. Named precincts overlay these; unnamed wards use them as the cell colour. */
export const WARD_FILL: Record<string, string> = {
  castle: PRECINCT_FILL.citadel,
  market: PRECINCT_FILL.plaza,
  cathedral: PRECINCT_FILL.temple,
  harbor: PRECINCT_FILL.harbor,
  gate: "#c4a882",
  administration: "#c3b49a",
  merchant: "#d2bc8e",
  craftsmen: "#c7b596",
  military: "#b7b0a2",
  patriciate: "#d4c4a4",
  park: "#b9c4a8",
  slum: "#cbbba0",
  farm: "#c5c2a4",
  empty: "#d3c7ac",
  shanty: TAG_FILL.shanty
};

// Inspection overlay for the Grid-evolution view: the raw on-edge walk (`track`,
// with a node dot per vertex) vs. the smoothed centerline (`smooth`). Both sit on
// top of the bare mesh so the river's cell-edge binding is visible as the slider
// scrubs the Lloyd passes.
export const RIVER_TRACK = { track: "#1f4e5f", node: "#b1443a", smooth: "#7a1f66" } as const;
