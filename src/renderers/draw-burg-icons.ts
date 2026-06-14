import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../modules/burgs-generator";
import { TIME } from "../utils/debug";

interface BurgGroup {
  name: string;
  order: number;
}

export const drawBurgIcons = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  _appServices: AppServices
): void => {
  TIME && console.time("drawBurgIcons");
  const { pack, options, style } = worldContext;
  const { burgIcons, anchors } = viewContext;
  createIconGroups(options, style, burgIcons, anchors);

  for (const { name } of options.burgs.groups as BurgGroup[]) {
    const burgsInGroup = pack.burgs.filter(b => b.group === name && !b.removed);
    if (!burgsInGroup.length) continue;

    const iconsGroup = document.querySelector<SVGGElement>(`#burgIcons > g#${name}`);
    if (!iconsGroup) continue;

    const icon = iconsGroup.dataset.icon || "#icon-circle";
    iconsGroup.innerHTML = burgsInGroup
      .map(b => `<use id="burg${b.i}" data-id="${b.i}" href="${icon}" x="${b.x}" y="${b.y}"></use>`)
      .join("");

    const portsInGroup = burgsInGroup.filter(b => b.port);
    if (!portsInGroup.length) continue;

    const portGroup = document.querySelector<SVGGElement>(`#anchors > g#${name}`);
    if (!portGroup) continue;

    portGroup.innerHTML = portsInGroup
      .map(b => `<use id="anchor${b.i}" data-id="${b.i}" href="#icon-anchor" x="${b.x}" y="${b.y}"></use>`)
      .join("");
  }

  TIME && console.timeEnd("drawBurgIcons");
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
    drawBurgIcons(worldContext, viewContext, appServices);
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
  _burgIcons: ViewContext["burgIcons"],
  _anchors: ViewContext["anchors"]
): void {
  document.querySelectorAll("g#burgIcons > g").forEach(group => {
    style.burgIcons[group.id] = Array.from(group.attributes).reduce((acc: { [key: string]: string }, attribute) => {
      acc[attribute.name] = attribute.value;
      return acc;
    }, {});
    group.remove();
  });

  document.querySelectorAll("g#anchors > g").forEach(group => {
    style.anchors[group.id] = Array.from(group.attributes).reduce((acc: { [key: string]: string }, attribute) => {
      acc[attribute.name] = attribute.value;
      return acc;
    }, {});
    group.remove();
  });

  const defaultIconStyle = style.burgIcons.town || Object.values(style.burgIcons)[0] || {};
  const defaultAnchorStyle = style.anchors.town || Object.values(style.anchors)[0] || {};
  const sortedGroups = [...(_options.burgs.groups as BurgGroup[])].sort((a, b) => a.order - b.order);
  for (const { name } of sortedGroups) {
    const burgGroup = _burgIcons.append("g");
    const iconStyles = style.burgIcons[name] || defaultIconStyle;
    Object.entries(iconStyles).forEach(([key, value]) => {
      burgGroup.attr(key, value);
    });
    burgGroup.attr("id", name);

    const anchorGroup = _anchors.append("g");
    const anchorStyles = style.anchors[name] || defaultAnchorStyle;
    Object.entries(anchorStyles).forEach(([key, value]) => {
      anchorGroup.attr(key, value);
    });
    anchorGroup.attr("id", name);
  }
}
