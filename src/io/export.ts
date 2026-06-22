import type { Selection } from "d3";
import * as d3 from "d3";
import JSZip from "jszip";
import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { downloadFile, getFileName } from "../controllers/editors";
import { fonts, loadFontsAsDataURI } from "../modules/fonts";
import { Rivers } from "../modules/river-generator";
import { drawScaleBar, fitScaleBar } from "../renderers/index";
import { connectVertices, getBase64, getCoordinates, rn, unique } from "../utils";
import { getColor, getColorScheme } from "../utils/colorUtils";
import { ERROR, TIME } from "../utils/debug";
import { getGridPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { getCellPopulation, getFriendlyHeight, tip } from "../utils/uiHelpers";

type AnySelection = Selection<SVGSVGElement, unknown, null, undefined>;

// ─── Image exports ────────────────────────────────────────────────────────────

export async function exportToSvg(): Promise<void> {
  TIME && console.time("exportToSvg");
  try {
    const url = await getMapURL("svg", { fullMap: true });
    const link = document.createElement("a");
    link.download = `${getFileName()}.svg`;
    link.href = url;
    link.click();
    const message = `${link.download} is saved. Open 'Downloads' screen (CTRL + J) to check`;
    tip(message, true, "success", 5000);
  } catch (error) {
    ERROR && console.error(error);
    tip(`SVG export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 5000);
  } finally {
    TIME && console.timeEnd("exportToSvg");
  }
}

export async function exportToPng(): Promise<void> {
  TIME && console.time("exportToPng");
  try {
    const url = await getMapURL("png");
    const link = document.createElement("a");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = viewContext.svgWidth * pngResolutionInput.valueAsNumber;
    canvas.height = viewContext.svgHeight * pngResolutionInput.valueAsNumber;

    const blob = await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error("Cannot render PNG image"));
          resolve(blob);
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Cannot load map image for PNG export"));
      img.src = url;
    });

    link.download = `${getFileName()}.png`;
    link.href = window.URL.createObjectURL(blob);
    link.click();
    window.setTimeout(() => {
      canvas.remove();
      window.URL.revokeObjectURL(link.href);
    }, 1000);

    tip(
      `${link.download} is saved. Open 'Downloads' screen (CTRL + J) to check. You can set image scale in options`,
      true,
      "success",
      5000
    );
  } catch (error) {
    ERROR && console.error(error);
    tip(`PNG export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 5000);
  } finally {
    TIME && console.timeEnd("exportToPng");
  }
}

export async function exportToJpeg(): Promise<void> {
  TIME && console.time("exportToJpeg");
  try {
    const url = await getMapURL("png");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = viewContext.svgWidth * pngResolutionInput.valueAsNumber;
    canvas.height = viewContext.svgHeight * pngResolutionInput.valueAsNumber;

    const quality = Math.min(rn(1 - pngResolutionInput.valueAsNumber / 20, 2), 0.92);
    const blob = await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          blob => {
            if (!blob) return reject(new Error("Cannot render JPEG image"));
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Cannot load map image for JPEG export"));
      img.src = url;
    });

    const link = document.createElement("a");
    link.download = `${getFileName()}.jpeg`;
    link.href = window.URL.createObjectURL(blob);
    link.click();
    tip(`${link.download} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
    window.setTimeout(() => window.URL.revokeObjectURL(link.href), 5000);
  } catch (error) {
    ERROR && console.error(error);
    tip(`JPEG export failed: ${(error as Error)?.message || "Unknown error"}`, true, "error", 5000);
  } finally {
    TIME && console.timeEnd("exportToJpeg");
  }
}

// ─── PNG tile export ──────────────────────────────────────────────────────────

export async function exportToPngTiles(): Promise<void> {
  const status = document.getElementById("tileStatus")!;
  status.innerHTML = "Preparing files...";

  const urlSchema = await getMapURL("tiles", { debug: true, fullMap: true });
  const zip = new JSZip();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = worldContext.graphWidth;
  canvas.height = worldContext.graphHeight;

  const imgSchema = new Image();
  imgSchema.src = urlSchema;
  await loadImage(imgSchema);

  status.innerHTML = "Rendering schema...";
  ctx.drawImage(imgSchema, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, "image/png");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  zip.file("schema.png", blob);

  const url = await getMapURL("tiles", { fullMap: true });
  const tilesX = +(document.getElementById("tileColsOutput") as HTMLInputElement)?.value || 2;
  const tilesY = +(document.getElementById("tileRowsOutput") as HTMLInputElement)?.value || 2;
  const scale = +(document.getElementById("tileScaleOutput") as HTMLInputElement)?.value || 1;
  const tolesTotal = tilesX * tilesY;

  const tileW = (worldContext.graphWidth / tilesX) | 0;
  const tileH = (worldContext.graphHeight / tilesY) | 0;

  const width = worldContext.graphWidth * scale;
  const height = width * (tileH / tileW);
  canvas.width = width;
  canvas.height = height;

  const img = new Image();
  img.src = url;
  await loadImage(img);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  function getRowLabel(row: number): string {
    const first = row >= alphabet.length ? alphabet[Math.floor(row / alphabet.length) - 1] : "";
    const last = alphabet[row % alphabet.length];
    return first + last;
  }

  for (let y = 0, row = 0, id = 1; y + tileH <= worldContext.graphHeight; y += tileH, row++) {
    const rowName = getRowLabel(row);
    for (let x = 0, cell = 1; x + tileW <= worldContext.graphWidth; x += tileW, cell++, id++) {
      status.innerHTML = `Rendering tile ${rowName}${cell} (${id} of ${tolesTotal})...`;
      ctx.drawImage(img, x, y, tileW, tileH, 0, 0, width, height);
      const tileBlob = await canvasToBlob(canvas, "image/png");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      zip.file(`${rowName}${cell}.png`, tileBlob);
    }
  }

  status.innerHTML = "Zipping files...";
  zip
    .generateAsync({ type: "blob" })
    .then((zipBlob: Blob) => {
      status.innerHTML = "Downloading the archive...";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${getFileName()}.zip`;
      link.click();
      link.remove();
      status.innerHTML = 'Done. Check .zip file in "Downloads" (CTRL + J)';
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    })
    .catch((error: Error) => {
      ERROR && console.error(error);
      status.innerHTML = "Tiles export failed";
      tip(`PNG tiles export failed: ${error?.message || "Unknown error"}`, true, "error", 5000);
    });
}

