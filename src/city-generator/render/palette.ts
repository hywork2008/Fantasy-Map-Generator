// Parchment-map palette, shared by the SVG renderer and the page CSS.

export const PALETTE = {
  paper: "#ccc5b8",
  ink: "#1a1917",
  inkSoft: "#67635c",
  /** Interior grid cell fill. */
  cell: "#d7d1c4",
  /** Fill for cells trimmed by the window edge. */
  cellEdge: "#cdc6b6",
  cellStroke: "#8d887e",
  site: "#b1443a",
  radius: "#3f7d54"
} as const;
