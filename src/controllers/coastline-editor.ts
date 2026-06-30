import Alea from "alea";
import { drag, polygonArea, select } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import {
  BiomesRenderer,
  BordersRenderer,
  CulturesRenderer,
  FeaturesRenderer,
  ProvincesRenderer,
  ReligionsRenderer,
  StatesRenderer
} from "../renderers";
import {
  buildCoastlinePath,
  type CoastlineSettings,
  defaultCoastSettings,
  fractalize,
  makeRoughnessProfile,
  PROFILE_SIZE
} from "../renderers/coastline-fractal";
import { getFeaturePath } from "../renderers/index";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { elSelected, modules, setElSelected } from "../store/editorState";
import { closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { rn, si, unique } from "../utils";
import { getArea, getAreaUnit } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { getElementById, getElementBySelector, layerIsOn } from "../utils/nodeUtils";
import { interactionManager } from "./interactionManager";
import { toggleCells } from "./layers";
import { editStyle } from "./style";

let worldContext: WorldContext;
let appServices: AppServices;

export interface SliderDef {
  id: string;
  label: string;
  tip: string;
  min: number;
  max: number;
  step: number;
  key: keyof Omit<CoastlineSettings, "enabled">;
}

export const SLIDER_DEFS: SliderDef[] = [
  {
    id: "coastMaxDepth",
    label: "Detail depth",
    tip: "Maximum recursion levels per edge. Each +1 can double point count in rough zones.",
    min: 1,
    max: 5,
    step: 1,
    key: "maxDepth"
  },
  {
    id: "coastBaseAmplitude",
    label: "Roughness amplitude",
    tip: "Peak perpendicular displacement. Scales with √(edge length) so large edges stay proportional.",
    min: 0.2,
    max: 4,
    step: 0.1,
    key: "baseAmplitude"
  },
  {
    id: "coastAmplitudeDecay",
    label: "Amplitude decay",
    tip: "Amplitude multiplier per recursion level (Hurst exponent). Lower = more jagged finer detail.",
    min: 0.01,
    max: 0.99,
    step: 0.01,
    key: "amplitudeDecay"
  },
  {
    id: "coastMinEdge",
    label: "Minimum edge",
    tip: "Edges shorter than this (map units) are never subdivided regardless of roughness.",
    min: 0.1,
    max: 10,
    step: 0.1,
    key: "minEdge"
  },
  {
    id: "coastSmoothThreshold",
    label: "Smooth threshold",
    tip: "Profile values below this receive zero displacement → glassy arc. Controls calm-coast coverage.",
    min: 0.01,
    max: 0.5,
    step: 0.01,
    key: "smoothThreshold"
  },
  {
    id: "coastRoughnessContrast",
    label: "Roughness contrast",
    tip: "Power applied to the roughness profile. Higher = sharper calm/rough transition.",
    min: 0.5,
    max: 10,
    step: 0.1,
    key: "roughnessContrast"
  },
  {
    id: "coastProfileHarmonics",
    label: "Roughness zones",
    tip: "Number of cosine harmonics shaping the roughness envelope. 1 = one large concentrated patch; 8 = many small scattered zones.",
    min: 1,
    max: 8,
    step: 1,
    key: "profileHarmonics"
  },
  {
    id: "coastLakeSmoothThreshMult",
    label: "Lake smooth multiplier",
    tip: "Smooth-threshold multiplier for lake shores. 1 = same roughness as ocean.",
    min: 0.1,
    max: 5,
    step: 0.1,
    key: "lakeSmoothThreshMult"
  }
];

export const COAST_PRESETS: Record<string, Omit<CoastlineSettings, "enabled">> = {
  Default: {
    ...defaultCoastSettings
  },
  Smooth: {
    maxDepth: 3,
    baseAmplitude: 1,
    amplitudeDecay: 0.6,
    minEdge: 1,
    smoothThreshold: 0.3,
    roughnessContrast: 2.0,
    profileHarmonics: 1,
    lakeSmoothThreshMult: 3.0
  },
  Rocky: {
    maxDepth: 4,
    baseAmplitude: 3.0,
    amplitudeDecay: 0.7,
    minEdge: 0.5,
    smoothThreshold: 0.05,
    roughnessContrast: 0.8,
    profileHarmonics: 7,
    lakeSmoothThreshMult: 1.2
  },
  Fjords: {
    maxDepth: 4,
    baseAmplitude: 2.8,
    amplitudeDecay: 0.92,
    minEdge: 0.3,
    smoothThreshold: 0.25,
    roughnessContrast: 5.0,
    profileHarmonics: 2,
    lakeSmoothThreshMult: 2.5
  },
  Archipelago: {
    maxDepth: 4,
    baseAmplitude: 1.8,
    amplitudeDecay: 0.88,
    minEdge: 0.5,
    smoothThreshold: 0.18,
    roughnessContrast: 1.0,
    profileHarmonics: 8,
    lakeSmoothThreshMult: 1.5
  }
};

const PREVIEW_SEED = "preview_coastline";

function updateCoastlineFeatureData(): void {
  if (!elSelected) return;

  const group = (elSelected.node()!.parentNode as SVGGElement).id;
  const groupOptions: { value: string; label: string }[] = [];
  view.coastline.selectAll("g").each(function () {
    const g = this as SVGGElement;
    groupOptions.push({ value: g.id, label: g.id });
  });

  const featureId = +elSelected.attr("data-f");
  const { area } = worldContext.pack.features[featureId];
  const areaUI = `${si(getArea(area))} ${getAreaUnit()}`;

  import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
    getCoastlineEditorState().setFeatureData({
      group,
      groupOptions,
      areaUI
    });
  });
}

