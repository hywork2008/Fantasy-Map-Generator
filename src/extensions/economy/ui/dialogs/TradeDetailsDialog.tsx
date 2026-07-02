import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { formatPrice, rn } from "../../../hostUtils";

import { closeTradeDetails } from "../../controllers/trade-details";
import { useTradeDetailsState } from "../../store/tradeDetailsState";

export const TradeDetailsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("tradeDetails"));
  const summary = useTradeDetailsState(state => state.summary);
  const rows = useTradeDetailsState(state => state.rows);
  const distance = useTradeDetailsState(state => state.distance);
  const totalUnits = useTradeDetailsState(state => state.totalUnits);
  const totalValue = useTradeDetailsState(state => state.totalValue);
  const sortBy = useTradeDetailsState(state => state.sortBy);
  const sortDirection = useTradeDetailsState(state => state.sortDirection);

  const setSorting = (nextSortBy: "good" | "units" | "price" | "value") => {
    useTradeDetailsState.setState(state => ({
      sortBy: nextSortBy,
      sortDirection: state.sortBy === nextSortBy ? state.sortDirection * -1 : nextSortBy === "good" ? 1 : -1
    }));
  };

  const sortedRows = React.useMemo(() => {
    const nextRows = [...rows];
    nextRows.sort((left, right) => {
      const leftValue = sortBy === "good" ? left.goodName.toLowerCase() : left[sortBy];
      const rightValue = sortBy === "good" ? right.goodName.toLowerCase() : right[sortBy];
      if (leftValue < rightValue) return -1 * sortDirection;
      if (leftValue > rightValue) return 1 * sortDirection;
      return 0;
    });
    return nextRows;
  }, [rows, sortBy, sortDirection]);

  const getSortIcon = (field: "good" | "units" | "price" | "value", alphabetical = false) => {
    if (sortBy !== field) return "";
    if (alphabetical) return sortDirection === 1 ? "icon-sort-name-up" : "icon-sort-name-down";
    return sortDirection === 1 ? "icon-sort-number-up" : "icon-sort-number-down";
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Trade Details"
      onClose={() => {
        closeDialog("tradeDetails");
        closeTradeDetails();
      }}
    >
      <div id="tradeDetailsContainer">
        <div id="tradeDetailsSummary" className="totalLine">
          {summary && (
            <>
              <span>
                <b>Seller</b>: {summary.sellerName} {summary.sellerType}{" "}
                <span className="icon-dot-circled pointer" data-tip="Zoom to seller" onClick={summary.onZoomSeller} />
              </span>
              <span className="-trade-details-dialog__margin-left-5">
                <b>Buyer</b>: {summary.buyerName} {summary.buyerType}{" "}
                <span className="icon-dot-circled pointer" data-tip="Zoom to buyer" onClick={summary.onZoomBuyer} />
              </span>
            </>
          )}
        </div>

        <div id="tradeDetailsBody" className="table -trade-details-dialog__max-height-30em">
          <table className="states-table">
            <colgroup>
              <col style={{ width: "2.5em" }} />
              <col style={{ width: "10em" }} />
              <col style={{ width: "5em" }} />
              <col style={{ width: "5.5em" }} />
              <col style={{ width: "3.6em" }} />
            </colgroup>
            <thead>
              <tr className="header">
                <th />
                <th
                  data-tip="Click to sort by good"
                  className={`sortable alphabetically ${getSortIcon("good", true)} -trade-details-dialog__margin-left-0`}
                  onClick={() => setSorting("good")}
                >
                  Good&nbsp;
                </th>
                <th
                  data-tip="Click to sort by units"
                  className={`sortable ${getSortIcon("units")}`}
                  onClick={() => setSorting("units")}
                >
                  Units&nbsp;
                </th>
                <th
                  data-tip="Click to sort by unit price"
                  className={`sortable ${getSortIcon("price")}`}
                  onClick={() => setSorting("price")}
                >
                  Price&nbsp;
                </th>
                <th
                  data-tip="Click to sort by value"
                  className={`sortable ${getSortIcon("value")}`}
                  onClick={() => setSorting("value")}
                >
                  Value&nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => (
                <tr
                  key={row.goodId}
                  className="states tradeDeal"
                  data-good={row.goodName}
                  data-units={row.units}
                  data-price={row.price}
                  data-value={row.value}
                >
                  <td>
                    <svg aria-label={row.goodName} data-tip="Good icon" width="2em" height="2em" className="goodIcon">
                      <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                      <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                    </svg>
                  </td>
                  <td data-tip="Good name" className="goodName">
                    {row.goodName}
                  </td>
                  <td className="goodUnits">{rn(row.units, 2)}</td>
                  <td className="goodPrice">{formatPrice(rn(row.price, 2))}</td>
                  <td className="goodValue">{formatPrice(rn(row.value, 2))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div id="tradeDetailsFooter" className="totalLine">
          <div className="-trade-details-dialog__margin-left-5">
            Distance: <span id="tradeDetailsFooterDistance">{distance}</span>
          </div>
          <div className="-trade-details-dialog__margin-left-12" data-tip="Total traded units">
            Units: <span id="tradeDetailsFooterUnits">{rn(totalUnits, 2)}</span>
          </div>
          <div className="-trade-details-dialog__margin-left-12" data-tip="Total deal value">
            Value: <span id="tradeDetailsFooterValue">{formatPrice(totalValue)}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
