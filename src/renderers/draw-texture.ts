import { viewState } from "../context/viewState";
import { worldContext } from "../context/worldContext";

declare global {
  var drawTexture: () => void;
}

const textureRenderer = (): void => {
  const { graphWidth, graphHeight } = worldContext;
  const { texture } = viewState;

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

window.drawTexture = textureRenderer;
