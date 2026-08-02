import { type ChangeEvent, type FC, useState } from "react";
import { useBurgEditorState } from "../../../hostUi";
import { getLodgingStyle, setLodgingStyle } from "../../economyContext";
import { getInnFacilitiesForBurg, getInnFacilityTotals } from "../../generators/innFacilities";
import { LODGING_STYLES, type LodgingStyle } from "../../generators/innFacilityTypes";
import { getInnPresentation, getLodgingStylePresentation } from "../../generators/innPresentation";
import { getAvailableTemporaryInnBeds, getTemporaryLodgerPeopleByBurg } from "../../generators/innStays";

/**
 * Read-only lodging ledger for the burg currently open in Edit Burg.
 * It deliberately reports physical facilities, not temporary occupancy or housing capacity.
 */
export const BurgEditorInnsTab: FC = () => {
  const burgId = useBurgEditorState(state => state.burgData?.id);
  const [lodgingStyle, setLodgingStyleState] = useState<LodgingStyle>(getLodgingStyle);
  const facilities = burgId === undefined ? [] : getInnFacilitiesForBurg(burgId);
  const totals = getInnFacilityTotals(facilities);
  const temporaryLodgerPeople = burgId === undefined ? 0 : (getTemporaryLodgerPeopleByBurg().get(burgId) ?? 0);
  const stylePresentation = getLodgingStylePresentation(lodgingStyle);

  const handleLodgingStyleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const style = event.target.value as LodgingStyle;
    setLodgingStyle(style);
    setLodgingStyleState(style);
  };

  if (!facilities.length) {
    return (
      <div id="burgInnsTab" role="status">
        No commercial lodging facilities are recorded in this burg.
        <LodgingStyleControl lodgingStyle={lodgingStyle} onChange={handleLodgingStyleChange} />
      </div>
    );
  }

  return (
    <div id="burgInnsTab">
      <p data-tip="Commercial short-stay lodging is separate from permanent dwellings and does not raise housing capacity.">
        Lodging facilities
      </p>
      <LodgingStyleControl lodgingStyle={lodgingStyle} onChange={handleLodgingStyleChange} />
      <p data-tip="These visual cues are for city-detail rendering only and do not affect capacity, employment, or food demand.">
        City detail cues: {stylePresentation.description}
      </p>
      <div className="table" style={{ overflow: "auto" }}>
        <table id="burgInnsTable" className="fmg-table">
          <thead>
            <tr>
              <th scope="col">Lodging</th>
              <th scope="col">City detail</th>
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
                <td>{getInnPresentation(facility.innClass, lodgingStyle).label}</td>
                <td>{getInnPresentation(facility.innClass, lodgingStyle).sceneCue}</td>
                <td>{facility.buildingCount}</td>
                <td>{facility.privateRooms}</td>
                <td>{facility.privateBeds + facility.sharedBeds}</td>
                <td>{facility.stableSpaces}</td>
              </tr>
            ))}
            <tr className="totalLine">
              <th scope="row">Total</th>
              <td>—</td>
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

type LodgingStyleControlProps = {
  lodgingStyle: LodgingStyle;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
};

const LodgingStyleControl: FC<LodgingStyleControlProps> = ({ lodgingStyle, onChange }) => (
  <p>
    <label
      htmlFor="burgInnLodgingStyle"
      data-tip="Changes lodging names and future city-detail cues for every burg. It never changes simulation values."
    >
      Lodging style
    </label>{" "}
    <select id="burgInnLodgingStyle" value={lodgingStyle} onChange={onChange}>
      {LODGING_STYLES.map(style => (
        <option key={style} value={style}>
          {getLodgingStylePresentation(style).label}
        </option>
      ))}
    </select>
  </p>
);
