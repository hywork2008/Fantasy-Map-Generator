import type React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { useTradeDetailsState } from "../../../../store/tradeDetailsState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { formatPrice, rn } from "../../../../utils";
import { closeTradeDetails } from "../../controllers/trade-details";

export const TradeDetailsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("tradeDetails"));
  const summary = useTradeDetailsState(state => state.summary);
  const rows = useTradeDetailsState(state => state.rows);
  const distance = useTradeDetailsState(state => state.distance);
  const totalUnits = useTradeDetailsState(state => state.totalUnits);
  const totalValue = useTradeDetailsState(state => state.totalValue);

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
              <span style={{ marginLeft: 5 }}>
                <b>Buyer</b>: {summary.buyerName} {summary.buyerType}{" "}
                <span className="icon-dot-circled pointer" data-tip="Zoom to buyer" onClick={summary.onZoomBuyer} />
              </span>
            </>
          )}
        </div>

        <div id="tradeDetailsHeader" className="header" style={{ gridTemplateColumns: "2.5em 10em 5em 5.5em 3.6em" }}>
          <div />
          <div
            data-tip="Click to sort by good"
            className="sortable alphabetically"
            data-sortby="good"
            style={{ marginLeft: 0 }}
          >
            Good&nbsp;
          </div>
          <div data-tip="Click to sort by units" className="sortable icon-sort-number-down" data-sortby="units">
            Units&nbsp;
          </div>
          <div data-tip="Click to sort by unit price" className="sortable" data-sortby="price">
            Price&nbsp;
          </div>
          <div data-tip="Click to sort by value" className="sortable" data-sortby="value">
            Value&nbsp;
          </div>
        </div>

        <div id="tradeDetailsBody" className="table" style={{ maxHeight: "30em" }}>
          {rows.map(row => (
            <div
              key={row.goodId}
              className="states tradeDeal"
              data-good={row.goodName}
              data-units={row.units}
              data-price={row.price}
              data-value={row.value}
            >
              <svg aria-label={row.goodName} data-tip="Good icon" width="2em" height="2em" className="goodIcon">
                <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
              </svg>
              <div data-tip="Good name" className="goodName">
                {row.goodName}
              </div>
              <div className="goodUnits">{rn(row.units, 2)}</div>
              <div className="goodPrice">{formatPrice(rn(row.price, 2))}</div>
              <div className="goodValue">{formatPrice(rn(row.value, 2))}</div>
            </div>
          ))}
        </div>

        <div id="tradeDetailsFooter" className="totalLine">
          <div style={{ marginLeft: 5 }}>
            Distance: <span id="tradeDetailsFooterDistance">{distance}</span>
          </div>
          <div style={{ marginLeft: 12 }} data-tip="Total traded units">
            Units: <span id="tradeDetailsFooterUnits">{rn(totalUnits, 2)}</span>
          </div>
          <div style={{ marginLeft: 12 }} data-tip="Total deal value">
            Value: <span id="tradeDetailsFooterValue">{formatPrice(totalValue)}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
