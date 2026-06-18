import type { AppServices } from "../context/appServices";
import type { SettlementLayers, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../modules/burgs-generator";
import { TIME } from "../utils/debug";

import type { IRenderer } from "./core/IRenderer";

interface BurgGroup {
  name: string;
  order: number;
}

export const BurgIconsRenderer: IRenderer = {
  id: "burgIcons",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("drawBurgIcons");
    const { pack, options, style } = worldContext;
    const { burgIcons, anchors } = viewContext;
    createIconGroups(options, style, burgIcons, anchors);

    const scale = viewContext.scale || 1;
    const viewX = viewContext.viewX || 0;
    const viewY = viewContext.viewY || 0;
    const svgWidth = worldContext.svgWidth || window.innerWidth;
    const svgHeight = worldContext.svgHeight || window.innerHeight;

    const minX = -viewX / scale;
    const maxX = (svgWidth - viewX) / scale;
    const minY = -viewY / scale;
    const maxY = (svgHeight - viewY) / scale;
    const margin = 50 / scale;

    const isVisible = (x: number, y: number) => {
      return x >= minX - margin && x <= maxX + margin && y >= minY - margin && y <= maxY + margin;
    };

    const maxOrder = Math.max(...(options.burgs.groups as BurgGroup[]).map(g => g.order), 1);
    for (const { name, order } of options.burgs.groups as BurgGroup[]) {
      const invertedOrder = maxOrder - order + 1;
      const threshold = invertedOrder === 1 ? 0 : invertedOrder * 2 - 1.5;
      if (scale < threshold) continue;

      const burgsInGroup = pack.burgs.filter(b => b.group === name && !b.removed);
      if (!burgsInGroup.length) continue;

      const visibleBurgs = burgsInGroup.filter(b => isVisible(b.x, b.y));

      const iconsGroup = burgIcons.select<SVGGElement>(`g#${name}`);
      if (!iconsGroup.empty()) {
        const icon = iconsGroup.attr("data-icon") || "#icon-circle";
        iconsGroup
          .selectAll<SVGUseElement, Burg>("use")
          .data(visibleBurgs, d => d.i ?? 0)
          .join("use")
          .attr("id", d => `burg${d.i}`)
          .attr("data-id", d => d.i!)
          .attr("href", icon)
          .attr("x", d => d.x)
          .attr("y", d => d.y);
      }

      const portsInGroup = burgsInGroup.filter(b => b.port && isVisible(b.x, b.y));
      if (!portsInGroup.length) continue;

      const portGroup = anchors.select<SVGGElement>(`g#${name}`);
      if (!portGroup.empty()) {
        portGroup
          .selectAll<SVGUseElement, Burg>("use")
          .data(portsInGroup, d => d.i ?? 0)
          .join("use")
          .attr("id", d => `anchor${d.i}`)
          .attr("data-id", d => d.i!)
          .attr("href", "#icon-anchor")
          .attr("x", d => d.x)
          .attr("y", d => d.y);
      }
    }

    TIME && console.timeEnd("drawBurgIcons");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.burgIcons.selectAll("*").remove();
    viewContext.anchors.selectAll("*").remove();
  }
};

export const drawBurgIcon = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  burg: Burg
): void => {
  const { burgIcons, anchors } = viewContext;
  const iconGroup = burgIcons.select<SVGGElement>(`#${burg.group}`);
  if (iconGroup.empty()) {
    BurgIconsRenderer.render(worldContext, viewContext, appServices);
    return;
  }

  removeBurgIcon(worldContext, viewContext, appServices, burg.i!);
  const icon = iconGroup.attr("data-icon") || "#icon-circle";
  burgIcons
    .select(`#${burg.group}`)
    .append("use")
    .attr("href", icon)
    .attr("id", `burg${burg.i}`)
    .attr("data-id", burg.i!)
    .attr("x", burg.x)
    .attr("y", burg.y);

  if (burg.port) {
    anchors
      .select(`#${burg.group}`)
      .append("use")
      .attr("href", "#icon-anchor")
      .attr("id", `anchor${burg.i}`)
      .attr("data-id", burg.i!)
      .attr("x", burg.x)
      .attr("y", burg.y);
  }
};

export const removeBurgIcon = (
  _worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  burgId: number
): void => {
  const existingIcon = document.getElementById(`burg${burgId}`);
  if (existingIcon) existingIcon.remove();

  const existingAnchor = document.getElementById(`anchor${burgId}`);
  if (existingAnchor) existingAnchor.remove();
};

function createIconGroups(
  _options: WorldContext["options"],
  style: WorldContext["style"],
  _burgIcons: SettlementLayers["burgIcons"],
  _anchors: SettlementLayers["anchors"]
): void {
  const existingIconIds = new Set<string>();
  document.querySelectorAll("g#burgIcons > g").forEach(group => {
    existingIconIds.add(group.id);
    style.burgIcons[group.id] = Array.from(group.attributes).reduce((acc: { [key: string]: string }, attribute) => {
      if (attribute.name === "class") return acc;
      acc[attribute.name] = attribute.value;
      return acc;
    }, {});
  });

  const existingAnchorIds = new Set<string>();
  document.querySelectorAll("g#anchors > g").forEach(group => {
    existingAnchorIds.add(group.id);
    style.anchors[group.id] = Array.from(group.attributes).reduce((acc: { [key: string]: string }, attribute) => {
      if (attribute.name === "class") return acc;
      acc[attribute.name] = attribute.value;
      return acc;
    }, {});
  });

  const defaultIconStyle = style.burgIcons.town || Object.values(style.burgIcons)[0] || {};
  const defaultAnchorStyle = style.anchors.town || Object.values(style.anchors)[0] || {};
  const sortedGroups = [...(_options.burgs.groups as BurgGroup[])].sort((a, b) => a.order - b.order);
  for (const { name } of sortedGroups) {
    if (!existingIconIds.has(name)) {
      const burgGroup = _burgIcons.append("g");
      const iconStyles = style.burgIcons[name] || defaultIconStyle;
      Object.entries(iconStyles).forEach(([key, value]) => {
        burgGroup.attr(key, value);
      });
      burgGroup.attr("id", name);
    }

    if (!existingAnchorIds.has(name)) {
      const anchorGroup = _anchors.append("g");
      const anchorStyles = style.anchors[name] || defaultAnchorStyle;
      Object.entries(anchorStyles).forEach(([key, value]) => {
        anchorGroup.attr(key, value);
      });
      anchorGroup.attr("id", name);
    }
  }
}
