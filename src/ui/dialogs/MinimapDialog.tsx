import type React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { zoomTo } from "../../actions";
import { worldContext } from "../../context/worldContext";
import { updateMinimap } from "../../controllers/minimap";
import { viewLayerService as view } from "../../services/viewLayerService";
import { useDialogState } from "../../store/dialogState";
import { useMinimapState } from "../../store/minimapState";
import { minmax } from "../../utils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const localStyle = `
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

export const MinimapDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("minimap"));
  const { viewBox, transform, viewportX, viewportY, viewportWidth, viewportHeight } = useMinimapState();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (isOpen) updateMinimap();
  }, [isOpen]);

  function handleClick(event: React.MouseEvent<SVGSVGElement>): void {
    const svg = svgRef.current;
    if (!svg) return;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const svgPoint = point.matrixTransform(ctm.inverse());
    const x = minmax(svgPoint.x, 0, worldContext.graphWidth);
    const y = minmax(svgPoint.y, 0, worldContext.graphHeight);
    zoomTo(x, y, view.scale, 450);
  }

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.minimap")} onClose={() => closeDialog("minimap")}>
      <style>{localStyle}</style>
      <div id="minimapViewportWrap">
        <svg
          id="minimapSurface"
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Map minimap"
          onClick={handleClick}
        >
          <use id="minimapMapUse" href="#viewbox" transform={transform} />
          <rect id="minimapViewport" x={viewportX} y={viewportY} width={viewportWidth} height={viewportHeight} />
        </svg>
      </div>
    </Dialog>
  );
};
