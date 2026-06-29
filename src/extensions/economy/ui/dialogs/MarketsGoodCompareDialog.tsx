import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { useMarketsGoodCompareState } from "../../../../store/marketsGoodCompareState";
import { FillBox } from "../../../../ui/components/FillBox";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { formatPrice } from "../../../../utils";
import {
  close,
  downloadCsv,
  openMarketOverview,
  refresh,
  setSelectedGoodId,
  setSorting,
  togglePercentageMode
} from "../../controllers/marketsGoodCompare";

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

  return (
    <Dialog
      isOpen={isOpen}
      title="Compare Good Stock"
      onClose={() => {
        closeDialog("marketsGoodCompare");
        close();
      }}
    >
      <div id="marketsGoodCompareContainer">
        <div style={{ display: "flex", alignItems: "center", gap: ".5em", padding: ".2em 0 .4em", fontSize: ".9em" }}>
          <label htmlFor="marketsGoodCompareSelect" data-tip="Select good to compare stock across markets">
            Good:
          </label>
          <select
            id="marketsGoodCompareSelect"
            style={{ flex: 1, minWidth: "8em" }}
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

        <div id="marketsGoodCompareHeader" className="header" style={{ gridTemplateColumns: "1.6em 9em 6em 7em" }}>
          <div />
          <div
            data-tip="Market center burg name. Click to sort"
            className={`sortable alphabetically ${getSortIcon("market", true)}`}
            style={{ marginLeft: 0 }}
            onClick={() => setSorting("market")}
          >
            Market&nbsp;
          </div>
          <div
            data-tip="Good stock in this market. Click to sort"
            className={`sortable ${getSortIcon("stock")}`}
            onClick={() => setSorting("stock")}
          >
            Stock&nbsp;
          </div>
          <div
            data-tip="Price for this good. Click to sort"
            className={`sortable ${getSortIcon("price")}`}
            onClick={() => setSorting("price")}
          >
            Price&nbsp;
          </div>
        </div>

        <div
          id="marketsGoodCompareBody"
          className="table"
          data-type={isPercentageMode ? "percentage" : "absolute"}
          style={{ maxHeight: "40em" }}
        >
          {sortedRows.length === 0 ? (
            <span>No market carries the selected good</span>
          ) : (
            sortedRows.map(row => (
              <div
                key={row.marketId}
                className="states pointer"
                data-market={row.marketName}
                data-stock={row.stock}
                data-price={row.price}
                onClick={() => openMarketOverview(row.marketId)}
              >
                <FillBox fill={row.marketColor} data-tip="Market color" />
                <div style={{ width: "9em" }}>{row.marketName}</div>
                <div style={{ width: "6em" }}>{displayValue(row.stock, totalStock)}</div>
                <div style={{ width: "7em" }}>{displayPrice(row.price)}</div>
              </div>
            ))
          )}
        </div>

        <div id="marketsGoodCompareFooter" className="totalLine">
          <div data-tip="Total stock of this good across all markets" style={{ marginLeft: 5 }}>
            Total Stock:&nbsp;<span id="marketsGoodCompareFooterStock">{totalStock}</span>
          </div>
          <div data-tip="Average price of this good across markets" style={{ marginLeft: 12 }}>
            Avg Price:&nbsp;<span id="marketsGoodCompareFooterPrice">{formatPrice(avgPrice)}</span>
          </div>
        </div>

        <div id="marketsGoodCompareBottom">
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
