import React from "react";
import { VirtualTableBody } from "../../../../ui/components/VirtualTableBody";
import { useOptionsState } from "../../../hostCore";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { close, downloadCsv, refresh, setSelectedGoodId, setSorting } from "../../controllers/marketTradeOpportunities";
import {
  type MarketTradeOpportunityRow,
  type MarketTradeOpportunitySort,
  useMarketTradeOpportunitiesState
} from "../../store/marketTradeOpportunitiesState";

export const MarketTradeOpportunitiesDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketTradeOpportunities"));
  const { options, selectedGoodId, sortBy, sortDirection, rows } = useMarketTradeOpportunitiesState();
  const distanceUnit = useOptionsState(state => state.distanceUnit);
  const parentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) close();
  }, [isOpen]);

  const sortedRows = React.useMemo(() => {
    const nextRows = [...rows];
    nextRows.sort((left, right) => {
      const leftValue = getSortValue(left, sortBy);
      const rightValue = getSortValue(right, sortBy);
      if (leftValue < rightValue) return -1 * sortDirection;
      if (leftValue > rightValue) return 1 * sortDirection;
      return 0;
    });
    return nextRows;
  }, [rows, sortBy, sortDirection]);

  const getSortIcon = (field: MarketTradeOpportunitySort, alphabetical = false) => {
    if (sortBy !== field) return "";
    if (alphabetical) return sortDirection === 1 ? "icon-sort-name-up" : "icon-sort-name-down";
    return sortDirection === 1 ? "icon-sort-number-up" : "icon-sort-number-down";
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Trade Opportunities"
      className="overflow-hidden"
      onClose={() => {
        closeDialog("marketTradeOpportunities");
        close();
      }}
    >
      <div id="marketTradeOpportunitiesContainer">
        <div className="d-flex header">
          <label htmlFor="marketTradeOpportunitiesSelect" data-tip="Select good to find buy-low / sell-high routes">
            Good:
          </label>
          <select
            id="marketTradeOpportunitiesSelect"
            value={selectedGoodId ?? ""}
            onChange={e => setSelectedGoodId(parseInt(e.target.value, 10))}
          >
            {options.map(option => (
              <option key={option.goodId} value={option.goodId}>
                {option.goodName}
              </option>
            ))}
          </select>
        </div>

        <div ref={parentRef} id="marketTradeOpportunitiesBody" className="table">
          <table className="fmg-table">
            <thead>
              <tr className="header">
                <th
                  data-tip="Market to buy from. Click to sort"
                  className={`sortable alphabetically ${getSortIcon("source", true)}`}
                  onClick={() => setSorting("source")}
                >
                  Buy at
                </th>
                <th
                  data-tip="Market to sell to. Click to sort"
                  className={`sortable alphabetically ${getSortIcon("target", true)}`}
                  onClick={() => setSorting("target")}
                >
                  Sell at
                </th>
                <th
                  data-tip="Estimated route distance between market centers. Click to sort"
                  className={`sortable ${getSortIcon("distance")}`}
                  onClick={() => setSorting("distance")}
                >
                  Distance
                </th>
                <th
                  data-tip="Land distance along the selected route. Click to sort"
                  className={`sortable ${getSortIcon("landDistance")}`}
                  onClick={() => setSorting("landDistance")}
                >
                  Land
                </th>
                <th
                  data-tip="Sea distance along the selected route. Click to sort"
                  className={`sortable ${getSortIcon("seaDistance")}`}
                  onClick={() => setSorting("seaDistance")}
                >
                  Sea
                </th>
                <th
                  data-tip="Number of land/sea mode changes on the route. Click to sort"
                  className={`sortable ${getSortIcon("transferCount")}`}
                  onClick={() => setSorting("transferCount")}
                >
                  Transfers
                </th>
                <th
                  data-tip="Price paid when buying from source market. Click to sort"
                  className={`sortable ${getSortIcon("buyPrice")}`}
                  onClick={() => setSorting("buyPrice")}
                >
                  Buy
                </th>
                <th
                  data-tip="Price received when selling to target market. Click to sort"
                  className={`sortable ${getSortIcon("sellPrice")}`}
                  onClick={() => setSorting("sellPrice")}
                >
                  Sell
                </th>
                <th
                  data-tip="Estimated transport cost per unit. Click to sort"
                  className={`sortable ${getSortIcon("transportCost")}`}
                  onClick={() => setSorting("transportCost")}
                >
                  Cost
                </th>
                <th
                  data-tip="Estimated profit per unit after transport. Click to sort"
                  className={`sortable ${getSortIcon("unitProfit")}`}
                  onClick={() => setSorting("unitProfit")}
                >
                  Unit profit
                </th>
                <th
                  data-tip="Available units in source market. Click to sort"
                  className={`sortable ${getSortIcon("maxUnits")}`}
                  onClick={() => setSorting("maxUnits")}
                >
                  Units
                </th>
                <th
                  data-tip="Estimated total profit using available source stock. Click to sort"
                  className={`sortable ${getSortIcon("totalProfit")}`}
                  onClick={() => setSorting("totalProfit")}
                >
                  Total
                </th>
              </tr>
            </thead>
            {sortedRows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={12}>No profitable routes for the selected good</td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody
                items={sortedRows}
                scrollElementRef={parentRef}
                renderRow={row => (
                  <tr key={`${row.sourceMarketId}-${row.targetMarketId}`} className="states">
                    <td>{row.sourceMarketName}</td>
                    <td>{row.targetMarketName}</td>
                    <td style={{ textAlign: "right" }}>{`${row.distance} ${distanceUnit}`}</td>
                    <td style={{ textAlign: "right" }}>{`${row.landDistance} ${distanceUnit}`}</td>
                    <td style={{ textAlign: "right" }}>{`${row.seaDistance} ${distanceUnit}`}</td>
                    <td style={{ textAlign: "right" }}>{row.transferCount}</td>
                    <td style={{ textAlign: "right" }}>{formatPrice(row.buyPrice)}</td>
                    <td style={{ textAlign: "right" }}>{formatPrice(row.sellPrice)}</td>
                    <td style={{ textAlign: "right" }}>{formatPrice(row.transportCost)}</td>
                    <td style={{ textAlign: "right" }}>{formatPrice(row.unitProfit)}</td>
                    <td style={{ textAlign: "right" }}>{row.maxUnits}</td>
                    <td style={{ textAlign: "right" }}>{formatPrice(row.totalProfit)}</td>
                  </tr>
                )}
              />
            )}
          </table>
        </div>

        <div id="marketTradeOpportunitiesFooter" className="totalLine">
          <div data-tip="Number of profitable routes shown">Routes: {rows.length}</div>
        </div>

        <div id="marketTradeOpportunitiesBottom" className="footer">
          <button
            type="button"
            id="marketTradeOpportunitiesRefresh"
            data-tip="Refresh opportunities"
            className="icon-cw"
            onClick={refresh}
          />
          <button
            type="button"
            id="marketTradeOpportunitiesExport"
            data-tip="Save opportunities as a CSV file"
            className="icon-download"
            onClick={downloadCsv}
          />
        </div>
      </div>
    </Dialog>
  );
};

function getSortValue(row: MarketTradeOpportunityRow, sortBy: MarketTradeOpportunitySort): string | number {
  if (sortBy === "source") return row.sourceMarketName.toLowerCase();
  if (sortBy === "target") return row.targetMarketName.toLowerCase();
  return row[sortBy];
}
