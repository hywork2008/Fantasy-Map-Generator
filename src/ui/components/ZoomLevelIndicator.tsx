import { useEffect, useState } from "react";
import { useOptionsState } from "../../store/optionsState";

interface ZoomLevelChangedDetail {
  scale: number;
}

function getInitialScale(): number {
  return window.fmg?.view.scale ?? 1;
}

function formatZoomLevel(scale: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(scale);
}

export const ZoomLevelIndicator = () => {
  const showZoomLevel = useOptionsState(state => state.showZoomLevel);
  const [scale, setScale] = useState(getInitialScale);

  useEffect(() => {
    const handleZoomLevelChanged = (event: Event) => {
      const { scale } = (event as CustomEvent<ZoomLevelChangedDetail>).detail;
      if (Number.isFinite(scale)) setScale(scale);
    };

    document.addEventListener("fmg:zoom-level-changed", handleZoomLevelChanged);
    setScale(getInitialScale());
    return () => document.removeEventListener("fmg:zoom-level-changed", handleZoomLevelChanged);
  }, []);

  if (!showZoomLevel) return null;

  const zoomLevel = formatZoomLevel(scale);

  return (
    <div id="zoomLevelIndicator" role="status" aria-label={`Current zoom level: ${zoomLevel}`}>
      Zoom {zoomLevel}
    </div>
  );
};
