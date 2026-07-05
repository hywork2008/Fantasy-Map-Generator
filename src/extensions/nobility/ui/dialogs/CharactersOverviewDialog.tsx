import type React from "react";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { getWorldContext } from "../../nobilityContext";

export const CharactersOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("charactersOverview"));

  const worldContext = getWorldContext();
  const characters = worldContext.pack.characters ?? [];
  const states = worldContext.pack.states;

  const rows = [...characters].sort((a, b) => {
    const stateA = states[a.titles[0]?.entityId]?.name ?? "";
    const stateB = states[b.titles[0]?.entityId]?.name ?? "";
    if (stateA !== stateB) return stateA < stateB ? -1 : 1;
    const holdingA = a.titles[0];
    const holdingB = b.titles[0];
    if (holdingA?.landed !== holdingB?.landed) return holdingA?.landed ? -1 : 1;
    return 0;
  });

  return (
    <Dialog isOpen={isOpen} title="Characters" onClose={() => closeDialog("charactersOverview")}>
      <div id="charactersOverviewContainer">
        {rows.length === 0 ? (
          <i>No characters generated yet.</i>
        ) : (
          <div className="table">
            <table className="states-table">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="header">
                  <th>Name</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Title</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(character => {
                  const holding = character.titles[0];
                  const stateName = states[holding?.entityId]?.name ?? "";
                  return (
                    <tr key={character.i} className="states">
                      <td>{character.name}</td>
                      <td>{character.age}</td>
                      <td>{character.gender}</td>
                      <td>{holding?.title ?? ""}</td>
                      <td>{stateName}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
};
