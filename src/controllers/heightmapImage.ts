import * as d3 from "d3";
import RgbQuant from "rgbquant";
import { resetZoom } from "../actions";
import { worldContext } from "../context/worldContext";
import { viewLayerService as view } from "../services/viewLayerService";
import { setHeightmapEditorState, useHeightmapEditorState } from "../store/heightmapEditorState";
import { getGridPolygon, showPrompt } from "../utils";
import { getColorScheme } from "../utils/colorUtils";
import { getElementById } from "../utils/nodeUtils";
import { tip } from "../utils/uiHelpers";

export interface HeightmapImageCallbacks {
  updateHeightmap: () => void;
  undoHistory: () => void;
  openBrushesPanel: () => void;
}

let localCallbacks: HeightmapImageCallbacks;

export function openImageConverter(callbacks: HeightmapImageCallbacks): void {
  localCallbacks = callbacks;

  const canvas = document.createElement("canvas");
  canvas.id = "canvas";
  canvas.width = worldContext.graphWidth;
  canvas.height = worldContext.graphHeight;
  const optionsContainer = getElementById("optionsContainer");
  optionsContainer?.parentNode?.insertBefore(canvas, optionsContainer);

  setOverlayOpacity(0);

  worldContext.grid.cells.h = new Uint8Array(worldContext.grid.cells.i.length);
  view.viewbox.select("#heights").selectAll("*").remove();
  localCallbacks.updateHeightmap();
}

export function setOverlayOpacity(v: number): void {
  setHeightmapEditorState({ imageConverterOverlay: v });
  const cnv = getElementById("canvas") as HTMLCanvasElement;
  if (cnv) cnv.style.opacity = String(v);
}

export function uploadImage(input: HTMLInputElement): void {
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";
  const reader = new FileReader();
  const img = new Image();
  img.id = "imageToConvert";
  img.style.display = "none";
  document.body.appendChild(img);
  img.onload = () => {
    const ctx = (getElementById("canvas") as HTMLCanvasElement).getContext("2d")!;
    ctx.drawImage(img, 0, 0, worldContext.graphWidth, worldContext.graphHeight);
    const count = useHeightmapEditorState.getState().imageConverterColorsMax;
    heightsFromImage(count);
    resetZoom();
  };
  reader.onloadend = () => (img.src = reader.result as string);
  reader.readAsDataURL(file);
}

function heightsFromImage(count: number): void {
  const sourceImage = getElementById("canvas") as HTMLCanvasElement;
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = worldContext.grid.cellsX;
  sampleCanvas.height = worldContext.grid.cellsY;
  sampleCanvas.getContext("2d")!.drawImage(sourceImage, 0, 0, worldContext.grid.cellsX, worldContext.grid.cellsY);

  const q = new RgbQuant({ colors: count });
  q.sample(sampleCanvas);
  const data = q.reduce(sampleCanvas);
  const pallete = q.palette(true);

  view.viewbox.select("#heights").selectAll("*").remove();
  sampleCanvas.remove();

  view.viewbox
    .select<SVGGElement>("#heights")
    .selectAll<SVGPolygonElement, number>("polygon")
    .data(Array.from(worldContext.grid.cells.i))
    .join("polygon")
    .attr("points", d => getGridPolygon(d, worldContext.grid).join(" "))
    .attr("id", d => `cell${d}`)
    .attr("fill", d => `rgb(${data[d * 4]}, ${data[d * 4 + 1]}, ${data[d * 4 + 2]})`)
    .on("click", function () {
      const fill = this.getAttribute("fill");
      if (fill) selectColor(fill);
    });

  const palleteParsed = pallete as [number, number, number][];
  const colors = palleteParsed.map(p => `rgb(${p[0]}, ${p[1]}, ${p[2]})`);

  setHeightmapEditorState({
    imageConverterUnassigned: colors,
    imageConverterAssigned: {},
    imageConverterSelectedColor: null,
    imageConverterHoveredHeight: null
  });
}

export function selectColor(color: string): void {
  const state = useHeightmapEditorState.getState();
  const isSelected = state.imageConverterSelectedColor === color;

  view.viewbox.select("#heights").selectAll(".selectedCell").attr("class", null);

  if (isSelected) {
    setHeightmapEditorState({ imageConverterSelectedColor: null, imageConverterHoveredHeight: null });
    return;
  }

  setHeightmapEditorState({ imageConverterSelectedColor: color });

  if (state.imageConverterAssigned[color] !== undefined) {
    const h = state.imageConverterAssigned[color];
    setHeightmapEditorState({ imageConverterHoveredHeight: h });
  } else {
    setHeightmapEditorState({ imageConverterHoveredHeight: null });
  }

  view.viewbox.select("#heights").selectAll(`polygon[fill='${color}']`).classed("selectedCell", true);
}

