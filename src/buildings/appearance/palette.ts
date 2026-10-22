/** Shared sRGB colors. Renderers must convert these to their working color space. */
export const BUILDING_PALETTES = {
  terracotta: ["#94523E", "#A95F43", "#B87350"],
  "urban-tile": ["#864B3D", "#95513F", "#A76549"],
  "atlantic-tile": ["#7E4B3C", "#8F5442", "#A5644D"],
  straw: ["#8C7957", "#A48B59", "#B49C6C"],
  reed: ["#82765E", "#958361", "#A59572"],
  shingle: ["#665B4C", "#746858", "#827360"],
  slate: ["#48535C", "#56616A", "#657079"],
  "local-stone-roof": ["#5B605D", "#686C69", "#77756B"],
  lead: ["#889096", "#9AA0A4", "#A9AEB1"],
  turf: ["#59613F", "#68704B", "#78805B"],
  limewash: ["#CDBD9E", "#DCCEB1", "#E7DDC6"],
  plaster: ["#C5B697", "#D5C7A8", "#E2D5BC"],
  limestone: ["#A79C84", "#B8AD94", "#C9BFA8"],
  rubble: ["#908B7E", "#A29C8E", "#B4AD9F"],
  "upland-stone": ["#99988C", "#AAA38E", "#B8B19F"],
  brick: ["#865540", "#98634E", "#AA755D"],
  earth: ["#AA8D60", "#BEA275", "#CDB68D"],
  timber: ["#71614E", "#82705A", "#93816A"],
  frame: ["#423428", "#514132", "#61503D"],
  "northern-frame": ["#3E3128", "#4B3C30", "#5B4B3C"],
  // Legacy swatches approximate the existing linear RGB palette in sRGB.
  // Legacy renderers retain their existing palette until the rendering migration.
  "legacy-timber-frame": ["#DDC4A6", "#DDC4A6", "#DDC4A6"],
  "legacy-stone": ["#CECBC5", "#CECBC5", "#CECBC5"],
  "legacy-brick": ["#C49081", "#C49081", "#C49081"],
  "legacy-mudbrick": ["#E2CEA9", "#E2CEA9", "#E2CEA9"],
  "legacy-wattle": ["#D4C5AD", "#D4C5AD", "#D4C5AD"],
  "legacy-plaster": ["#F3F0E7", "#F3F0E7", "#F3F0E7"],
  "legacy-thatch": ["#C4AD81", "#C4AD81", "#C4AD81"],
  "legacy-tile": ["#D18A7C", "#D18A7C", "#D18A7C"],
  "legacy-slate": ["#99A2AA", "#99A2AA", "#99A2AA"],
  "legacy-shingle": ["#AF9E8B", "#AF9E8B", "#AF9E8B"],
  "legacy-lead": ["#C4C8CB", "#C4C8CB", "#C4C8CB"],
  "legacy-turf": ["#A2B399", "#A2B399", "#A2B399"]
} as const satisfies Record<string, readonly [string, string, string]>;

export type BuildingPaletteId = keyof typeof BUILDING_PALETTES;
