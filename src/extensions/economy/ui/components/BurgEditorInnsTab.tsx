import type React from "react";
import { useBurgEditorState } from "../../../hostUi";
import { getInnFacilitiesForBurg, getInnFacilityTotals } from "../../generators/innFacilities";
import type { InnClass } from "../../generators/innFacilityTypes";
import { getAvailableTemporaryInnBeds, getTemporaryLodgerPeopleByBurg } from "../../generators/innStays";

const INN_CLASS_LABELS: Record<InnClass, string> = {
  wayside: "Wayside Inn",
  market: "Market Inn",
  waterside: "Quay Inn",
  grand: "Great Inn",
  caravanserai: "Caravanserai"
};

/**
 * Read-only lodging ledger for the burg currently open in Edit Burg.
 * It deliberately reports physical facilities, not temporary occupancy or housing capacity.
 */
export const BurgEditorInnsTab: React.FC = () => {
  const burgId = useBurgEditorState(state => state.burgData?.id);
  const facilities = burgId === undefined ? [] : getInnFacilitiesForBurg(burgId);
  const totals = getInnFacilityTotals(facilities);
  const temporaryLodgerPeople = burgId === undefined ? 0 : (getTemporaryLodgerPeopleByBurg().get(burgId) ?? 0);

  if (!facilities.length) {
    return (
      <div id="burgInnsTab" role="status">
        No commercial lodging facilities are recorded in this burg.
      </div>
    );
  }

  return (
    <div id="burgInnsTab">
      <p data-tip="Commercial short-stay lodging is separate from permanent dwellings and does not raise housing capacity.">
        Lodging facilities
      </p>
      <div className="table" style={{ overflow: "auto" }}>
        <table id="burgInnsTable" className="fmg-table">
          <thead>
            <tr>
              <th scope="col">Lodging</th>
              <th scope="col" data-tip="Physical inn buildings represented by this facility class">
                Buildings
              </th>
              <th scope="col">Rooms</th>
              <th scope="col" data-tip="Private-room beds plus shared-room and loft beds">
                Beds
              </th>
              <th scope="col">Stables</th>
            </tr>
          </thead>
          <tbody>
            {facilities.map(facility => (
              <tr key={facility.innClass}>
                <td>{INN_CLASS_LABELS[facility.innClass]}</td>
                <td>{facility.buildingCount}</td>
                <td>{facility.privateRooms}</td>
                <td>{facility.privateBeds + facility.sharedBeds}</td>
                <td>{facility.stableSpaces}</td>
              </tr>
            ))}
            <tr className="totalLine">
              <th scope="row">Total</th>
              <td>{totals.buildingCount}</td>
              <td>{totals.privateRooms}</td>
              <td>{totals.beds}</td>
              <td>{totals.stableSpaces}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Common-room seats: {totals.commonSeats}
        <br />
        Temporary beds free: {getAvailableTemporaryInnBeds(burgId ?? 0)}
        {temporaryLodgerPeople > 0 ? ` · temporary lodgers: ${Math.round(temporaryLodgerPeople)}` : ""}
      </p>
    </div>
  );
};
