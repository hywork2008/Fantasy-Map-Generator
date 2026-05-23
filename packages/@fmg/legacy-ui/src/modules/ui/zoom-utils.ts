type TransitionCallTarget = { transform: unknown };

type SelectionLike = {
  attr(name: string): string;
  attr(name: string, value: string | number | null): SelectionLike;
  style(name: string): string;
  style(name: string, value: string): SelectionLike;
  select(selector: string): SelectionLike;
  selectAll(selector: string): SelectionLike;
  each(callback: (this: SVGGElement) => void): void;
  size(): number;
};

type D3Like = {
  zoomIdentity: {
    translate: (x: number, y: number) => { scale: (value: number) => unknown };
  };
};

type SvgTransitionLike = {
  duration: (value: number) => { call: (fn: unknown, transform: unknown) => void };
};

type SvgLike = {
  transition: () => SvgTransitionLike;
};

type Marker = {
  i: number;
  x: number;
  y: number;
  size?: number;
  hidden?: boolean;
};

export type ZoomToDeps = {
  d3: D3Like;
  svg: SvgLike;
  zoom: TransitionCallTarget;
  svgWidth: number;
  svgHeight: number;
};

export type ResetZoomDeps = Pick<ZoomToDeps, "d3" | "svg" | "zoom">;

export type InvokeZoomDeps = {
  coastline: SelectionLike;
  scale: number;
  labels: SelectionLike;
  emblems: SelectionLike;
  statesHalo: SelectionLike;
  customization: number;
  markers: SelectionLike;
  pack: { markers?: Marker[] };
  ruler: SelectionLike;
  shapeRendering: { value: string };
  rn: (value: number, digits?: number) => number;
  rescaleLabels: { checked: boolean };
  hideLabels: { checked: boolean };
  hideEmblems: { checked: boolean };
  renderGroupCOAs: (group: Element) => void;
};

export function zoomToPoint({ d3, svg, zoom, svgWidth, svgHeight }: ZoomToDeps, x: number, y: number, z = 8, d = 2000) {
  const transform = d3.zoomIdentity.translate(x * -z + svgWidth / 2, y * -z + svgHeight / 2).scale(z);
  svg.transition().duration(d).call(zoom.transform, transform);
}

export function resetZoomToInitial({ d3, svg, zoom }: Pick<ZoomToDeps, "d3" | "svg" | "zoom">, d = 1000) {
  svg.transition().duration(d).call(zoom.transform, d3.zoomIdentity);
}

export function invokeActiveZoomingView({
  coastline,
  scale,
  labels,
  emblems,
  statesHalo,
  customization,
  markers,
  pack,
  ruler,
  shapeRendering,
  rn,
  rescaleLabels,
  hideLabels,
  hideEmblems,
  renderGroupCOAs
}: InvokeZoomDeps) {
  const isOptimized = shapeRendering.value === "optimizeSpeed";

  if (coastline.select("#sea_island").size() && +coastline.select("#sea_island").attr("auto-filter")) {
    const filter = scale > 1.5 && scale <= 2.6 ? null : scale > 2.6 ? "url(#blurFilter)" : "url(#dropShadow)";
    coastline.select("#sea_island").attr("filter", filter);
  }

  if (labels.style("display") !== "none") {
    labels.selectAll("g").each(function () {
      if (this.id === "burgLabels") return;
      const desired = +this.dataset.size;
      const relative = Math.max(rn((desired + desired / scale) / 2, 2), 1);
      if (rescaleLabels.checked) this.setAttribute("font-size", String(relative));

      const hidden = hideLabels.checked && (relative * scale < 6 || relative * scale > 60);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
    });
  }

  if (emblems.style("display") !== "none") {
    emblems.selectAll("g").each(function () {
      const fontSize = Number(this.getAttribute("font-size") || 0);
      const size = fontSize * scale;
      const hidden = hideEmblems.checked && (size < 25 || size > 300);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
      if (!hidden && window.COArenderer && this.children.length && !this.children[0].getAttribute("href")) {
        renderGroupCOAs(this);
      }
    });
  }

  if (!customization && !isOptimized) {
    const desired = +statesHalo.attr("data-width");
    const haloSize = rn(desired / scale ** 0.8, 2);
    statesHalo.attr("stroke-width", haloSize).style("display", haloSize > 0.1 ? "block" : "none");
  }

  +markers.attr("rescale") &&
    pack.markers?.forEach((marker: Marker) => {
      const { i, x, y, size = 30, hidden } = marker;
      const el = !hidden && document.getElementById(`marker${i}`);
      if (!el) return;

      const zoomedSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);
      el.setAttribute("width", String(zoomedSize));
      el.setAttribute("height", String(zoomedSize));
      el.setAttribute("x", String(rn(x - zoomedSize / 2, 1)));
      el.setAttribute("y", String(rn(y - zoomedSize, 1)));
    });

  if (ruler.style("display") !== "none") {
    const size = rn((10 / scale ** 0.3) * 2, 2);
    ruler.selectAll("text").attr("font-size", size);
  }
}
