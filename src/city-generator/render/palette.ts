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
  water: "#8ba2a6",
  urban: "#c7b596",
  outskirts: "#d3c7ac",
  rural: "#dad4c7"
};

export const RIVER = { outline: "#5c6a68", fill: "#93a8ab" } as const;
export const SHORELINE = "#5c6a68";
export const GATE = "#b1443a";
