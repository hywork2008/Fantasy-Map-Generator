import type React from "react";
import { create } from "zustand";

export interface LayerConfig {
  id: string;
  name: React.ReactNode;
  shortcut: string | null;
  tooltip: string;
  isSolid?: boolean;
}

export const DEFAULT_LAYERS: LayerConfig[] = [
  {
    id: "toggleTexture",
    name: (
      <>
        Te<u>x</u>ture
      </>
    ),
    shortcut: "X",
    tooltip: "Texture overlay: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleHeight",
    name: (
      <>
        <u>H</u>eightmap
      </>
    ),
    shortcut: "H",
    tooltip: "Heightmap: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleLakes",
    name: <>Lakes</>,
    shortcut: "Q",
    tooltip: "Lakes: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleBiomes",
    name: (
      <>
        <u>B</u>iomes
      </>
    ),
    shortcut: "B",
    tooltip: "Biomes: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleCells",
    name: (
      <>
        C<u>e</u>lls
      </>
    ),
    shortcut: "E",
    tooltip: "Cells structure: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleGrid",
    name: (
      <>
        <u>G</u>rid
      </>
    ),
    shortcut: "G",
    tooltip: "Grid: click to toggle, drag to raise or lower. Ctrl + click to edit layer style and select type"
  },
  {
    id: "toggleCoordinates",
    name: (
      <>
        C<u>o</u>ordinates
      </>
    ),
    shortcut: "O",
    tooltip: "Coordinate grid: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleCompass",
    name: (
      <>
        <u>W</u>ind Rose
      </>
    ),
    shortcut: "W",
    tooltip: "Wind (Compass) Rose: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleRivers",
    name: (
      <>
        Ri<u>v</u>ers
      </>
    ),
    shortcut: "V",
    tooltip: "Rivers: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleRelief",
    name: (
      <>
        Relie<u>f</u>
      </>
    ),
    shortcut: "F",
    tooltip:
      "Relief and biome icons: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleReligions",
    name: (
      <>
        <u>R</u>eligions
      </>
    ),
    shortcut: "R",
    tooltip: "Religions: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleCultures",
    name: (
      <>
        <u>C</u>ultures
      </>
    ),
    shortcut: "C",
    tooltip: "Cultures: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleStates",
    name: (
      <>
        <u>S</u>tates
      </>
    ),
    shortcut: "S",
    tooltip: "States: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleProvinces",
    name: (
      <>
        <u>P</u>rovinces
      </>
    ),
    shortcut: "P",
    tooltip: "Provinces: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleZones",
    name: (
      <>
        <u>Z</u>ones
      </>
    ),
    shortcut: "Z",
    tooltip: "Zones: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleBorders",
    name: (
      <>
        Bor<u>d</u>ers
      </>
    ),
    shortcut: "D",
    tooltip: "State borders: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleRoutes",
    name: (
      <>
        Ro<u>u</u>tes
      </>
    ),
    shortcut: "U",
    tooltip: "Trade routes: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleTemperature",
    name: (
      <>
        <u>T</u>emperature
      </>
    ),
    shortcut: "T",
    tooltip: "Temperature map: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "togglePopulation",
    name: (
      <>
        Populatio<u>n</u>
      </>
    ),
    shortcut: "N",
    tooltip: "Population map: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleIce",
    name: <>Ice</>,
    shortcut: "J",
    tooltip:
      "Icebergs and glaciers: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleGoods",
    name: (
      <>
        <u>G</u>oods
      </>
    ),
    shortcut: null,
    tooltip: "Goods and Production: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleMarketsLayer",
    name: <>Markets</>,
    shortcut: null,
    tooltip: "Markets: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleTrade",
    name: <>Trade</>,
    shortcut: "`",
    tooltip:
      "Trade: animated trade deal flows. Click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "togglePrecipitation",
    name: (
      <>
        Precipit<u>a</u>tion
      </>
    ),
    shortcut: "A",
    tooltip: "Precipitation map: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleEmblems",
    name: <>Emblems</>,
    shortcut: "Y",
    tooltip: "Emblems: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleBurgIcons",
    name: (
      <>
        <u>I</u>cons
      </>
    ),
    shortcut: "I",
    tooltip: "Burg icons: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleLabels",
    name: (
      <>
        <u>L</u>abels
      </>
    ),
    shortcut: "L",
    tooltip: "Labels: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleMilitary",
    name: (
      <>
        <u>M</u>ilitary
      </>
    ),
    shortcut: "M",
    tooltip: "Military forces: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleMarkers",
    name: (
      <>
        Mar<u>k</u>ers
      </>
    ),
    shortcut: "K",
    tooltip: "Markers: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleRulers",
    name: <>Rulers</>,
    shortcut: "=",
    tooltip: "Rulers: click to toggle, drag to move, click on label to delete. Ctrl + click to edit layer style"
  },
  {
    id: "toggleScaleBar",
    name: <>Scale Bar</>,
    shortcut: "/",
    tooltip: "Scale Bar: click to toggle. Ctrl + click to edit style",
    isSolid: true
  },
  {
    id: "toggleVignette",
    name: <>Vignette</>,
    shortcut: "[",
    tooltip: "Vignette (border fading): click to toggle. Ctrl + click to edit style",
    isSolid: true
  }
];

interface LayerState {
  // Ordered array of layer configurations
  layers: LayerConfig[];

  // Which layers are currently "on" (e.g., activeLayers["toggleTexture"] = true)
  activeLayers: Record<string, boolean>;

  // Available presets (e.g. presets["political"] = ["toggleBorders", ...])
  presets: Record<string, string[]>;
  activePreset: string;

  // Actions
  setLayers: (layers: LayerConfig[]) => void;
  reorderLayers: (startIndex: number, endIndex: number) => void;
  toggleLayer: (id: string, forceState?: boolean) => void;
  setPresets: (presets: Record<string, string[]>) => void;
  setActivePreset: (preset: string) => void;
  setAllActiveLayers: (activeLayers: Record<string, boolean>) => void;
}

export const useLayerState = create<LayerState>((set, get) => ({
  layers: [],
  activeLayers: {},
  presets: {},
  activePreset: "custom",

  setLayers: layers => set({ layers }),

  reorderLayers: (startIndex, endIndex) => {
    const layers = [...get().layers];
    const [removed] = layers.splice(startIndex, 1);
    layers.splice(endIndex, 0, removed);
    set({ layers });

    // Defer to the next tick to ensure state is updated before calling legacy d3 drawing
    setTimeout(() => {
      // Synchronize the actual SVG layer order using the global function from layers.ts
      import("../controllers/layers").then(m => m.syncSVGLayersOrder(layers));
    }, 0);
  },

  toggleLayer: (id, forceState) => {
    const { activeLayers } = get();
    const currentState = activeLayers[id] ?? false;
    const nextState = forceState !== undefined ? forceState : !currentState;
    set({ activeLayers: { ...activeLayers, [id]: nextState } });
  },

  setPresets: presets => set({ presets }),

  setActivePreset: activePreset => set({ activePreset }),

  setAllActiveLayers: activeLayers => set({ activeLayers })
}));
