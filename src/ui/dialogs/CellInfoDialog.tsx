import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CellInfoDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("cellInfo"));

  return (
    <Dialog isOpen={isOpen} title="CellInfo" onClose={() => closeDialog("cellInfo")}>
      <div id="cellInfo">
        <div>
          <p>
            <b>Cell:</b> <span id="infoCell" /> <b>X:</b> <span id="infoX" /> <b>Y:</b> <span id="infoY" />
          </p>
          <p>
            <b>Latitude:</b> <span id="infoLat" />
          </p>
          <p>
            <b>Longitude:</b> <span id="infoLon" />
          </p>
          <p>
            <b>Geozone:</b> <span id="infoGeozone" />
          </p>
          <p>
            <b>Area:</b> <span id="infoArea">0</span>
          </p>
          <p>
            <b>Type:</b> <span id="infoFeature">n/a</span>
          </p>
          <p>
            <b>Precipitation:</b> <span id="infoPrec">0</span>
          </p>
          <p>
            <b>River:</b> <span id="infoRiver">no</span>
          </p>
          <p>
            <b>Population:</b> <span id="infoPopulation">0</span>
          </p>
          <p>
            <b>Elevation:</b> <span id="infoElevation">0</span>
          </p>
          <p>
            <b>Depth:</b> <span id="infoDepth">0</span>
          </p>
          <p>
            <b>Temperature:</b> <span id="infoTemp">0</span>
          </p>
          <p>
            <b>Biome:</b> <span id="infoBiome">n/a</span>
          </p>
          <p>
            <b>State:</b> <span id="infoState">n/a</span>
          </p>
          <p>
            <b>Province:</b> <span id="infoProvince">n/a</span>
          </p>
          <p>
            <b>Culture:</b> <span id="infoCulture">n/a</span>
          </p>
          <p>
            <b>Religion:</b> <span id="infoReligion">n/a</span>
          </p>
          <p>
            <b>Burg:</b> <span id="infoBurg">n/a</span>
          </p>
        </div>
      </div>
    </Dialog>
  );
};
