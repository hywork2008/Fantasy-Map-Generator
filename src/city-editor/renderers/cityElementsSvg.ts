import { editorText } from "../../i18n/editorMessages";
import { templeFootprintMeters } from "../generators/housing";
import { accessCorridor, transformLandmarkPolygons } from "../generators/landmarks";
import { townExtentMeters } from "../generators/settlementExtent";
import type { Id } from "../types/document";
import type { SvgPickInfo } from "../types/selection";
import { shipHasHarborLand } from "./harborPierFacts";
import { cityElementMarker, elementHasDuplicateWardLandmark, renderNormalizedLandmarkSvg, tree } from "./landmarkSvg";
import type { RenderContext } from "./renderContext";
import { renderShipRotationHandle, renderShipSvg } from "./shipSvg";
import { element, polygon } from "./svgPrimitives";
import { renderTempleSvg } from "./templeSvg";

/** City element markers (wells, temples, ships, etc.) and historic landmarks. */
export function renderCityElements(ctx: RenderContext, svg: SVGSVGElement, castleFaces: Set<Id>): void {
  const { document, tool, selection, town } = ctx;
  const elements = element("g", { class: "ce-elements" });
  for (const cityElement of document.elements) {
    // Cell landmarks are determined by Ward. Keep only point decorations from
    // imported data here so the document has one source of truth per cell.
    if (!cityElement.point) continue;
    const p = cityElement.point;
    const isPickSelected = selection.inspectedId === cityElement.id;
    const pickInfo: SvgPickInfo = {
      layer: "elements",
      kind: cityElement.kind,
      id: cityElement.id,
      label: editorText("cityEditor.messages.element", { value0: cityElement.kind, value1: cityElement.id }),
      point: p,
      sizeMeters: cityElement.sizeMeters ?? 8
    };
    if (cityElement.kind === "ship") {
      if (!shipHasHarborLand(document, cityElement)) continue;
      const shipNode = renderShipSvg({
        type: cityElement.shipType ?? "small",
        point: p,
        sizeMeters: cityElement.sizeMeters,
        rotation: cityElement.rotation,
        id: cityElement.id,
        className: isPickSelected ? "ce-is-selected cg-is-selected" : ""
      });
      shipNode.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
      if (tool === "select") {
        shipNode.style.pointerEvents = "all";
        shipNode.style.cursor = "move";
      }
      elements.appendChild(shipNode);

      if (tool === "select" && isPickSelected) {
        const handleNode = renderShipRotationHandle({
          id: cityElement.id,
          point: p,
          sizeMeters: cityElement.sizeMeters,
          rotation: cityElement.rotation
        });
        elements.appendChild(handleNode);
      }
      continue;
    }
    if (cityElement.kind === "tree") {
      const treeNode = tree(p, cityElement.sizeMeters ?? 8, cityElement.id);
      treeNode.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
      if (isPickSelected) treeNode.classList.add("ce-is-selected", "cg-is-selected");
      if (tool === "select") {
        treeNode.style.pointerEvents = "all";
        treeNode.style.cursor = "pointer";
      }
      elements.appendChild(treeNode);
      continue;
    }
    if (town && (cityElement.id.startsWith("gc:") || cityElement.kind === "temple" || cityElement.kind === "plaza")) {
      if (cityElement.kind === "plaza") {
        const plazaWell = element("g", {
          transform: `translate(${p[0]} ${-p[1]})`,
          class: `ce-plaza-well${isPickSelected ? " ce-is-selected cg-is-selected" : ""}`,
          "data-element": cityElement.id,
          "data-pick": encodeURIComponent(JSON.stringify(pickInfo)),
          "pointer-events": tool === "select" ? "all" : "none"
        });
        plazaWell.appendChild(
          element("circle", {
            cx: "0",
            cy: "0",
            r: "2.5",
            fill: "#d0c8b7",
            stroke: "#49483f",
            "stroke-width": "0.4"
          })
        );
        plazaWell.appendChild(
          element("circle", {
            cx: "0",
            cy: "0",
            r: "1.65",
            fill: "#719ca8",
            stroke: "#49483f",
            "stroke-width": "0.2"
          })
        );
        plazaWell.appendChild(
          element("path", {
            d: "M -2.5 0 L 2.5 0",
            fill: "none",
            stroke: "#74583d",
            "stroke-width": "0.55"
          })
        );
        if (tool === "select") plazaWell.style.cursor = "pointer";
        elements.appendChild(plazaWell);
      }
      if (cityElement.kind === "temple") {
        const footprint = templeFootprintMeters(townExtentMeters(document.frame));
        const length = cityElement.sizeMeters && cityElement.sizeMeters > 0 ? cityElement.sizeMeters : footprint.length;
        const width = length * (footprint.width / footprint.length);
        const templeNode = renderTempleSvg({
          point: p,
          length,
          width,
          rotation: cityElement.rotation,
          id: cityElement.id,
          className: isPickSelected ? "ce-is-selected cg-is-selected" : "",
          isPickSelected,
          templeType: cityElement.templeType
        });
        templeNode.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
        templeNode.setAttribute("pointer-events", tool === "select" ? "all" : "none");
        if (tool === "select") templeNode.style.cursor = "pointer";
        elements.appendChild(templeNode);
      }
      continue;
    }
    if (!town && elementHasDuplicateWardLandmark(document, castleFaces, cityElement)) {
      continue;
    }
    const elemMarker = cityElementMarker(p, cityElement.kind, cityElement.id);
    elemMarker.setAttribute("data-pick", encodeURIComponent(JSON.stringify(pickInfo)));
    if (isPickSelected) elemMarker.classList.add("ce-is-selected", "cg-is-selected");
    if (tool === "select") {
      elemMarker.style.pointerEvents = "all";
      elemMarker.style.cursor = "pointer";
    }
    elements.appendChild(elemMarker);
  }
  svg.appendChild(elements);
  if (document.landmarks?.length) {
    const landmarks = element("g", {
      class: "ce-historic-landmarks",
      "pointer-events": tool === "select" ? "all" : "none"
    });
    for (const instance of document.landmarks) {
      const asset = document.landmarkAssets?.find(
        a => a.id === instance.assetId && a.revision === instance.assetRevision
      );
      const pick = encodeURIComponent(
        JSON.stringify({
          layer: "landmarks",
          kind: "landmark",
          id: instance.id,
          label: asset?.name ?? editorText("cityEditor.messages.missingLandmarkAsset", { value0: instance.assetId }),
          assetId: instance.assetId,
          rotation: instance.rotation,
          scale: instance.scale
        })
      );
      const marker = element("g", { "data-pick": pick, "data-landmark": instance.id });
      if (selection.inspectedId === instance.id) marker.classList.add("ce-is-selected");
      for (const access of instance.accesses) {
        for (const part of accessCorridor(access.points, access.widthMeters)) {
          marker.appendChild(
            element("path", {
              d: polygon(part.outer),
              fill: "#b2a78e",
              stroke: "#675f50",
              "stroke-width": "0.6"
            })
          );
        }
      }
      for (const part of instance.site) {
        marker.appendChild(
          element("path", {
            d: [polygon(part.outer), ...part.holes.map(polygon)].join(" "),
            "fill-rule": "evenodd",
            fill: "#c5b99d",
            stroke: "#746a5c",
            "stroke-width": "0.8"
          })
        );
      }
      for (const part of asset ? transformLandmarkPolygons(asset.footprint, instance) : []) {
        marker.appendChild(
          element("path", {
            d: [polygon(part.outer), ...part.holes.map(polygon)].join(" "),
            "fill-rule": "evenodd",
            fill: "#968a76",
            stroke: "#39372f",
            "stroke-width": "1.2"
          })
        );
      }
      if (asset) {
        const art = renderNormalizedLandmarkSvg(asset.renderSvg);
        const c = Math.cos(instance.rotation) * instance.scale;
        const s = Math.sin(instance.rotation) * instance.scale;
        art.setAttribute(
          "transform",
          `matrix(${c} ${-s} ${-s} ${-c} ${instance.position[0]} ${-instance.position[1]})`
        );
        marker.appendChild(art);
      }
      landmarks.appendChild(marker);
    }
    svg.appendChild(landmarks);
  }
}
