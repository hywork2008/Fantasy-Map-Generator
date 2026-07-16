import type { AppServices } from "../context/appServices";
import type { SettlementLayers, ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg, BurgGroup } from "../types/models";
import { TIME } from "../utils/debug";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

export const BurgIconsRenderer: IRenderer = {
  id: "burgIcons",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("drawBurgIcons");
    const { pack, options, style } = worldContext;
    const { burgIcons, anchors, focusScope } = viewContext;
    createIconGroups(options, style, burgIcons, anchors);

    for (const { name } of options.burgs.groups as BurgGroup[]) {
      const burgsInGroup = pack.burgs.filter(b => b.group === name && !b.removed && isCellInScope(focusScope, b.cell));
      if (!burgsInGroup.length) continue;

      const iconsGroup = burgIcons.select<SVGGElement>(`g#${name}`);
      if (!iconsGroup.empty()) {
        const icon = iconsGroup.attr("data-icon") || "#icon-circle";
        iconsGroup
          .selectAll<SVGUseElement, Burg>("use")
          .data(burgsInGroup, d => d?.i ?? 0)
          .join("use")
          .attr("id", d => `burg${d.i}`)
          .attr("data-id", d => d.i!)
          .attr("href", icon)
          .attr("x", d => d.x)
          .attr("y", d => d.y);
      }

      const portsInGroup = burgsInGroup.filter(b => b.port);
      if (!portsInGroup.length) continue;

      const portGroup = anchors.select<SVGGElement>(`g#${name}`);
      if (!portGroup.empty()) {
        portGroup
          .selectAll<SVGUseElement, Burg>("use")
          .data(portsInGroup, d => d?.i ?? 0)
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
      burgGroup.classed("hidden", true);
    }

    if (!existingAnchorIds.has(name)) {
      const anchorGroup = _anchors.append("g");
      const anchorStyles = style.anchors[name] || defaultAnchorStyle;
      Object.entries(anchorStyles).forEach(([key, value]) => {
        anchorGroup.attr(key, value);
      });
      anchorGroup.attr("id", name);
      anchorGroup.classed("hidden", true);
    }
  }
}
