"use strict";

const minimapRuntime = globalThis as any;

const getEl = <T extends Element>(id: string) => minimapRuntime.ensureEl(id) as T;

let minimapInitialized = false;

export function openMinimapDialog() {
  minimapRuntime.closeDialogs("#minimap, .stable");
  ensureMinimapStyles();
  ensureMinimapMarkup();

  updateMinimap();

  minimapRuntime.$("#minimap").dialog({
    title: "Minimap",
    resizable: false,
    width: "auto",
    position: {my: "left bottom", at: "left+10 bottom-25", of: "svg", collision: "fit"},
    open: function () {
      minimapRuntime.$(this).parent().addClass("minimap-dialog");
    },
    close: function () {
      minimapRuntime.$(this).dialog("destroy");
    }
  });
}

function ensureMinimapStyles() {
  if (document.getElementById("minimapStyles")) return;

  const style = document.createElement("style");
  style.id = "minimapStyles";
  style.textContent = /* css */ `
    .minimap-dialog .ui-dialog-content {
      padding: 0 !important;
      overflow: hidden;
    }

    #minimap {
      padding: 0 !important;
      background: transparent;
    }

    #minimapViewportWrap {
      position: relative;
      width: 20em;
      border: 0;
    }

    #minimapSurface {
      display: block;
      width: 100%;
      height: auto;
      cursor: crosshair;
    }

    #minimapMapUse {
      pointer-events: none;
    }

    #minimapViewport {
      fill: rgba(190, 255, 137, 0.1);
      stroke: #624954;
      stroke-width: 1;
      stroke-dasharray: 4;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `;

  document.head.append(style);
}

function ensureMinimapMarkup() {
  if (minimapInitialized) return;

  const container = getEl<HTMLElement>("minimapContent");
  if (!container) return;

  minimapInitialized = true;
  container.innerHTML = /* html */ `
    <div id="minimapViewportWrap">
      <svg id="minimapSurface" preserveAspectRatio="xMidYMid meet" aria-label="Map minimap">
        <use id="minimapMapUse" href="#viewbox"></use>
        <rect id="minimapViewport"></rect>
      </svg>
    </div>
  `;

  getEl<SVGSVGElement>("minimapSurface").addEventListener("click", minimapClickToPan);
  minimapRuntime.updateMinimap = updateMinimap;
}

function minimapClickToPan(event: MouseEvent) {
  const minimap = getEl<SVGSVGElement>("minimapSurface");
  if (!minimap) return;

  const point = minimap.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  const ctm = minimap.getScreenCTM();
  if (!ctm) return;

  const svgPoint = point.matrixTransform(ctm.inverse());
  const x = minimapRuntime.minmax(svgPoint.x, 0, minimapRuntime.graphWidth);
  const y = minimapRuntime.minmax(svgPoint.y, 0, minimapRuntime.graphHeight);
  minimapRuntime.zoomTo(x, y, minimapRuntime.scale, 450);
}

function updateMinimap() {
  const minimap = getEl<SVGSVGElement>("minimapSurface");
  const viewport = getEl<SVGRectElement>("minimapViewport");
  const mapUse = getEl<SVGUseElement>("minimapMapUse");
  if (!minimap || !viewport || !mapUse) return;

  minimap.setAttribute("viewBox", `0 0 ${minimapRuntime.graphWidth} ${minimapRuntime.graphHeight}`);

  const inverseScale = minimapRuntime.scale ? 1 / minimapRuntime.scale : 1;
  mapUse.setAttribute(
    "transform",
    `translate(${minimapRuntime.rn(-minimapRuntime.viewX * inverseScale, 3)} ${minimapRuntime.rn(
      -minimapRuntime.viewY * inverseScale,
      3
    )}) scale(${minimapRuntime.rn(inverseScale, 6)})`
  );

  const left = Math.max(0, -minimapRuntime.viewX * inverseScale);
  const top = Math.max(0, -minimapRuntime.viewY * inverseScale);
  const right = Math.min(minimapRuntime.graphWidth, left + minimapRuntime.svgWidth * inverseScale);
  const bottom = Math.min(minimapRuntime.graphHeight, top + minimapRuntime.svgHeight * inverseScale);

  viewport.setAttribute("x", String(minimapRuntime.rn(left, 3)));
  viewport.setAttribute("y", String(minimapRuntime.rn(top, 3)));
  viewport.setAttribute("width", String(minimapRuntime.rn(Math.max(0, right - left), 3)));
  viewport.setAttribute("height", String(minimapRuntime.rn(Math.max(0, bottom - top), 3)));
}
