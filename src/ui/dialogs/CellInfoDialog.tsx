import type React from "react";
import { useCellInfoState } from "../../store/cellInfoState";
import { useDialogState } from "../../store/dialogState";
import { useExtensionState } from "../../store/extensionState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CellInfoDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("cellInfo"));
  const info = useCellInfoState();
  const cellInfoRows = useExtensionState(state => state.cellInfoRows);

  return (
    <Dialog isOpen={isOpen} title="CellInfo" onClose={() => closeDialog("cellInfo")}>
      <table id="cellInfo" className="fmg-table">
        <tbody>
          <tr>
            <th scope="row">Cell</th>
            <td>{info.cell}</td>
          </tr>
          <tr>
            <th scope="row">X</th>
            <td>{info.x}</td>
          </tr>
          <tr>
            <th scope="row">Y</th>
            <td>{info.y}</td>
          </tr>
          <tr>
            <th scope="row">Latitude</th>
            <td>{info.lat}</td>
          </tr>
          <tr>
            <th scope="row">Longitude</th>
            <td>{info.lon}</td>
          </tr>
          <tr>
            <th scope="row">Geozone</th>
            <td>{info.geozone}</td>
          </tr>
          <tr>
            <th scope="row">Area</th>
            <td>{info.area}</td>
          </tr>
          <tr>
            <th scope="row">Type</th>
            <td>{info.feature}</td>
          </tr>
          <tr>
            <th scope="row">Precipitation</th>
            <td>{info.prec}</td>
          </tr>
          <tr>
            <th scope="row">River</th>
            <td>{info.river}</td>
          </tr>
          <tr>
            <th scope="row">Population</th>
            <td>{info.population}</td>
          </tr>
          <tr>
            <th scope="row">Elevation</th>
            <td>{info.elevation}</td>
          </tr>
          <tr>
            <th scope="row">Depth</th>
            <td>{info.depth}</td>
          </tr>
          <tr>
            <th scope="row">Temperature</th>
            <td>{info.temp}</td>
          </tr>
          <tr>
            <th scope="row">Biome</th>
            <td>{info.biome}</td>
          </tr>
          <tr>
            <th scope="row">State</th>
            <td>{info.state}</td>
          </tr>
          <tr>
            <th scope="row">Province</th>
            <td>{info.province}</td>
          </tr>
          <tr>
            <th scope="row">Culture</th>
            <td>{info.culture}</td>
          </tr>
          <tr>
            <th scope="row">Religion</th>
            <td>{info.religion}</td>
          </tr>
          <tr>
            <th scope="row">Burg</th>
            <td>{info.burg}</td>
          </tr>
          <tr>
            <th scope="row">Danger</th>
            <td>{info.danger}</td>
          </tr>
          {cellInfoRows.map(row => (
            <tr key={row.id}>
              <th scope="row">{row.label}</th>
              <td>{info.extra[row.id] ?? "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
};
