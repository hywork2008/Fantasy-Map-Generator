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
  rural: "#dad4c7"
};

// The river is a band drawn on the cell edges (no cells are tagged as water).
// A hair darker than the sea so the mouth still reads where it meets sea cells.
export const RIVER = { fill: "#8ba2a6" } as const;
export const SHORELINE = "#5c6a68";
export const GATE = "#b1443a";

// Inspection overlay for the Grid-evolution view: the raw on-edge walk (`track`,
// with a node dot per vertex) vs. the smoothed centerline (`smooth`). Both sit on
// top of the bare mesh so the river's cell-edge binding is visible as the slider
// scrubs the Lloyd passes.
export const RIVER_TRACK = { track: "#1f4e5f", node: "#b1443a", smooth: "#7a1f66" } as const;