function drawCoastlineVertices(): void {
  const featureId = +elSelected!.attr("data-f");
  const { vertices } = worldContext.pack.features[featureId];

  const cellsNumber = worldContext.pack.cells.i.length;
  const neibCells = unique(
    (vertices as number[]).flatMap((v: number) => worldContext.pack.vertices.c[v]) as number[]
  ).filter((cellId: number) => cellId < cellsNumber);

  view.debug
    .select("#vertices")
    .selectAll("polygon")
    .data(neibCells)
    .enter()
    .append("polygon")
    .attr("points", (d: number) => getPackPolygon(d, worldContext.pack).join(" "))
    .attr("data-c", (d: number) => d);

  view.debug
    .select("#vertices")
    .selectAll("circle")
    .data(vertices as number[])
    .enter()
    .append("circle")
    .attr("cx", (d: number) => worldContext.pack.vertices.p[d][0])
    .attr("cy", (d: number) => worldContext.pack.vertices.p[d][1])
    .attr("r", 0.4)
    .attr("data-v", (d: number) => d)
    .call(drag<SVGCircleElement, number>().on("drag", handleVertexDrag).on("end", handleVertexDragEnd))
    .on("mousemove", () =>
      tip("Drag to move the vertex. Please use for fine-tuning only. Edit heightmap to change actual cell heights!")
    );

  updateCoastlineFeatureData();
}

function handleVertexDrag(
  this: SVGCircleElement,
  dragEvent: import("d3").D3DragEvent<SVGCircleElement, unknown, unknown>
): void {
  const { vertices, features } = worldContext.pack;
  const x = rn(dragEvent.x, 2);
  const y = rn(dragEvent.y, 2);
  this.setAttribute("cx", String(x));
  this.setAttribute("cy", String(y));

  const vertexId = select(this).datum() as number;
  vertices.p[vertexId] = [x, y];

  const featureId = +elSelected!.attr("data-f");
  const feature = features[featureId];
  view.defs
    .select(`#featurePaths > path#feature_${featureId}`)
    .attr("d", getFeaturePath(worldContext, viewContext, appServices, feature));

  const points = (feature.vertices as number[]).map((v: number) => vertices.p[v]);
  feature.area = Math.abs(polygonArea(points as [number, number][]));
  updateCoastlineFeatureData();

  view.debug
    .select("#vertices")
    .selectAll("polygon")
    .attr("points", (d: unknown) => getPackPolygon(d as number, worldContext.pack).join(" "));
}

function handleVertexDragEnd(): void {
  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) ReligionsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCultures")) CulturesRenderer.render(worldContext, viewContext, appServices);
}

function closeCoastlineEditor(): void {
  view.debug.select("#vertices").remove();
  EditorBus.unselect();
  modules.editCoastline = false;
}

