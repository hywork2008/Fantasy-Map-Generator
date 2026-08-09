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
      <div className="cell-info-actions">
        <button
          type="button"
          className={info.isPinned ? "pressed" : undefined}
          aria-pressed={info.isPinned}
          data-tip={
            info.isPinned ? "Follow the cursor with Cell Info" : "Keep this cell's details while moving the cursor"
          }
          onClick={info.togglePinned}
        >
          {info.isPinned ? "Follow cursor" : "Pin cell"}
        </button>
      </div>
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
            <th
              scope="row"
              data-tip="Surface water temperature advected along the resolved current field; open ocean only"
            >
              Water temperature
            </th>
            <td>{info.waterTemp}</td>
          </tr>
          <tr>
            <th scope="row" data-tip="Ocean current direction in degrees; open ocean only">
              Current direction
            </th>
            <td>{info.currentDirection}</td>
          </tr>
          <tr>
            <th
              scope="row"
              data-tip="Ocean current strength as a percentage of the solver's 0-255 output scale; open ocean only"
            >
              Current speed
            </th>
            <td>{info.currentSpeed}</td>
          </tr>
          <tr>
            <th
              scope="row"
              data-tip="How enclosed/sheltered the water is, per Options → Generation → Enclosure calculation (0 = open, 100 = fully enclosed); water only"
            >
              Enclosure
            </th>
            <td>{info.enclosure}</td>
          </tr>
          <tr>
            <th scope="row">Biome</th>
            <td>{info.biome}</td>
          </tr>
          <tr>
            <th
              scope="row"
              data-tip="Share of this cell's potential forest that is currently open after timber harvest or conversion to human use"
            >
              Forest clearance
            </th>
            <td>{info.forestClearance}</td>
          </tr>
          <tr>
            <th scope="row" data-tip="Coastal habitat attribute (beach, rock, flat, dune)">
              Coastal habitat
            </th>
            <td>{info.coastalHabitat}</td>
          </tr>
          <tr>
            <th scope="row" data-tip="Nearshore habitat attribute (reef, seagrass)">
              Nearshore habitat
            </th>
            <td>{info.nearshoreHabitat}</td>
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
              <td>
                {info.extra[row.id] ?? "n/a"}
                {row.action && (
                  <button
                    type="button"
                    className="cell-info-row-action"
                    data-tip={row.action.tip}
                    onClick={row.action.onClick}
                  >
                    {row.action.label}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
};
