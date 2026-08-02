import type { FC } from "react";
import { useBurgEditorState } from "../../../hostUi";
import { listGuildsForBurg } from "../../controllers/burgGuilds";

/** Read-only guild presence ledger for the Burg currently open in Edit Burg. */
export const BurgEditorGuildsTab: FC = () => {
  const burgId = useBurgEditorState(state => state.burgData?.id);
  const rows = burgId === undefined ? [] : listGuildsForBurg(burgId);

  if (!rows.length) {
    return (
      <div id="burgGuildsTab" role="status">
        No guilds or craft practitioners recorded in this burg.
      </div>
    );
  }

  return (
    <div id="burgGuildsTab">
      <p data-tip="Formal guild halls are organizational presences. Informal rows record active craft practitioners without a formal hall.">
        Guild presence
      </p>
      <div className="table" style={{ overflow: "auto" }}>
        <table id="burgGuildsTable" className="fmg-table">
          <thead>
            <tr>
              <th scope="col">Domain</th>
              <th scope="col">Status</th>
              <th scope="col">Stock</th>
              <th scope="col">Bonus</th>
              <th scope="col">Treasury</th>
              <th scope="col">Master</th>
              <th scope="col">Mastery</th>
              <th scope="col">Founded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.domain}>
                <td>{row.domain}</td>
                <td>{row.status === "chapter" ? "Chapter" : "Informal"}</td>
                <td>{row.stock.toFixed(3)}</td>
                <td>{row.bonus.toFixed(3)}</td>
                <td>{row.treasury.toFixed(2)}</td>
                <td>{row.masterName ?? "—"}</td>
                <td
                  data-tip={
                    row.masterTechniques.length
                      ? `Personal techniques: ${row.masterTechniques.join(", ")}`
                      : "Practical mastery and aptitude; personal techniques appear here when learned"
                  }
                >
                  {row.masterProficiency === null ? "—" : `${row.masterProficiency.toFixed(1)} · ${row.masterAptitude}`}
                </td>
                <td>{row.foundedYear ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