function loadImage(img: HTMLImageElement): Promise<void> {
  return new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = err => reject(err);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, qualityArgument = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob() error"));
      },
      mimeType,
      qualityArgument
    );
  });
}

// ─── SVG clone helpers ────────────────────────────────────────────────────────

interface GetMapURLOptions {
  debug?: boolean;
  noLabels?: boolean;
  noWater?: boolean;
  noScaleBar?: boolean;
  noIce?: boolean;
  noVignette?: boolean;
  fullMap?: boolean;
}

export async function getMapURL(type: string, options: GetMapURLOptions = {}): Promise<string> {
  const {
    debug = false,
    noLabels = false,
    noWater = false,
    noScaleBar = false,
    noIce = false,
    noVignette = false,
    fullMap = false
  } = options;

  const cloneEl = viewContext.svg.node()!.cloneNode(true) as SVGSVGElement;
  cloneEl.id = "fantasyMap";
  cloneEl.style.visibility = "visible";
  cloneEl.style.pointerEvents = "auto";
  // <foreignObject class="fmc"> elements wrap canvas layers; they cannot be
  // serialized to SVG and cause canvas taint when drawn via drawImage().
  // We convert their canvases to data URIs and replace them with <image> elements in the clone.
  const originalMap = document.getElementById("map");
  const originalForeignObjects = originalMap?.querySelectorAll("foreignObject.fmc");
  cloneEl.querySelectorAll("foreignObject.fmc").forEach((el, index) => {
    const originalCanvas = originalForeignObjects?.[index]?.querySelector("canvas");
    if (originalCanvas) {
      const dataUrl = originalCanvas.toDataURL("image/png");
      const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
      img.setAttribute("width", el.getAttribute("width") || "100%");
      img.setAttribute("height", el.getAttribute("height") || "100%");
      img.setAttribute("href", dataUrl);
      img.setAttribute("x", el.getAttribute("x") || "0");
      img.setAttribute("y", el.getAttribute("y") || "0");
      el.parentNode?.replaceChild(img, el);
    } else {
      el.remove();
    }
  });
  document.body.appendChild(cloneEl);
  const clone = d3.select(cloneEl) as d3.Selection<SVGSVGElement, unknown, null, undefined>;
  if (!debug) clone.select("#debug")?.remove();

  const cloneDefs = cloneEl.getElementsByTagName("defs")[0];
  const svgDefs = document.getElementById("defElements") as unknown as SVGSVGElement;

  const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
  if (isFirefox && type === "mesh") clone.select("#oceanPattern")?.remove();
  if (noLabels) {
    clone.select("#labels #states")?.remove();
    clone.select("#labels #burgLabels")?.remove();
    clone.select("#icons #burgIcons")?.remove();
  }
  if (noWater) {
    clone.select("#oceanBase").attr("opacity", 0);
    clone.select("#oceanPattern").attr("opacity", 0);
  }
  if (noIce) clone.select("#ice")?.remove();
  if (noVignette) clone.select("#vignette")?.remove();
  if (fullMap) {
    clone.attr("width", String(worldContext.graphWidth)).attr("height", String(worldContext.graphHeight));
    clone.select("#viewbox").attr("transform", null);

    if (!noScaleBar) {
      drawScaleBar(worldContext, viewContext, appServices, clone.select<SVGGElement>("#scaleBar"), 1);
      fitScaleBar(
        worldContext,
        viewContext,
        appServices,
        clone.select<SVGGElement>("#scaleBar"),
        worldContext.graphWidth,
        worldContext.graphHeight
      );
    }
  }
  if (noScaleBar) clone.select("#scaleBar")?.remove();

  if (type === "svg") removeUnusedElements(clone);
  if (viewContext.customization && type === "mesh") updateMeshCells(clone);
  inlineStyle(clone);

  // remove unused filters
  const filters = cloneEl.querySelectorAll("filter");
  for (let i = 0; i < filters.length; i++) {
    const id = filters[i].id;
    if (cloneEl.querySelector(`[filter='url(#${id})']`)) continue;
    if (cloneEl.getAttribute("filter") === `url(#${id})`) continue;
    filters[i].remove();
  }

  // remove unused patterns
  const patterns = cloneEl.querySelectorAll("pattern");
  for (let i = 0; i < patterns.length; i++) {
    const id = patterns[i].id;
    if (cloneEl.querySelector(`[fill='url(#${id})']`)) continue;
    patterns[i].remove();
  }

  // remove unused symbols
  const symbols = cloneEl.querySelectorAll("symbol");
  for (let i = 0; i < symbols.length; i++) {
    const id = symbols[i].id;
    if (cloneEl.querySelector(`use[*|href='#${id}']`)) continue;
    symbols[i].remove();
  }

  // add displayed emblems
  if (layerIsOn("toggleEmblems") && viewContext.emblems.selectAll("use").size()) {
    cloneEl
      .getElementById("emblems")
      ?.querySelectorAll("use")
      .forEach(el => {
        const href = el.getAttribute("href") || el.getAttribute("xlink:href");
        if (!href) return;
        const emblem = document.getElementById(href.slice(1));
        if (emblem) cloneDefs.append(emblem.cloneNode(true));
      });
  } else {
    cloneDefs.querySelector("#defs-emblems")?.remove();
  }

  {
    const image = cloneEl.getElementById("oceanicPattern");
    const href = image?.getAttribute("href");
    if (href) {
      await new Promise<void>(resolve => {
        getBase64(href, base64 => {
          image!.setAttribute("href", base64 as string);
          resolve();
        });
      });
    }
  }

  {
    const image = cloneEl.querySelector("#texture > image");
    const href = image?.getAttribute("href");
    if (href) {
      await new Promise<void>(resolve => {
        getBase64(href, base64 => {
          image!.setAttribute("href", base64 as string);
          resolve();
        });
      });
    }
  }

  if (cloneEl.getElementById("terrain")) {
    const uniqueElements = new Set<string>();
    const terrainNodes = cloneEl.getElementById("terrain")!.childNodes;
    for (let i = 0; i < terrainNodes.length; i++) {
      const node = terrainNodes[i] as Element;
      const href = node.getAttribute?.("href") || node.getAttribute?.("xlink:href");
      if (href) uniqueElements.add(href);
    }

    const defsRelief = svgDefs.getElementById("defs-relief");
    for (const terrainHref of [...uniqueElements]) {
      const element = defsRelief?.querySelector(terrainHref);
      if (element) cloneDefs.appendChild(element.cloneNode(true));
    }
  }

  if (cloneEl.getElementById("compass")) {
    const rose = svgDefs.getElementById("defs-compass-rose");
    if (rose) cloneDefs.appendChild(rose.cloneNode(true));
  }

  if (cloneEl.getElementById("burgIcons")) {
    const groups = cloneEl.getElementById("burgIcons")!.querySelectorAll("g");
    for (const group of Array.from(groups)) {
      const icon = svgDefs.querySelector((group as SVGGElement).dataset.icon ?? "");
      if (icon) cloneDefs.appendChild(icon.cloneNode(true));
    }
  }

  if (cloneEl.getElementById("anchors")) {
    const anchor = svgDefs.getElementById("icon-anchor");
    if (anchor) cloneDefs.appendChild(anchor.cloneNode(true));
  }

  if (cloneEl.getElementById("gridOverlay")?.hasChildNodes()) {
    const gridType = cloneEl.getElementById("gridOverlay")!.getAttribute("type");
    const pattern = svgDefs.getElementById(`pattern_${gridType}`);
    if (pattern) cloneDefs.appendChild(pattern.cloneNode(true));
  }

  {
    const externalMarkerImages = cloneEl.querySelectorAll<HTMLImageElement>('#markers image[href]:not([href=""])');
    const imageHrefs = Array.from(externalMarkerImages).map(img => img.getAttribute("href")!);

    for (const imgUrl of imageHrefs) {
      await new Promise<void>(resolve => {
        getBase64(imgUrl, base64 => {
          externalMarkerImages.forEach(img => {
            if (img.getAttribute("href") === imgUrl) img.setAttribute("href", base64 as string);
          });
          resolve();
        });
      });
    }
  }

  {
    const externalRegimentImages = cloneEl.querySelectorAll<HTMLImageElement>('#armies image[href]:not([href=""])');
    const imageHrefs = Array.from(externalRegimentImages).map(img => img.getAttribute("href")!);

    for (const imgUrl of imageHrefs) {
      await new Promise<void>(resolve => {
        getBase64(imgUrl, base64 => {
          externalRegimentImages.forEach(img => {
            if (img.getAttribute("href") === imgUrl) img.setAttribute("href", base64 as string);
          });
          resolve();
        });
      });
    }
  }

  if (!cloneEl.getElementById("fogging-cont")) cloneEl.getElementById("fog")?.remove();
  if (!cloneEl.getElementById("regions")) cloneEl.getElementById("statePaths")?.remove();
  if (!cloneEl.getElementById("labels")) cloneEl.getElementById("textPaths")?.remove();

  if (cloneEl.getElementById("armies")) {
    cloneEl.insertAdjacentHTML(
      "afterbegin",
      "<style>#armies text {stroke: none; fill: #fff; text-shadow: 0 0 4px #000; dominant-baseline: central; text-anchor: middle; font-family: Helvetica; fill-opacity: 1;}#armies text.regimentIcon {font-size: .8em;}</style>"
    );
  }

  if (type === "svg") {
    cloneEl.querySelectorAll("[href]").forEach(el => {
      const href = el.getAttribute("href")!;
      el.removeAttribute("href");
      el.setAttribute("xlink:href", href);
    });
  }

  // add hatchings
  const hatchingUsers = cloneEl.querySelectorAll<Element>(`[fill^='url(#hatch']`);
  const hatchingFills = unique(Array.from(hatchingUsers).map(el => el.getAttribute("fill")!));
  const hatchingIds = hatchingFills.map(fill => fill.slice(5, -1));
  for (const hatchingId of hatchingIds) {
    const hatching = svgDefs.getElementById(hatchingId);
    if (hatching) cloneDefs.appendChild(hatching.cloneNode(true));
  }

  // load fonts
  const usedFonts = getUsedFonts(cloneEl);
  const fontsToLoad = usedFonts.filter(font => font.src);
  if (fontsToLoad.length) {
    const dataURLfonts = await loadFontsAsDataURI(fontsToLoad);
    const fontFaces = dataURLfonts
      .map(({ family, src, unicodeRange = "", variant = "normal" }) => {
        return `@font-face {font-family: "${family}"; src: ${src}; unicode-range: ${unicodeRange}; font-variant: ${variant};}`;
      })
      .join("\n");

    const style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.innerHTML = fontFaces;
    cloneEl.querySelector("defs")!.appendChild(style);
  }

  clone.remove();

  const serialized = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>${new XMLSerializer().serializeToString(cloneEl)}`;
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = window.URL.createObjectURL(svgBlob);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 5000);
  return url;
}

// ─── SVG cleanup helpers ──────────────────────────────────────────────────────

export const getUsedFonts = (svg: SVGSVGElement) => {
  const usedFontFamilies = new Set();

  const labelGroups = svg.querySelectorAll("#labels g");
  for (const labelGroup of labelGroups) {
    const font = labelGroup.getAttribute("font-family");
    if (font) usedFontFamilies.add(font);
  }

  const provinceFont = viewContext.provs.attr("font-family");
  if (provinceFont) usedFontFamilies.add(provinceFont);

  const legend = svg.querySelector("#legend");
  const legendFont = legend?.getAttribute("font-family");
  if (legendFont) usedFontFamilies.add(legendFont);

  const usedFonts = fonts.filter(font => usedFontFamilies.has(font.family));
  return usedFonts;
};

export function removeUnusedElements(clone: AnySelection): void {
  if (!viewContext.terrain.selectAll("use").size()) clone.select("#defs-relief")?.remove();

  for (let empty = 1; empty; ) {
    empty = 0;
    clone.selectAll("g").each(function () {
      const self = this as HTMLElement;
      if (!self.hasChildNodes() || self.style?.display === "none" || self.classList.contains("hidden")) {
        empty++;
        self.remove();
      }
      if (self.hasAttribute("display") && self.style?.display === "inline") self.removeAttribute("display");
    });
  }
}

function updateMeshCells(clone: AnySelection): void {
  const data = renderOcean.checked
    ? worldContext.grid.cells.i
    : worldContext.grid.cells.i.filter((i: number) => worldContext.grid.cells.h[i] >= 20);
  const scheme = getColorScheme(viewContext.terrs.select("#landHeights").attr("scheme"));
  clone.select("#heights").attr("filter", "url(#blur1)");
  clone
    .select("#heights")
    .selectAll("polygon")
    .data(data)
    .join("polygon")
    .attr("points", (d: number) => getGridPolygon(d, worldContext.grid).join(" "))
    .attr("id", (d: number) => `cell${d}`)
    .attr("stroke", (d: number) => getColor(worldContext.grid.cells.h[d], scheme));
}

export function inlineStyle(clone: AnySelection): void {
  const emptyG = clone.append("g").node()!;
  const defaultStyles = window.getComputedStyle(emptyG);

  clone.selectAll<Element, unknown>("g, #ruler *, #scaleBar > text").each(function (this: Element) {
    const compStyle = window.getComputedStyle(this as HTMLElement);
    let style = "";

    for (let i = 0; i < compStyle.length; i++) {
      const key = compStyle[i];
      const value = compStyle.getPropertyValue(key);
      if (key === "cursor") continue;
      if ((this as Element).hasAttribute(key)) continue;
      if (value === defaultStyles.getPropertyValue(key)) continue;
      style += `${key}:${value};`;
    }

    for (const key in compStyle) {
      const value = compStyle.getPropertyValue(key);
      if (key === "cursor") continue;
      if ((this as Element).hasAttribute(key)) continue;
      if (value === defaultStyles.getPropertyValue(key)) continue;
      style += `${key}:${value};`;
    }

    if (style !== "") (this as Element).setAttribute("style", style);
  });

  emptyG.remove();
}

// ─── GeoJSON exports ──────────────────────────────────────────────────────────

export function saveGeoJsonCells(): void {
  const { cells, vertices } = worldContext.pack;

  const getPopulation = (i: number) => {
    const [r, u] = getCellPopulation(i);
    return rn(r + u);
  };

  const getHeight = (i: number) => parseInt(getFriendlyHeight([...cells.p[i]] as [number, number]), 10);

  function getCellCoordinates(cellVertices: number[]): [[number, number][]] {
    const coordinates = cellVertices.map(vertex => {
      const [x, y] = vertices.p[vertex];
      return getCoordinates(x, y, worldContext.mapCoordinates, worldContext.graphWidth, worldContext.graphHeight, 4);
    });
    return [[...coordinates, coordinates[0]]];
  }

  const json: GeoJSON = { type: "FeatureCollection", features: [] };

  cells.i.forEach((i: number) => {
    const coordinates = getCellCoordinates(cells.v[i]);
    const height = getHeight(i);
    const biome = cells.biome[i];
    const type = worldContext.pack.features[cells.f[i]].type;
    const population = getPopulation(i);
    const state = cells.state[i];
    const province = cells.province[i];
    const culture = cells.culture[i];
    const religion = cells.religion[i];
    const neighbors = cells.c[i];

    const properties = { id: i, height, biome, type, population, state, province, culture, religion, neighbors };
    const feature = { type: "Feature", geometry: { type: "Polygon", coordinates }, properties };
    json.features.push(feature);
  });

  const fileName = `${getFileName("Cells")}.geojson`;
  downloadFile(JSON.stringify(json), fileName, "application/json");
}

export function saveGeoJsonRoutes(): void {
  const features = worldContext.pack.routes.map(
    (r: { i: number; points: number[][]; group: string; name?: string }) => {
      const coordinates = r.points.map(([x, y]) =>
        getCoordinates(x, y, worldContext.mapCoordinates, worldContext.graphWidth, worldContext.graphHeight, 4)
      );
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: { id: r.i, group: r.group, name: r.name ?? null }
      };
    }
  );
  const json = { type: "FeatureCollection", features };
  downloadFile(JSON.stringify(json), `${getFileName("Routes")}.geojson`, "application/json");
}

export function saveGeoJsonRivers(): void {
  const features = worldContext.pack.rivers.flatMap(
    (r: {
      i: number;
      cells: number[];
      points?: [number, number][];
      source: number;
      mouth: number;
      parent: number;
      basin: number;
      widthFactor: number;
      sourceWidth: number;
      discharge: number;
      name: string;
      type: string;
    }) => {
      if (!r.cells || r.cells.length < 2) return [];
      const meanderedPoints = Rivers.addMeandering(r.cells, r.points ?? null);
      const coordinates = meanderedPoints.map(([x, y]) =>
        getCoordinates(x, y, worldContext.mapCoordinates, worldContext.graphWidth, worldContext.graphHeight, 4)
      );
      return [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {
            id: r.i,
            source: r.source,
            mouth: r.mouth,
            parent: r.parent,
            basin: r.basin,
            widthFactor: r.widthFactor,
            sourceWidth: r.sourceWidth,
            discharge: r.discharge,
            name: r.name,
            type: r.type
          }
        }
      ];
    }
  );
  downloadFile(
    JSON.stringify({ type: "FeatureCollection", features }),
    `${getFileName("Rivers")}.geojson`,
    "application/json"
  );
}

export function saveGeoJsonMarkers(): void {
  const features = worldContext.pack.markers.map(
    (marker: {
      i: number;
      type: string;
      icon: string;
      x?: number;
      y?: number;
      size?: number;
      fill?: string;
      stroke?: string;
    }) => {
      const { i, type, icon, x = 0, y = 0, size, fill, stroke } = marker;
      const coordinates = getCoordinates(
        x,
        y,
        worldContext.mapCoordinates,
        worldContext.graphWidth,
        worldContext.graphHeight,
        4
      );
      const note = worldContext.notes.find(n => n.id === `marker${i}`);
      const properties = { id: i, type, icon, x, y, ...note, size, fill, stroke };
      return { type: "Feature", geometry: { type: "Point", coordinates }, properties };
    }
  );
  downloadFile(
    JSON.stringify({ type: "FeatureCollection", features }),
    `${getFileName("Markers")}.geojson`,
    "application/json"
  );
}

export function buildGeoJsonZones(): object {
  const { zones, cells, vertices } = worldContext.pack;
  const json: GeoJSON = { type: "FeatureCollection", features: [] };

  function getZonePolygonCoordinates(zoneCells: number[]): [number, number][][] {
    const cellsInZone = new Set(zoneCells);
    const ofSameType = (cellId: number) => cellsInZone.has(cellId);
    const ofDifferentType = (cellId: number) => !cellsInZone.has(cellId);

    const checkedCells = new Set<number>();
    const rings: [number, number][][] = [];

    for (const cellId of zoneCells) {
      if (checkedCells.has(cellId)) continue;

      const neighbors = cells.c[cellId] as number[];
      const onBorder = neighbors.some(ofDifferentType);
      if (!onBorder) continue;

      const feature = worldContext.pack.features[cells.f[cellId]];
      if (feature.type === "lake" && feature.shoreline) {
        if ((feature.shoreline as number[]).every(ofSameType)) continue;
      }

      const cellVertices = cells.v[cellId] as number[];
      let startingVertex: number | null = null;

      for (const vertexId of cellVertices) {
        const vertexCells = vertices.c[vertexId] as number[];
        if (vertexCells.some(ofDifferentType)) {
          startingVertex = vertexId;
          break;
        }
      }

      if (startingVertex === null) continue;

      const vertexChain = connectVertices({
        vertices,
        startingVertex,
        ofSameType,
        addToChecked: (cId: number) => checkedCells.add(cId),
        closeRing: false
      }) as number[];

      if (vertexChain.length < 3) continue;

      const coordinates: [number, number][] = [];
      for (const vertexId of vertexChain) {
        const [x, y] = vertices.p[vertexId] as [number, number];
        coordinates.push(
          getCoordinates(x, y, worldContext.mapCoordinates, worldContext.graphWidth, worldContext.graphHeight, 4)
        );
      }
      if (coordinates.length > 0) coordinates.push(coordinates[0]);
      if (coordinates.length >= 4) rings.push(coordinates);
    }

    return rings;
  }

  (zones as Array<{ i: number; hidden?: boolean; cells: number[]; name: string; type: string; color: string }>).forEach(
    zone => {
      if (zone.hidden || !zone.cells || zone.cells.length === 0) return;

      const rings = getZonePolygonCoordinates(zone.cells);
      if (rings.length === 0) return;

      const properties = { id: zone.i, name: zone.name, type: zone.type, color: zone.color, cells: zone.cells };

      if (rings.length === 1) {
        json.features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: rings }, properties });
      } else {
        const multiPolygonCoordinates = rings.map(ring => [ring]);
        json.features.push({
          type: "Feature",
          geometry: { type: "MultiPolygon", coordinates: multiPolygonCoordinates },
          properties
        });
      }
    }
  );

  return json;
}

export function saveGeoJsonZones(): void {
  const json = buildGeoJsonZones();
  downloadFile(JSON.stringify(json), `${getFileName("Zones")}.geojson`, "application/json");
}

interface GeoJSON {
  type: "FeatureCollection";
  features: unknown[];
}
