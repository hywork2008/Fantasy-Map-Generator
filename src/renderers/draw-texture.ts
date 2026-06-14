import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

export const drawTexture = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  _appServices: AppServices
): void => {
  const { graphWidth, graphHeight } = worldContext;
  const { texture } = viewContext;

  const x = Number(texture.attr("data-x") || 0);
  const y = Number(texture.attr("data-y") || 0);
  const href = texture.attr("data-href");

  texture
    .append("image")
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("x", x)
    .attr("y", y)
    .attr("width", graphWidth - x)
    .attr("height", graphHeight - y)
    .attr("href", href);
};
