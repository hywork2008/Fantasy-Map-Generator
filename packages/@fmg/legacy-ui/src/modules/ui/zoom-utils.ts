// @ts-nocheck
type ZoomToDeps = {
  d3: any;
  svg: any;
  zoom: any;
  svgWidth: number;
  svgHeight: number;
};

type InvokeZoomDeps = {
  coastline: any;
  scale: number;
  labels: any;
  emblems: any;
  statesHalo: any;
  customization: number;
  markers: any;
  pack: any;
  ruler: any;
  shapeRendering: any;
  rn: (value: number, digits?: number) => number;
  rescaleLabels: any;
  hideLabels: any;
  hideEmblems: any;
  renderGroupCOAs: (group: any) => void;
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
      if (rescaleLabels.checked) this.setAttribute("font-size", relative);

      const hidden = hideLabels.checked && (relative * scale < 6 || relative * scale > 60);
      if (hidden) this.classList.add("hidden");
      else this.classList.remove("hidden");
    });
  }

  if (emblems.style("display") !== "none") {
    emblems.selectAll("g").each(function () {
      const size = this.getAttribute("font-size") * scale;
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
    pack.markers?.forEach((marker: any) => {
      const { i, x, y, size = 30, hidden } = marker;
      const el = !hidden && document.getElementById(`marker${i}`);
      if (!el) return;

      const zoomedSize = Math.max(rn(size / 5 + 24 / scale, 2), 1);
      el.setAttribute("width", zoomedSize);
      el.setAttribute("height", zoomedSize);
      el.setAttribute("x", rn(x - zoomedSize / 2, 1));
      el.setAttribute("y", rn(y - zoomedSize, 1));
    });

  if (ruler.style("display") !== "none") {
    const size = rn((10 / scale ** 0.3) * 2, 2);
    ruler.selectAll("text").attr("font-size", size);
  }
}
