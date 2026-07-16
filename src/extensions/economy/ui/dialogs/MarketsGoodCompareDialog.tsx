import React from "react";
import { VirtualTableBody } from "../../../../ui/components/VirtualTableBody";
import { closeDialog, Dialog, FillBox, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";

import {
  close,
  downloadCsv,
  openMarketOverview,
  refresh,
  setSelectedGoodId,
  setSorting,
  togglePercentageMode
} from "../../controllers/marketsGoodCompare";
import { useMarketsGoodCompareState } from "../../store/marketsGoodCompareState";

export const MarketsGoodCompareDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketsGoodCompare"));
  const { options, selectedGoodId, sortBy, sortDirection, isPercentageMode, rows, totalStock, avgPrice } =
    useMarketsGoodCompareState();

  React.useEffect(() => {
    if (!isOpen) close();
  }, [isOpen]);

  const sortedRows = React.useMemo(() => {
    const nextRows = [...rows];
    nextRows.sort((left, right) => {
      const leftValue = sortBy === "market" ? left.marketName.toLowerCase() : left[sortBy];
      const rightValue = sortBy === "market" ? right.marketName.toLowerCase() : right[sortBy];
      if (leftValue < rightValue) return -1 * sortDirection;
      if (leftValue > rightValue) return 1 * sortDirection;
      return 0;
    });
    return nextRows;
  }, [rows, sortBy, sortDirection]);

  const getSortIcon = (field: "market" | "stock" | "price", alphabetical = false) => {
    if (sortBy !== field) return "";
    if (alphabetical) return sortDirection === 1 ? "icon-sort-name-up" : "icon-sort-name-down";
    return sortDirection === 1 ? "icon-sort-number-up" : "icon-sort-number-down";
  };

  const displayValue = (value: number, total: number) => {
    if (!isPercentageMode) return value;
    return total ? `${((value / total) * 100).toFixed(2)}%` : "0%";
  };

  const displayPrice = (value: number) => {
    if (!isPercentageMode) return formatPrice(value);
    return avgPrice ? `${((value / avgPrice) * 100).toFixed(2)}%` : "0%";
  };

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title="Compare Good Stock"
      className="fmg-dialog--table"
      onClose={() => {
        closeDialog("marketsGoodCompare");
        close();
      }}
    >
      <div id="marketsGoodCompareContainer">
        <div className="d-flex header">
          <label htmlFor="marketsGoodCompareSelect" data-tip="Select good to compare stock across markets">
            Good:
          </label>
          <select
            id="marketsGoodCompareSelect"
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

        <div
          ref={parentRef}
          id="marketsGoodCompareBody"
          className="table"
          data-type={isPercentageMode ? "percentage" : "absolute"}
        >
          <table className="fmg-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="header">
                <th />
                <th
                  data-tip="Market center burg name. Click to sort"
                  className={`sortable alphabetically ${getSortIcon("market", true)}`}
                  onClick={() => setSorting("market")}
                >
                  Market
                </th>
                <th
                  data-tip="Good stock in this market. Click to sort"
                  className={`sortable ${getSortIcon("stock")}`}
                  onClick={() => setSorting("stock")}
                >
                  Stock
                </th>
                <th
                  data-tip="Price for this good. Click to sort"
                  className={`sortable ${getSortIcon("price")}`}
                  onClick={() => setSorting("price")}
                >
                  Price
                </th>
              </tr>
            </thead>
            {sortedRows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={4}>
                    <span>No market carries the selected good</span>
                  </td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody
                items={sortedRows}
                scrollElementRef={parentRef}
                renderRow={row => (
                  <tr
                    key={row.marketId}
                    className="states pointer"
                    data-market={row.marketName}
                    data-stock={row.stock}
                    data-price={row.price}
                    onClick={() => openMarketOverview(row.marketId)}
                  >
                    <td>
                      <FillBox fill={row.marketColor} data-tip="Market color" />
                    </td>
                    <td>{row.marketName}</td>
                    <td>{displayValue(row.stock, totalStock)}</td>
                    <td>{displayPrice(row.price)}</td>
                  </tr>
                )}
              />
            )}
          </table>
        </div>

        <div id="marketsGoodCompareFooter" className="totalLine">
          <div data-tip="Total stock of this good across all markets">
            Total Stock:<span id="marketsGoodCompareFooterStock">{totalStock}</span>
          </div>
          <div data-tip="Average price of this good across markets">
            Avg Price:<span id="marketsGoodCompareFooterPrice">{formatPrice(avgPrice)}</span>
          </div>
        </div>

        <div id="marketsGoodCompareBottom" className="footer">
          <button
            type="button"
            id="marketsGoodCompareRefresh"
            data-tip="Refresh"
            className="icon-cw"
            onClick={refresh}
          />
          <button
            type="button"
            id="marketsGoodComparePercentage"
            data-tip="Toggle percentage / absolute values views"
            className="icon-percent"
            onClick={togglePercentageMode}
          />
          <button
            type="button"
            id="marketsGoodCompareExport"
            data-tip="Save data as a CSV file"
            className="icon-download"
            onClick={downloadCsv}
          />
        </div>
      </div>
    </Dialog>
  );
};