export const coastlineEditorActions = {
  showGroupSection: () => {
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setFeatureData({ isGroupSectionVisible: true });
    });
  },

  hideGroupSection: () => {
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setFeatureData({
        isGroupSectionVisible: false,
        isNewGroupInputVisible: false,
        newGroupName: ""
      });
    });
  },

  changeGroup: (newGroup: string) => {
    view.coastline.select<SVGGElement>(`#${newGroup}`).node()!.appendChild(elSelected!.node()!);
    updateCoastlineFeatureData();
  },

  toggleNewGroupInput: () => {
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      const state = getCoastlineEditorState();
      getCoastlineEditorState().setFeatureData({ isNewGroupInputVisible: !state.isNewGroupInputVisible });
    });
  },

  setNewGroupName: (name: string) => {
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setFeatureData({ newGroupName: name });
    });
  },

  createNewGroup: () => {
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      const { newGroupName: name } = getCoastlineEditorState();
      if (!name) {
        tip("Please provide a valid group name");
        return;
      }

      const group = name
        .toLowerCase()
        .replace(/ /g, "_")
        .replace(/[^\w\s]/gi, "");

      if (getElementById(group)) {
        tip("Element with this id already exists. Please provide a unique name", false, "error");
        return;
      }
      if (Number.isFinite(+group.charAt(0))) {
        tip("Group name should start with a letter", false, "error");
        return;
      }

      const oldGroup = elSelected!.node()!.parentNode as SVGGElement;
      const basic = ["sea_island", "lake_island"].includes(oldGroup.id);
      if (!basic && oldGroup.childElementCount === 1) {
        oldGroup.id = group;
        getCoastlineEditorState().setFeatureData({ isNewGroupInputVisible: false, newGroupName: "" });
        updateCoastlineFeatureData();
        return;
      }

      const newGroup = (elSelected!.node()!.parentNode as Element).cloneNode(false) as SVGGElement;
      view.coastline.node()!.appendChild(newGroup);
      newGroup.id = group;
      newGroup.appendChild(elSelected!.node()!);
      getCoastlineEditorState().setFeatureData({ isNewGroupInputVisible: false, newGroupName: "" });
      updateCoastlineFeatureData();
    });
  },

  removeGroup: () => {
    const group = (elSelected!.node()!.parentNode as SVGGElement).id;
    if (["sea_island", "lake_island"].includes(group)) {
      tip("This is one of the default groups, it cannot be removed", false, "error");
      return;
    }

    const count = (elSelected!.node()!.parentNode as Element).childElementCount;
    openConfirm(
      `Are you sure you want to remove the group? All coastline elements of the group (${count}) will be moved under <i>sea_island</i> group`,
      {
        title: "Remove coastline group",
        confirm: "Remove",
        onConfirm: () => {
          const sea = view.coastline.select<SVGGElement>("#sea_island").node()!;
          const groupEl = view.coastline.select<SVGGElement>(`#${group}`).node()!;
          while (groupEl.childNodes.length) {
            sea.appendChild(groupEl.childNodes[0]);
          }
          groupEl.remove();
          updateCoastlineFeatureData();
          import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
            getCoastlineEditorState().setFeatureData({ group: "sea_island" });
          });
        }
      }
    );
  },

  editStyle: () => {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    editStyle("coastline", g);
  }
};

export const coastlineSettingsActions = {
  toggleEnabled: (enabled: boolean) => {
    defaultCoastSettings.enabled = enabled;
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setSettingsData({}, enabled);
    });
    FeaturesRenderer.render(worldContext, viewContext, appServices);
  },

  changeSetting: (key: keyof Omit<CoastlineSettings, "enabled">, value: number) => {
    (defaultCoastSettings[key] as number) = value;
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setSettingsData({ [key]: value });
    });
    FeaturesRenderer.render(worldContext, viewContext, appServices);
  },

  resetSetting: (key: keyof Omit<CoastlineSettings, "enabled">) => {
    const def = SLIDER_DEFS.find(d => d.key === key);
    if (!def) return;
    const defaultVal = COAST_PRESETS.Default[key];
    (defaultCoastSettings[key] as number) = defaultVal;
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setSettingsData({ [key]: defaultVal });
    });
    FeaturesRenderer.render(worldContext, viewContext, appServices);
  },

  applyPreset: (name: string) => {
    const preset = COAST_PRESETS[name];
    for (const { key } of SLIDER_DEFS) {
      if (!(key in preset)) continue;
      const val = preset[key as keyof typeof preset];
      (defaultCoastSettings[key] as number) = val;
    }
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setSettingsData(preset);
    });
    FeaturesRenderer.render(worldContext, viewContext, appServices);
  },

  updatePreviews: (roughnessCanvas: HTMLCanvasElement, shapePreviewCanvas: HTMLCanvasElement) => {
    drawRoughnessGraph(roughnessCanvas);
    drawShapePreview(shapePreviewCanvas);
  }
};

