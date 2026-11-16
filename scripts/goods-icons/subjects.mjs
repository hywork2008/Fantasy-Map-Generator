// Icons that used to share good-unknown, plus a few goods whose old picture
// could not be told apart from the badge. Drawings stay inside 16..112.

export const iconByGoodName = {
  Pomace: "good-pomace",
  Cocoa: "good-cocoa",
  Coffee: "good-coffee",
  Rubber: "good-rubber",
  Milk: "good-milk",
  Rennet: "good-rennet",
  Ash: "good-ash",
  "Smoked Cheese": "good-smoked-cheese",
  Egg: "good-egg",
  Pig: "good-pig",
  Chicken: "good-chicken",
  Wool: "good-wool",
  Flax: "good-flax",
  Linen: "good-linen",
  Cotton: "good-cotton",
  Tallow: "good-tallow",
  Beeswax: "good-beeswax",
  Flour: "good-flour",
  Bread: "good-bread",
  Timber: "good-timber",
  Alum: "good-alum",
  Potash: "good-potash",
  Barilla: "good-barilla",
  Ivory: "good-ivory",
  Coral: "good-coral",
  Stockfish: "good-stockfish",
  "Spinning Wheel": "good-spinning-wheel",
  Artworks: "good-artworks",
  Sculptures: "good-sculptures",
  Tapestries: "good-tapestries",
  Instruments: "good-instruments",
  Relics: "good-relics",
  Dogs: "good-dogs",
  Apples: "good-apples",
  Pears: "good-pears",
  Plums: "good-plums",
  Figs: "good-figs",
  Lemons: "good-lemons",
  "Dried Fruits": "good-dried-fruits",
  Steel: "good-steel",
  "Stainless Steel": "good-stainless",
  "Machine Parts": "good-machine-parts",
  "Copper Wire": "good-copper-wire",
  "Stationary Steam Engine": "good-steam-engine",
  Rail: "good-rail",
  Locomotive: "good-locomotive",
  "Marine Steam Engine": "good-marine-engine",
  "Precision Instruments": "good-precision",
  Chlorine: "good-chlorine",
  "Bleaching Powder": "good-bleaching-powder",
  "Nitric Acid": "good-nitric-acid",
  "Synthetic Dye": "good-synthetic-dye",
  "Soda Ash": "good-soda-ash",
  "Caustic Soda": "good-caustic-soda",
  Alumina: "good-alumina",
  "Light Alloy Parts": "good-light-alloy",
  "Crude Oil": "good-crude-oil",
  Kerosene: "good-kerosene",
  "Synthetic Resin": "good-synthetic-resin",
  "Lubricating Oil": "good-lubricating-oil",
  "Natural Gas": "good-natural-gas",
  LNG: "good-lng",
  "Synthetic Ammonia": "good-ammonia",
  Chestnuts: "good-chestnuts",
  Charcoal: "good-charcoal",
  Sloop: "good-sloop",
  Caravel: "good-caravel",
  Galleon: "good-galleon",
  Raisins: "good-raisins"
};

export const badgeColorByGoodName = {
  Charcoal: "#d7d2c8",
  Sloop: "#9fd4ea",
  Caravel: "#3d7ea6",
  Galleon: "#163e5c",
  Muskets: "#efe6d6",
  Boots: "#d9e2ea",
  Peat: "#d5e0c8",
  Raisins: "#f3e2b8",
  Coke: "#a3a8ad",
  "Coal Tar": "#c4b8a8"
};

