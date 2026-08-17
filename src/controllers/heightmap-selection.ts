import Alea from "alea";
import { worldContext } from "../context/worldContext";
import { heightmapTemplates, precreatedHeightmaps } from "../data";
import { getEarthRegion } from "../data/earthRegions";
import { HeightmapGenerator } from "../generators/heightmap-generator";
import type { Grid } from "../types/Grid";
import { openDialog } from "../ui/dialogs/dialogService";
import { getColorScheme, heightmapColorSchemes } from "../utils/colorUtils";
import { drawHeights, generateGrid, shouldRegenerateGrid } from "../utils/graphUtils";

// Cached grid to avoid regenerating on every open
let cachedGraph: Grid | null = null;

export const INITIAL_COLOR_SCHEME = Object.keys(heightmapColorSchemes)[0] ?? "Bright";

export function openHeightmapSelection(): void {
  cachedGraph = computeGraph(cachedGraph);
  openDialog("heightmapSelection");
}

export function computeGraph(currentGraph: Grid | null): Grid {
  const needsRegen = shouldRegenerateGrid(
    currentGraph,
    worldContext.seed,
    worldContext.graphWidth,
    worldContext.graphHeight
  );
  const newGraph = needsRegen
    ? generateGrid(worldContext.seed, worldContext.graphWidth, worldContext.graphHeight)
    : structuredClone(currentGraph!);
  delete (newGraph.cells as { h?: unknown }).h;
  cachedGraph = newGraph;
  return newGraph;
}

export function getOrComputeGraph(): Grid {
  if (!cachedGraph) cachedGraph = computeGraph(null);
  return cachedGraph;
}

export function buildTemplatePreview(id: string, seed: string, scheme: string, renderOcean: boolean): string {
  const graph = getOrComputeGraph();
  Math.random = Alea(seed);
  const heights = HeightmapGenerator.fromTemplate(graph, id);
  return renderHeightmapToDataUrl(heights, graph, scheme, renderOcean);
}

export async function buildPrecreatedPreview(id: string, scheme: string, renderOcean: boolean): Promise<string> {
  const graph = getOrComputeGraph();
  const region = getEarthRegion(id);
  const heights = region
    ? await HeightmapGenerator.fromEarthRegion(graph, region)
    : await HeightmapGenerator.fromPrecreated(graph, id);
  return renderHeightmapToDataUrl(heights, graph, scheme, renderOcean);
}

export function getHeightmapName(id: string): string {
  if (id in heightmapTemplates) return heightmapTemplates[id].name;
  const earth = getEarthRegion(id);
  if (earth) return earth.name;
  if (id in precreatedHeightmaps) return precreatedHeightmaps[id].name;
  return id;
}

function renderHeightmapToDataUrl(
  heights: Uint8Array | null,
  graph: Grid,
  scheme: string,
  renderOcean: boolean
): string {
  const colorScheme = getColorScheme(scheme);
  return drawHeights({
    heights: heights ?? new Uint8Array(),
    width: graph.cellsX,
    height: graph.cellsY,
    scheme: colorScheme,
    renderOcean
  });
}
