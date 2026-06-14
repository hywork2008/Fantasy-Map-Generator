import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../modules/burgs-generator";
import { TIME } from "../utils/debug";

import type { IRenderer } from "./core/IRenderer";

interface BurgGroup {
  name: string;
  order: number;
}

export const BurgLabelsRenderer: IRenderer = {
  id: "burgLabels",

  render(worldContext: Readonly<WorldContext>, viewContext: Readonly<ViewContext>, _appServices: AppServices): void {
    TIME && console.time("BurgLabelsRenderer");
    const { pack, options, style } = worldContext;
    const { burgLabels } = viewContext;
    createLabelGroups(options, style, burgLabels);

    for (const { name } of options.burgs.groups as BurgGroup[]) {
      const burgsInGroup = pack.burgs.filter(b => b.group === name && !b.removed);
      if (!burgsInGroup.length) continue;

      const labelGroup = burgLabels.select<SVGGElement>(`#${name}`);
      if (labelGroup.empty()) continue;

      const dx = labelGroup.attr("data-dx") || 0;
      const dy = labelGroup.attr("data-dy") || 0;

      labelGroup
        .selectAll("text")
        .data(burgsInGroup)
        .enter()
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .attr("id", d => `burgLabel${d.i}`)
        .attr("data-id", d => d.i!)
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("dx", `${dx}em`)
        .attr("dy", `${dy}em`)
        .text(d => d.name!);
    }

    TIME && console.timeEnd("BurgLabelsRenderer");
  },

  clear(viewContext: Readonly<ViewContext>): void {
    viewContext.burgLabels.selectAll("*").remove();
  }
};

export const drawBurgLabel = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  appServices: AppServices,
  burg: Burg
): void => {
  const { burgLabels } = viewContext;
  const labelGroup = burgLabels.select<SVGGElement>(`#${burg.group}`);
  if (labelGroup.empty()) {
    BurgLabelsRenderer.render(worldContext, viewContext, appServices);
    return;
  }

  const dx = labelGroup.attr("data-dx") || 0;
  const dy = labelGroup.attr("data-dy") || 0;

  removeBurgLabel(worldContext, viewContext, appServices, burg.i!);
  labelGroup
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("id", `burgLabel${burg.i}`)
    .attr("data-id", burg.i!)
    .attr("x", burg.x)
    .attr("y", burg.y)
    .attr("dx", `${dx}em`)
    .attr("dy", `${dy}em`)
    .text(burg.name!);
};

export const removeBurgLabel = (
  _worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices,
  burgId: number
): void => {
  const existingLabel = document.getElementById(`burgLabel${burgId}`);
  if (existingLabel) existingLabel.remove();
};

function createLabelGroups(
  _options: WorldContext["options"],
  style: WorldContext["style"],
  _burgLabels: ViewContext["burgLabels"]
): void {
  document.querySelectorAll("g#burgLabels > g").forEach(group => {
    style.burgLabels[group.id] = Array.from(group.attributes).reduce((acc: { [key: string]: string }, attribute) => {
      acc[attribute.name] = attribute.value;
      return acc;
    }, {});
    group.remove();
  });

  const defaultStyle = style.burgLabels.town || Object.values(style.burgLabels)[0] || {};
  const sortedGroups = [...(_options.burgs.groups as BurgGroup[])].sort((a, b) => a.order - b.order);
  for (const { name } of sortedGroups) {
    const group = _burgLabels.append("g");
    const styles = style.burgLabels[name] || defaultStyle;
    Object.entries(styles).forEach(([key, value]) => {
      group.attr(key, value);
    });
    group.attr("id", name);
  }
}