export function extraIcons({ p, o, e, c, rect, bottle, INK }) {
  const hull = (y, fill) => p(`M16 ${y} H112 L98 ${y + 26} H30 Z`, fill);
  const mast = (x, top, fill = "#3a2418") => rect(x - 3, top, 6, 78 - top, fill, 3);
  const leg = (x, y) => rect(x, y, 7, 16, INK, 2);

  return {
    "good-pomace": () =>
      p("M28 58 H100 L92 104 H36 Z", "#f3e6d4") +
      p("M36 70 H92 V96 H36 Z", "#6b3a55", 0) +
      c(52, 80, 6, "#7a2848", 0) +
      c(72, 86, 5, "#8a3040", 0),

    "good-cocoa": () =>
      e(46, 70, 18, 28, "#f0d2a8") +
      e(80, 66, 18, 28, "#e7c49a") +
      o("M46 48 V92 M80 44 V88", "#6b4226", 2) +
      c(64, 36, 8, "#6b8f3a"),

    "good-coffee": () =>
      p("M34 40 H94 L104 108 H24 Z", "#f3e6d0") +
      c(48, 70, 6, "#4b3621", 0) +
      c(66, 78, 6, "#4b3621", 0) +
      c(80, 66, 5, "#4b3621", 0) +
      c(58, 92, 5, "#4b3621", 0),

    "good-rubber": () =>
      p("M64 22 C40 48 28 60 28 80 A36 36 0 0 0 100 80 C100 60 88 48 64 22 Z", "#f7f4ee") +
      p("M64 40 C52 58 46 68 46 80 A18 18 0 0 0 82 80 C82 68 76 58 64 40 Z", "#e7e2d8", 0),

    "good-milk": () =>
      p("M36 40 H92 L100 104 H28 Z", "#6b4226") +
      p("M40 62 H88 L94 96 H34 Z", "#f7f4ee", 0) +
      e(64, 40, 28, 10, "#8a5a32"),

    "good-rennet": () => bottle("#f7f4ee", "#f0d8c4") + rect(46, 78, 36, 10, "#f7f4ee", 2, 2),

    "good-ash": () =>
      p("M24 78 C28 50 48 46 64 58 C80 44 108 52 112 80 C96 108 36 110 24 78 Z", "#6e6a64") +
      c(46, 76, 4, "#f7f4ee", 0) +
      c(70, 84, 3, "#f7f4ee", 0) +
      c(86, 72, 3, "#f7f4ee", 0),

    "good-smoked-cheese": () =>
      p("M28 48 H100 L92 96 H36 Z", "#f3d7a4") +
      c(48, 70, 8, "#f7e7c4", 2) +
      c(74, 74, 8, "#f7e7c4", 2) +
      p("M40 28 C48 18 60 22 64 32 C68 20 84 18 88 32", "#9aa3ad", 0) +
      o("M40 28 C48 18 60 22 64 32 C68 20 84 18 88 32", "#9aa3ad", 3),

    "good-egg": () => e(64, 68, 28, 36, "#fffdf6") + e(64, 62, 10, 14, "#f0d48a", 0),

    "good-pig": () =>
      e(72, 74, 32, 22, "#6b3038") +
      c(38, 68, 16, "#6b3038") +
      e(22, 70, 8, 6, "#e7b8c0") +
      c(18, 68, 1.6, INK, 0) +
      c(24, 68, 1.6, INK, 0) +
      p("M30 56 L26 42 L40 56 Z", "#6b3038") +
      p("M98 66 C114 58 116 86 100 84 Z", "#6b3038") +
      leg(52, 90) +
      leg(82, 90),

    "good-chicken": () =>
      e(72, 74, 26, 18, "#8a3030") +
      p("M92 66 L118 44 L114 62 L120 74 L98 74 Z", "#6b2424") +
      c(44, 58, 12, "#8a3030") +
      p("M32 58 L16 62 L32 68 Z", "#e2ae12") +
      c(36, 46, 5, "#c45c26") +
      c(46, 44, 5, "#c45c26") +
      e(36, 70, 4, 6, "#c45c26", 0) +
      c(40, 56, 2, INK, 0) +
      o("M62 90 V108 M60 108 H70 M82 90 V108 M80 108 H90", "#e2ae12", 3),

    "good-wool": () =>
      c(48, 70, 18, "#f7f4ee") +
      c(68, 60, 18, "#f7f4ee") +
      c(84, 74, 16, "#f7f4ee") +
      c(64, 82, 20, "#f7f4ee") +
      c(34, 66, 10, "#6b5344") +
      c(30, 64, 2, INK, 0),

    "good-flax": () =>
      o("M40 108 V30 M64 108 V22 M88 108 V34", "#3e6b32", 5) +
      e(40, 26, 8, 12, "#6b8fbf") +
      e(64, 18, 8, 12, "#6b8fbf") +
      e(88, 30, 8, 12, "#6b8fbf"),

    "good-linen": () =>
      p("M28 36 H100 V100 H28 Z", "#f7f4ee") +
      o("M40 36 V100 M64 36 V100 M88 36 V100 M28 52 H100 M28 72 H100 M28 90 H100", "#c8bfb0", 2) +
      rect(24, 28, 80, 12, "#e7e0d4", 3),

    "good-cotton": () =>
      c(46, 62, 16, "#fff") +
      c(70, 56, 18, "#fff") +
      c(64, 78, 16, "#fff") +
      p("M64 96 C70 78 78 74 86 70", "#6b8f3a", 0) +
      o("M64 100 C72 80 82 74 92 68", "#3e6b32", 3) +
      e(96, 60, 10, 6, "#6b8f3a"),

    "good-tallow": () =>
      p("M40 36 H88 L96 100 H32 Z", "#f7f1dc") +
      p("M48 56 H80 L84 92 H44 Z", "#e2c98a", 0),

    "good-beeswax": () =>
      rect(30, 48, 68, 40, "#f0c419", 4, 4) +
      o("M40 60 H88 M40 72 H88 M40 84 H80", "#c49210", 3) +
      e(64, 36, 16, 8, "#ffe27a"),

    "good-flour": () =>
      p("M36 44 H92 L104 108 H24 Z", "#f7f4ee") +
      p("M44 62 H84 V96 H44 Z", "#fff", 0) +
      o("M48 74 H80", "#d9d0c4", 3),

    "good-bread": () =>
      p("M22 70 C22 46 42 36 64 36 C86 36 106 46 106 70 V96 H22 Z", "#c47a32") +
      o("M40 62 H58 M70 58 H90 M36 78 H54", "#8a4e18", 3) +
      p("M22 78 H106 V96 H22 Z", "#a86428", 0),

    "good-timber": () =>
      rect(22, 58, 84, 22, "#c4843c", 4, 3) +
      e(22, 69, 12, 11, "#f3e0c4") +
      o("M16 64 q8 5 0 10", "#a86b3c", 2) +
      rect(30, 34, 76, 20, "#a86b3c", 4, 3) +
      e(30, 44, 11, 10, "#f3e0c4"),

    "good-alum": () =>
      p("M40 78 L54 40 L70 74 Z", "#f7f7f7") +
      p("M58 90 L82 36 L104 92 Z", "#ffffff") +
      p("M28 94 L46 58 L64 98 Z", "#e4e4e4"),

    "good-potash": () =>
      rect(30, 50, 28, 22, "#f7f4ee", 4, 3) +
      rect(62, 44, 32, 24, "#fff", 4, 3) +
      rect(40, 74, 48, 22, "#e7e2d6", 4, 3),

    "good-barilla": () =>
      rect(26, 58, 76, 18, "#6e6a60", 4, 2) +
      rect(34, 40, 64, 16, "#8a8680", 4, 2) +
      rect(30, 78, 70, 16, "#5c584f", 4, 2),

    "good-ivory": () =>
      p("M78 24 C108 40 112 78 96 104 C78 92 70 70 64 64 C58 40 62 28 78 24 Z", "#fff8dc") +
      o("M80 40 C90 60 88 84 80 96", "#e6d7a8", 3),

    "good-coral": () =>
      p("M64 108 V64", "#7a1f2a", 0) +
      o("M64 108 V48", "#7a1f2a", 8) +
      o("M64 70 C40 60 32 40 28 28", "#7a1f2a", 7) +
      o("M64 64 C88 52 100 36 108 22", "#7a1f2a", 7) +
      o("M64 80 C46 88 36 96 24 100", "#7a1f2a", 6) +
      c(28, 28, 6, "#ffd0c8") +
      c(108, 22, 6, "#ffd0c8") +
      c(24, 100, 5, "#ffd0c8"),

    "good-stockfish": () =>
      p("M22 64 C40 46 78 44 100 64 C78 84 40 82 22 64 Z", "#c4b49a") +
      p("M96 64 L114 50 V78 Z", "#a89078") +
      o("M40 58 H80 M40 70 H78", "#8a7058", 2) +
      c(36, 62, 2.4, INK, 0),

    "good-spinning-wheel": () =>
      c(62, 74, 34, "#f4efe4") +
      c(62, 74, 8, "#6b4226", 3) +
      o("M62 40 V108 M28 74 H96 M38 50 L86 98 M38 98 L86 50", "#6b4226", 3) +
      rect(96, 28, 8, 36, "#f4efe4", 3) +
      o("M70 40 H100", "#6b4226", 3),

    "good-artworks": () =>
      rect(24, 28, 80, 72, "#3a2418", 4, 2) +
      rect(34, 38, 60, 52, "#f7f4ee", 3) +
      p("M34 78 L52 56 L66 70 L80 50 L94 78 Z", "#3d7ea6", 0) +
      c(78, 48, 6, "#f0c419", 0),

    "good-sculptures": () =>
      e(64, 46, 16, 16, "#e8c99a") +
      p("M44 66 H84 L96 108 H32 Z", "#d7b48a") +
      rect(36, 104, 56, 8, "#9aa0a6", 3),

    "good-tapestries": () =>
      rect(28, 22, 72, 10, "#c9a24a", 3) +
      p("M32 32 H96 V108 H32 Z", "#f4efe6") +
      p("M32 32 H96 L80 70 H48 Z", "#c45c26", 0) +
      o("M48 48 H80 M44 84 H84", "#6b3fa0", 3),

    "good-instruments": () =>
      e(48, 78, 22, 26, "#f3e0c4") +
      c(48, 78, 8, INK, 3) +
      rect(62, 28, 10, 48, "#e7c9a4", 3) +
      o("M78 40 C100 36 108 58 96 70", "#6b4226", 3),

    "good-relics": () =>
      p("M40 36 H88 L96 56 V100 H32 V56 Z", "#6b3030") +
      rect(36, 28, 56, 14, "#e2ae12", 3, 2) +
      c(64, 74, 10, "#e2ae12") +
      o("M64 64 V84 M54 74 H74", "#6b3030", 3),

    "good-dogs": () =>
      e(76, 78, 26, 16, "#f4efe4") +
      c(46, 66, 14, "#f4efe4") +
      e(24, 70, 14, 8, "#f4efe4") +
      p("M40 54 C30 50 26 70 36 78 C44 68 46 58 40 54 Z", "#c4a574") +
      c(14, 70, 3, INK, 0) +
      c(40, 64, 2, INK, 0) +
      p("M98 70 C116 46 122 72 102 80 Z", "#f4efe4") +
      leg(62, 90) +
      leg(84, 90),

    "good-apples": () =>
      c(64, 70, 28, "#f6e7c1") +
      p("M52 78 C58 66 70 66 78 80", "#bf4d3f", 0) +
      o("M64 42 V28", "#3e6b32", 3) +
      p("M64 32 C80 24 90 36 78 42 Z", "#3e6b32"),

    "good-pears": () =>
      p("M64 28 C80 28 92 42 88 58 C108 78 96 112 64 112 C32 112 22 78 42 58 C38 42 48 28 64 28 Z", "#8a3a2a") +
      o("M64 28 V16", "#3e6b32", 3) +
      e(78, 22, 8, 5, "#3e6b32"),

    "good-plums": () =>
      c(48, 70, 20, "#f3e6f6") +
      c(78, 64, 22, "#f7f4ee") +
      o("M64 48 V30", "#3e6b32", 3) +
      e(76, 28, 8, 5, "#3e6b32"),

    "good-figs": () =>
      p("M64 28 C88 28 104 52 96 80 C88 108 40 108 32 80 C24 52 40 28 64 28 Z", "#f0d2c0") +
      p("M50 70 H78 L70 96 H58 Z", "#c45c6a", 0) +
      o("M64 28 V16", "#3e6b32", 3),

    "good-lemons": () =>
      e(64, 70, 30, 24, "#fff6c2") +
      e(40, 70, 8, 6, "#fff6c2") +
      e(88, 70, 8, 6, "#fff6c2") +
      o("M64 46 V28", "#3e6b32", 3) +
      e(78, 30, 10, 6, "#3e6b32"),

    "good-dried-fruits": () =>
      c(42, 70, 16, "#f0d2a8", 4) +
      c(42, 70, 6, "none", 3) +
      c(70, 58, 16, "#e7c49a", 4) +
      c(70, 58, 6, "none", 3) +
      c(90, 82, 14, "#f3e0c4", 4) +
      c(90, 82, 5, "none", 3),

    "good-steel": () =>
      p("M18 40 H110 V58 H18 Z", "#ffffff") +
      p("M18 58 H110 V80 H18 Z", "#c5ced6", 0) +
      p("M18 80 L30 96 H98 L110 80 Z", "#8a96a3", 0) +
      o("M18 40 H110 V80 L98 96 H30 L18 80 Z", INK, 4) +
      o("M18 58 H110 M18 80 H110", "#5c6770", 2),

    "good-stainless": () =>
      p("M16 46 H112 L104 86 H24 Z", "#f7fbff") +
      p("M28 52 H100 L96 64 H32 Z", "#d7e7f4", 0) +
      o("M16 46 H112 L104 86 H24 Z", INK, 4) +
      o("M36 70 H92", "#9ec4de", 3),

    "good-machine-parts": () =>
      c(64, 66, 26, "#e2ae12") +
      c(64, 66, 10, "none", 4) +
      rect(56, 22, 16, 16, "#e2ae12", 3) +
      rect(56, 94, 16, 16, "#e2ae12", 3) +
      rect(18, 58, 16, 16, "#e2ae12", 3) +
      rect(94, 58, 16, 16, "#e2ae12", 3),

    "good-copper-wire": () =>
      e(64, 36, 30, 12, "#f7f4ee") +
      rect(34, 36, 60, 52, "#8a3e12", 4) +
      e(64, 88, 30, 12, "#f7f4ee") +
      o("M44 50 H84 M44 64 H84 M44 78 H84", "#e7b07a", 3),

    "good-steam-engine": () =>
      rect(22, 70, 84, 22, "#d5dbe3", 4, 2) +
      rect(30, 40, 28, 32, "#c5ccd4", 4, 2) +
      o("M44 40 V24", "#4a5560", 4) +
      c(40, 18, 8, "#f7f4ee") +
      c(52, 12, 6, "#f7f4ee") +
      p("M70 78 L108 48 L112 58 L78 84 Z", "#8a5a32") +
      c(36, 98, 10, "#4a5560") +
      c(86, 98, 10, "#4a5560"),

    "good-rail": () =>
      p("M28 28 H46 L58 100 H40 Z", "#f4f7fa") +
      p("M82 28 H100 L88 100 H70 Z", "#f4f7fa") +
      rect(36, 48, 56, 8, "#8a5a32", 3) +
      rect(36, 72, 56, 8, "#8a5a32", 3),

    "good-locomotive": () =>
      rect(18, 58, 64, 26, "#f4f7fa", 4, 4) +
      rect(72, 40, 32, 44, "#e6eaee", 4, 3) +
      c(34, 90, 12, "#f4f7fa") +
      c(70, 90, 12, "#f4f7fa") +
      c(96, 90, 10, "#f4f7fa") +
      rect(24, 40, 10, 20, "#d0d4d8", 3) +
      c(29, 28, 7, "#fff") +
      c(40, 18, 5, "#fff"),

    "good-marine-engine": () =>
      p("M16 78 H112 L98 104 H30 Z", "#c4a574") +
      rect(36, 48, 40, 30, "#e6eaee", 4, 2) +
      rect(78, 40, 16, 38, "#d5dbe3", 3) +
      c(86, 28, 7, "#fff") +
      c(96, 18, 5, "#fff") +
      c(48, 92, 6, "#4a5560", 2),

    "good-precision": () =>
      o("M22 92 A42 42 0 0 1 106 92", "#243140", 8) +
      o("M64 92 L104 34", "#e2ae12", 5) +
      c(64, 92, 7, "#e2ae12") +
      c(104, 34, 5, "#243140") +
      rect(52, 100, 24, 8, "#d5dbe3", 3),

    "good-chlorine": () =>
      rect(40, 28, 48, 78, "#5a6570", 4, 8) +
      rect(52, 16, 24, 16, "#3a4248", 3, 3) +
      rect(48, 48, 32, 16, "#c9e066", 3),

    "good-bleaching-powder": () =>
      p("M34 48 H94 L104 108 H24 Z", "#f7f4ee") +
      p("M42 66 H86 V96 H42 Z", "#ffffff", 0) +
      c(64, 40, 8, "#fff", 3) +
      o("M56 34 L64 22 L72 34", "#d7d7de", 3),

    "good-nitric-acid": () => bottle("#f7f4ee", "#c4472a") + rect(50, 78, 28, 12, "#f7f4ee", 2, 2),

    "good-synthetic-dye": () =>
      e(40, 78, 18, 22, "#e23b3b") +
      e(40, 58, 12, 6, "#c42e2e") +
      e(86, 74, 18, 22, "#3d7ea6") +
      e(86, 54, 12, 6, "#2f6a90") +
      c(64, 40, 8, "#f0c419"),

    "good-soda-ash": () =>
      rect(24, 60, 34, 22, "#f7f4ee", 4, 4) +
      rect(62, 52, 38, 24, "#fff", 4, 4) +
      rect(36, 84, 52, 18, "#e7e2d6", 4, 4),

    "good-caustic-soda": () =>
      p("M40 32 H88 L96 52 V104 H32 V52 Z", "#f7f4ee") +
      p("M44 64 H84 V96 H44 Z", "#ffffff", 0) +
      c(58, 76, 4, "#e7e2d6", 0) +
      c(72, 84, 3, "#e7e2d6", 0),

    "good-alumina": () =>
      p("M24 84 C36 48 52 40 64 56 C76 36 108 48 112 84 C96 108 36 112 24 84 Z", "#f7f4ee") +
      p("M40 80 C50 64 70 62 78 78 C70 92 48 94 40 80 Z", "#ffffff", 0),

    "good-light-alloy": () =>
      p("M24 40 H104 V58 H78 V96 H50 V58 H24 Z", "#f4f7fa") +
      c(64, 78, 8, "none", 4),

    "good-crude-oil": () =>
      p("M34 36 H94 C106 36 110 48 110 64 C110 80 106 92 94 92 H34 C22 92 18 80 18 64 C18 48 22 36 34 36 Z", "#c4a574") +
      rect(22, 48, 84, 10, "#6b4423", 3) +
      p("M40 56 H88 V84 H40 Z", "#1a120c", 0) +
      e(64, 64, 16, 6, "#3a2a20"),

    "good-kerosene": () =>
      p("M48 48 H80 L88 64 V104 H40 V64 Z", "#3a2418") +
      rect(56, 36, 16, 14, "#e2ae12", 3) +
      p("M64 18 C56 28 54 36 64 42 C74 36 72 28 64 18 Z", "#f0c14a") +
      p("M48 72 H80 V92 H48 Z", "#e2c07a", 0),

    "good-synthetic-resin": () =>
      p("M28 48 H100 L112 96 H16 Z", "#f0c14a") +
      p("M40 60 H92 L100 84 H32 Z", "#ffe27a", 0) +
      o("M36 70 H96", "#c49210", 3),

    "good-lubricating-oil": () =>
      p("M36 40 H80 L92 58 V100 H28 V58 Z", "#f7f4ee") +
      p("M40 66 H76 V92 H40 Z", "#6b5344", 0) +
      p("M80 48 H112 L104 64 H84 Z", "#3a2418") +
      o("M96 36 V48", "#3a2418", 4),

    "good-natural-gas": () =>
      rect(40, 70, 48, 28, "#d5dbe3", 4, 4) +
      o("M64 70 V48", "#d5dbe3", 6) +
      p("M64 16 C52 32 50 44 64 52 C78 44 76 32 64 16 Z", "#e8f6ff") +
      p("M64 28 C58 36 58 42 64 46 C70 42 70 36 64 28 Z", "#f0c14a", 0),

    "good-lng": () =>
      p("M28 48 H100 L112 108 H16 Z", "#f7fbff") +
      p("M40 64 H88 L96 96 H32 Z", "#d7e7f4", 0) +
      o("M36 76 H92 M32 90 H96", "#9ec4de", 3) +
      c(48, 36, 5, "#fff") +
      c(64, 26, 4, "#fff"),

    "good-ammonia": () =>
      rect(44, 24, 40, 80, "#4a5560", 4, 10) +
      rect(56, 12, 16, 16, "#d5dbe3", 3, 2) +
      rect(52, 48, 24, 28, "#d7e7f4", 3),

    "good-chestnuts": () =>
      c(46, 64, 22, "#6b8f3a") +
      o("M46 42 V30 M32 50 L22 40 M60 50 L72 38 M30 64 H18 M64 66 L76 62 M36 82 L28 96 M56 82 L66 96", "#3e6b32", 3) +
      p("M78 46 C102 46 114 70 100 94 C86 110 68 100 68 78 C68 58 72 46 78 46 Z", "#f0d2a8") +
      o("M88 56 C92 74 90 90 82 98", "#a86b3c", 2),

    "good-charcoal": () =>
      p("M22 36 L40 24 L108 100 L90 112 Z", "#1a1a1a") +
      p("M22 96 L40 112 L108 32 L90 18 Z", "#2a2a2a") +
      e(34, 32, 10, 7, "#8a8a8a") +
      e(96, 28, 9, 6, "#8a8a8a"),

    "good-sloop": () =>
      hull(78, "#3a2418") +
      mast(64, 22) +
      p("M64 26 L104 74 H64 Z", "#c45c26") +
      p("M64 40 L34 74 H64 Z", "#e2c07a"),

    "good-caravel": () =>
      hull(80, "#6b4423") +
      mast(48, 24) +
      mast(82, 18) +
      p("M48 28 L74 74 H48 Z", "#f7f4ee") +
      p("M48 40 L26 74 H48 Z", "#f4efe4") +
      p("M82 22 L108 70 H82 Z", "#fff"),

    "good-galleon": () =>
      hull(82, "#c4a574") +
      rect(86, 62, 22, 22, "#e2ae12", 3, 2) +
      mast(40, 26) +
      mast(64, 16) +
      mast(84, 30, "#6b4226") +
      p("M40 30 L58 74 H40 Z", "#f7f4ee") +
      p("M64 20 L86 70 H64 Z", "#fff") +
      p("M28 48 L40 74 H28 Z", "#f4efe4"),

    "good-raisins": () =>
      c(46, 58, 12, "#5a2840") +
      c(68, 50, 13, "#3d1c30") +
      c(86, 66, 11, "#6b3050") +
      c(58, 74, 14, "#4a2038") +
      c(78, 84, 11, "#5a2840") +
      o("M64 28 C70 40 62 46 58 52", "#3e6b32", 3)
  };
}
