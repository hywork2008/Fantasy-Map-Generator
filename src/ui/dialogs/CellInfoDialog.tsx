import type React from "react";
import { useCellInfoState } from "../../store/cellInfoState";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CellInfoDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("cellInfo"));
  const info = useCellInfoState();

  return (
    <Dialog isOpen={isOpen} title="CellInfo" onClose={() => closeDialog("cellInfo")}>
      <div id="cellInfo">
        <div>
          <p>
            <b>Cell:</b> <span>{info.cell}</span> <b>X:</b> <span>{info.x}</span> <b>Y:</b> <span>{info.y}</span>
          </p>
          <p>
            <b>Latitude:</b> <span>{info.lat}</span>
          </p>
          <p>
            <b>Longitude:</b> <span>{info.lon}</span>
          </p>
          <p>
            <b>Geozone:</b> <span>{info.geozone}</span>
          </p>
          <p>
            <b>Area:</b> <span>{info.area}</span>
          </p>
          <p>
            <b>Type:</b> <span>{info.feature}</span>
          </p>
          <p>
            <b>Precipitation:</b> <span>{info.prec}</span>
          </p>
          <p>
            <b>River:</b> <span>{info.river}</span>
          </p>
          <p>
            <b>Population:</b> <span>{info.population}</span>
          </p>
          <p>
            <b>Elevation:</b> <span>{info.elevation}</span>
          </p>
          <p>
            <b>Depth:</b> <span>{info.depth}</span>
          </p>
          <p>
            <b>Temperature:</b> <span>{info.temp}</span>
          </p>
          <p>
            <b>Biome:</b> <span>{info.biome}</span>
          </p>
          <p>
            <b>State:</b> <span>{info.state}</span>
          </p>
          <p>
            <b>Province:</b> <span>{info.province}</span>
          </p>
          <p>
            <b>Culture:</b> <span>{info.culture}</span>
          </p>
          <p>
            <b>Religion:</b> <span>{info.religion}</span>
          </p>
          <p>
            <b>Burg:</b> <span>{info.burg}</span>
          </p>
          <p>
            <b>Good:</b> <span>{info.good}</span>
          </p>
          <p>
            <b>Market:</b> <span>{info.market}</span>
          </p>
          <p>
            <b>Cell Production:</b> <span>{info.cellProduction}</span>
          </p>
          <p>
            <b>Burg Production:</b> <span>{info.burgProduction}</span>
          </p>
        </div>
      </div>
    </Dialog>
  );
};