export function assignHeight(height: number): void {
  const state = useHeightmapEditorState.getState();
  const selectedColor = state.imageConverterSelectedColor;
  if (!selectedColor) return;

  const colorScheme = getColorScheme(null);
  const targetRgb = colorScheme(1 - (height < 20 ? height - 5 : height) / 100);

  view.viewbox
    .select("#heights")
    .selectAll<SVGElement, unknown>(".selectedCell")
    .each(function () {
      this.setAttribute("fill", targetRgb);
      this.setAttribute("data-height", String(height));
    });

  const unassigned = state.imageConverterUnassigned.filter(c => c !== selectedColor);
  const assigned = { ...state.imageConverterAssigned };

  // Replace the old color with targetRgb if needed
  assigned[targetRgb] = height;

  setHeightmapEditorState({
    imageConverterUnassigned: unassigned,
    imageConverterAssigned: assigned,
    imageConverterSelectedColor: targetRgb
  });
}

export function autoAssign(type: string): void {
  const state = useHeightmapEditorState.getState();
  if (!state.imageConverterUnassigned.length) {
    heightsFromImage(state.imageConverterColorsMax);
    const newState = useHeightmapEditorState.getState();
    if (!newState.imageConverterUnassigned.length) {
      tip("No unassigned colors. Please load an image and click the button again", false, "error");
      return;
    }
  }

  const { imageConverterUnassigned, imageConverterAssigned } = useHeightmapEditorState.getState();
  const colorScheme = getColorScheme(null);

  const getHeightByHue = (clr: string) => {
    let hue = d3.hsl(clr).h;
    if (hue > 300) hue -= 360;
    if (hue > 170) return (Math.abs(hue - 250) / 3) | 0;
    return (Math.abs(hue - 250 + 20) / 3) | 0;
  };

  const getHeightByLum = (clr: string) => {
    const lum = d3.lab(clr).l ?? 0;
    if (lum < 13) return ((lum / 13) * 20) | 0;
    return lum | 0;
  };

  const scheme = d3.range(101).map(i => colorScheme(1 - (i < 20 ? i - 5 : i) / 100));
  const hues = scheme.map(rgb => d3.hsl(rgb).h | 0);
  const getHeightByScheme = (clr: string) => {
    const h = scheme.indexOf(clr);
    if (h !== -1) return h;
    const hue = d3.hsl(clr).h;
    const closest = hues.reduce((prev, curr) => (Math.abs(curr - hue) < Math.abs(prev - hue) ? curr : prev));
    return hues.indexOf(closest);
  };

  const newAssigned = { ...imageConverterAssigned };
  const assignedMap: boolean[] = [];

  imageConverterUnassigned.forEach(clr => {
    const h = type === "hue" ? getHeightByHue(clr) : type === "lum" ? getHeightByLum(clr) : getHeightByScheme(clr);
    const colorTo = colorScheme(1 - (h < 20 ? (h - 5) / 100 : h / 100));

    view.viewbox.select("#heights").selectAll(`polygon[fill='${clr}']`).attr("fill", colorTo).attr("data-height", h);

    if (!assignedMap[h]) {
      newAssigned[colorTo] = h;
      assignedMap[h] = true;
    }
  });

  setHeightmapEditorState({
    imageConverterUnassigned: [],
    imageConverterAssigned: newAssigned,
    imageConverterSelectedColor: null
  });
}

export function setColorsNumber(): void {
  const current = useHeightmapEditorState.getState().imageConverterColorsMax;
  showPrompt(
    `Please set maximum number of colors. <br>An actual number is usually lower and depends on color scheme`,
    { default: current, step: 1, min: 3, max: 255 },
    value => {
      const number = +value;
      setHeightmapEditorState({ imageConverterColorsMax: number });
      heightsFromImage(number);
    }
  );
}

export function applyConversion(): void {
  const state = useHeightmapEditorState.getState();
  if (Object.keys(state.imageConverterAssigned).length < 3) {
    tip("Please assign colors to heights first", false, "error");
    return;
  }

  view.viewbox
    .select("#heights")
    .selectAll<SVGElement, unknown>("polygon")
    .each(function () {
      const h = +(this as SVGElement).dataset.height! || 0;
      const i = +(this as SVGElement).id.slice(4);
      worldContext.grid.cells.h[i] = h;
    });

  view.viewbox.select("#heights").selectAll("polygon").remove();
  localCallbacks.updateHeightmap();
  restoreImageConverterState();
}

export function cancelConversion(): void {
  restoreImageConverterState();
  view.viewbox.select("#heights").selectAll("polygon").remove();
  localCallbacks.undoHistory();
}

export function restoreImageConverterState(): void {
  const cnv = getElementById("canvas");
  if (cnv) cnv.remove();
  const img = getElementById("imageToConvert");
  if (img) img.remove();

  setHeightmapEditorState({
    imageConverterUnassigned: [],
    imageConverterAssigned: {},
    imageConverterSelectedColor: null,
    imageConverterHoveredHeight: null
  });

  view.viewbox.style("cursor", "default").on(".drag", null);
  tip('Heightmap edit mode is active. Click on "Exit Customization" to finalize the heightmap', true);
  localCallbacks.openBrushesPanel();
}
