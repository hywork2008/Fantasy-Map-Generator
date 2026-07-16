import type React from "react";
import { create } from "zustand";

/**
 * Describes an SVG <g> element that an extension wants to create and manage.
 * The extension system reads these specs when `addLayers()` is called and
 * inserts elements at the specified position within #viewbox.
 */
export interface SvgLayerSpec {
  /** DOM element ID for the SVG <g> (e.g. "marketsLayerFill") */
  id: string;
  /** Insert this element before the element with this DOM ID */
  insertBefore?: string;
  /** Insert this element after the element with this DOM ID */
  insertAfter?: string;
  /** Initial CSS display value — omit for visible-by-default */
  display?: "none";
}

export interface LayerConfig {
  id: string;
  name: React.ReactNode;
  shortcut: string | null;
  tooltip: string;
  isSolid?: boolean;
  /** SVG <g> elements the extension system should create/re-acquire for this toggle. */
  svgLayers?: SvgLayerSpec[];
  /**
   * Plain-text key for alphabetical panel order.
   * Defaults to `id` with the `toggle` prefix stripped (e.g. toggleMilitary → "Military").
   * Use only when that default would sort under the wrong letter relative to the button label —
   * e.g. toggleBurgIcons → "BurgIcons" but the label is "Icons"; toggleCompass → "Compass" but
   * the label is "Wind Rose". Not for controlling SVG/WebGL paint order (that is DOM / deck order).
   */
  sortKey?: string;
}

export const DEFAULT_LAYERS: LayerConfig[] = [
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
    id: "toggleCombatDeaths",
    name: <>Combat Deaths</>,
    shortcut: null,
    tooltip:
      "Recent combat deaths by battlefield (uses Population Overview death window): click to toggle, drag to raise or lower the layer"
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
    id: "toggleDanger",
    name: <>Danger</>,
    shortcut: null,
    tooltip: "Danger: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleEnclosure",
    name: <>Enclosure</>,
    shortcut: null,
    tooltip:
      "Enclosure: heatmap of how enclosed/landlocked each water cell is (pack.cells.enclosure), red = open sea, green = enclosed inland sea. Click to toggle."
  },
  {
    id: "toggleEmblems",
    name: <>Emblems</>,
    shortcut: "Y",
    tooltip: "Emblems: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
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
    id: "toggleIce",
    name: <>Ice</>,
    shortcut: "J",
    tooltip:
      "Icebergs and glaciers: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleBurgIcons",
    name: (
      <>
        <u>I</u>cons
      </>
    ),
    shortcut: "I",
    tooltip: "Burg icons: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style",
    sortKey: "Icons"
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
    id: "toggleLakes",
    name: <>Lakes</>,
    shortcut: "Q",
    tooltip: "Lakes: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
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
    id: "toggleFrontierForts",
    name: <>Frontier Forts</>,
    shortcut: null,
    tooltip: "Frontier forts: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
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
    id: "toggleVignette",
    name: <>Vignette</>,
    shortcut: "[",
    tooltip: "Vignette (border fading): click to toggle. Ctrl + click to edit style",
    isSolid: true
  },
  {
    id: "toggleCompass",
    name: (
      <>
        <u>W</u>ind Rose
      </>
    ),
    shortcut: "W",
    tooltip: "Wind (Compass) Rose: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style",
    sortKey: "Wind Rose"
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
  }
];

interface LayerState {
  // Ordered array of layer configurations
  layers: LayerConfig[];

  // Which layers are currently "on" (e.g., activeLayers["toggleTexture"] = true)
  activeLayers: Record<string, boolean>;

  // Available presets (e.g. presets["political"] = ["toggleBorders", ...])
  presets: Record<string, string[]>;
  // Human-readable labels for presets (e.g. presetLabels["political"] = "Political map")
  presetLabels: Record<string, string>;
  activePreset: string;
  presetDisabled: boolean;

  // Actions
  setPresetDisabled: (disabled: boolean) => void;
  setLayers: (layers: LayerConfig[]) => void;
  addLayers: (newLayers: LayerConfig[]) => void;
  removeLayers: (layerIds: string[]) => void;
  reorderLayers: (startIndex: number, endIndex: number) => void;
  toggleLayer: (id: string, forceState?: boolean) => void;
  setPresets: (presets: Record<string, string[]>) => void;
  addPresetLabel: (id: string, label: string) => void;
  removePresetLabel: (id: string) => void;
  setActivePreset: (preset: string) => void;
  setAllActiveLayers: (activeLayers: Record<string, boolean>) => void;
}

const toSortKey = (l: LayerConfig) => l.sortKey ?? l.id.replace(/^toggle/, "");

const sortLayers = (layers: LayerConfig[]) => {
  return [...layers].sort((a, b) => toSortKey(a).localeCompare(toSortKey(b)));
};

export const useLayerState = create<LayerState>((set, get) => ({
  layers: [],
  activeLayers: {},
  presets: {},
  presetLabels: {},
  activePreset: "custom",
  presetDisabled: false,

  setPresetDisabled: disabled => set({ presetDisabled: disabled }),
  setLayers: layers => set({ layers: sortLayers(layers) }),

  addLayers: newLayers => {
    set(state => {
      const existingIds = new Set(state.layers.map(l => l.id));
      const filtered = newLayers.filter(l => !existingIds.has(l.id));
      if (filtered.length === 0) return state;
      return { layers: sortLayers([...state.layers, ...filtered]) };
    });
  },

  removeLayers: layerIds => {
    set(state => {
      const idSet = new Set(layerIds);
      return { layers: state.layers.filter(l => !idSet.has(l.id)) };
    });
  },

  reorderLayers: (startIndex, endIndex) => {
    const layers = [...get().layers];
    const [removed] = layers.splice(startIndex, 1);
    layers.splice(endIndex, 0, removed);
    set({ layers });

    // Defer to the next tick to ensure state is updated before calling legacy d3 drawing
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("fmg:sync-layers-order", { detail: layers }));
    }, 0);
  },

  toggleLayer: (id, forceState) => {
    const { activeLayers } = get();
    const currentState = activeLayers[id] ?? false;
    const nextState = forceState !== undefined ? forceState : !currentState;
    set({ activeLayers: { ...activeLayers, [id]: nextState } });
  },

  setPresets: presets => set({ presets }),

  addPresetLabel: (id, label) => set(state => ({ presetLabels: { ...state.presetLabels, [id]: label } })),

  removePresetLabel: id =>
    set(state => {
      const newLabels = { ...state.presetLabels };
      delete newLabels[id];
      return { presetLabels: newLabels };
    }),

  setActivePreset: activePreset => set({ activePreset }),

  setAllActiveLayers: activeLayers => set({ activeLayers })
}));