function drawRoughnessGraph(canvas: HTMLCanvasElement): void {
  const W = canvas.width || canvas.clientWidth || 300;
  const H = canvas.height || canvas.clientHeight || 100;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const rand = Alea(PREVIEW_SEED);
  const profile = makeRoughnessProfile(
    worldContext,
    viewContext,
    appServices,
    rand,
    defaultCoastSettings.roughnessContrast,
    defaultCoastSettings.profileHarmonics
  );

  const thresh = Math.min(Math.max(defaultCoastSettings.smoothThreshold, 0), 1);
  const threshY = H * (1 - thresh);
  const baseY = H;

  // Pre-compute curve points
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= PROFILE_SIZE; i++) {
    xs.push((i / PROFILE_SIZE) * W);
    ys.push(H * (1 - profile[i % PROFILE_SIZE]));
  }

  // Helper: fill area under curve clipped to a horizontal band
  const fillBand = (clipTop: number, clipBot: number, color: string): void => {
    const h = clipBot - clipTop;
    if (h <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, W, h);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.lineTo(xs[xs.length - 1], baseY);
    ctx.lineTo(xs[0], baseY);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  };

  // Helper: stroke curve clipped to a horizontal band
  const strokeBand = (clipTop: number, clipBot: number, color: string): void => {
    const h = clipBot - clipTop;
    if (h <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, W, h);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  };

  // Rough zone (above threshold): warm orange
  fillBand(0, threshY, "rgba(210,90,30,0.20)");
  strokeBand(0, threshY, "#c85520");

  // Smooth zone (below threshold): cool teal
  fillBand(threshY, baseY, "rgba(30,165,135,0.20)");
  strokeBand(threshY, baseY, "#18a888");

  // Threshold dashed line
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([4, 3]);
  ctx.moveTo(0, threshY);
  ctx.lineTo(W, threshY);
  ctx.strokeStyle = "rgba(30,140,100,0.75)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Zone labels
  ctx.font = "bold 8px sans-serif";
  ctx.textAlign = "left";
  if (threshY > 12) {
    ctx.fillStyle = "#c85520";
    ctx.fillText("ROUGH", 12, 11);
  }
  if (baseY - threshY > 10) {
    ctx.fillStyle = "#18a888";
    ctx.fillText("CALM", 12, baseY - 4);
  }

  if (!defaultCoastSettings.enabled) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
  }
}

function drawShapePreview(canvas: HTMLCanvasElement): void {
  const W = canvas.width || canvas.clientWidth || 100;
  const H = canvas.height || canvas.clientHeight || 100;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.34;

  const basePts: [number, number][] = [
    [cx, cy - r], // top
    [cx + r, cy], // right
    [cx, cy + r], // bottom
    [cx - r, cy] // left
  ];

  const shape = defaultCoastSettings.enabled
    ? fractalize(worldContext, viewContext, appServices, basePts, Alea(PREVIEW_SEED), defaultCoastSettings)
    : { points: basePts, origIndices: [0, 1, 2, 3] };
  const path = new Path2D(`${buildCoastlinePath(worldContext, viewContext, appServices, shape)}Z`);

  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.85);
  bgGrad.addColorStop(0, "#cce5f5");
  bgGrad.addColorStop(1, "#6aa4cb");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const landGrad = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, r * 0.05, cx, cy, r * 1.1);
  landGrad.addColorStop(0, "#d8c87a");
  landGrad.addColorStop(0.5, "#9cbc60");
  landGrad.addColorStop(1, "#5c8e40");

  ctx.save();
  ctx.shadowColor = "rgba(0,20,60,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = landGrad;
  ctx.fill(path);
  ctx.restore();

  ctx.strokeStyle = "#5c4526";
  ctx.lineWidth = 1.5;
  ctx.stroke(path);

  const origPts = shape.origIndices.map(i => shape.points[i]);
  ctx.beginPath();
  for (let j = 0; j < origPts.length; j++) {
    const [x, y] = origPts[j];
    j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const [x, y] of origPts) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(60,40,10,0.55)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  if (!defaultCoastSettings.enabled) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("OFF", cx, cy);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
  }
}

class CoastlineEditorModule {
  editCoastline(event?: MouseEvent): void {
    if (view.customization) return;
    closeDialogs(".stable");
    if (layerIsOn("toggleCells")) toggleCells();

    openDialog("coastlineEditor", {
      title: "Edit Coastline",
      resizable: false,
      position: { my: "center top+20", at: "top", of: event, collision: "fit" },
      onClose: closeCoastlineEditor
    });

    const node = (event?.target ?? getElementBySelector<SVGElement>(".coastline path")) as SVGElement | null;
    view.debug.append("g").attr("id", "vertices");
    setElSelected(node ? select(node as Element) : null);
    if (node) {
      drawCoastlineVertices();
    }
    interactionManager.setMouseMoveHandler(null);

    if (modules.editCoastline) return;
    modules.editCoastline = true;
  }

  open(): void {
    import("../store/coastlineEditorState").then(({ getCoastlineEditorState }) => {
      getCoastlineEditorState().setSettingsData(defaultCoastSettings, defaultCoastSettings.enabled);
    });

    closeDialogs("#culturesEditor, .stable");

    openDialog("coastlineSettingsDialog", {
      title: "Coastline Settings Editor",
      resizable: false,
      width: "auto",
      position: { my: "right top", at: "right-10 top+10", of: "svg" },
      onClose: closeCoastlineEditor
    });
  }
}

export const coastlineEditor = new CoastlineEditorModule();
export const editCoastline = (event?: MouseEvent) => coastlineEditor.editCoastline(event);

export function initCoastlineEditor(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}
