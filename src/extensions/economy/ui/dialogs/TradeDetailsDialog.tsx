import React from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, IconButton, useDialogState, VirtualTableBody } from "../../../hostUi";
import { formatPrice, rn } from "../../../hostUtils";

import { closeTradeDetails } from "../../controllers/trade-details";
import { useTradeDetailsState } from "../../store/tradeDetailsState";

const ROUTE_MODE_KEYS = {
  land: "extensions.tradeDetails.modeLand",
  water: "extensions.tradeDetails.modeSea",
  sea: "extensions.tradeDetails.modeSea",
  river: "extensions.tradeDetails.modeRiver"
} as const;

export const TradeDetailsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("tradeDetails"));
  const summary = useTradeDetailsState(state => state.summary);
  const rows = useTradeDetailsState(state => state.rows);
  const distance = useTradeDetailsState(state => state.distance);
  const totalUnits = useTradeDetailsState(state => state.totalUnits);
  const totalValue = useTradeDetailsState(state => state.totalValue);
  const transportSummaries = useTradeDetailsState(state => state.transportSummaries);
  const routeLegs = useTradeDetailsState(state => state.routeLegs);
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

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.tradeDetails")}
      className="fmg-dialog--table"
      onClose={() => {
        closeDialog("tradeDetails");
        closeTradeDetails();
      }}
    >
      <div id="tradeDetailsContainer">
        <div id="tradeDetailsSummary" className="totalLine header">
          {summary && (
            <>
              <span>
                <b>{t("extensions.tradeDetails.seller")}</b>: {summary.sellerName}{" "}
                {t(`extensions.tradeDetails.party${summary.sellerType === "market" ? "Market" : "Burg"}`)}{" "}
                <IconButton
                  className="icon-dot-circled pointer"
                  data-tip={t("extensions.tradeDetails.zoomSeller")}
                  onClick={summary.onZoomSeller}
                />
              </span>
              <span>
                <b>{t("extensions.tradeDetails.buyer")}</b>: {summary.buyerName}{" "}
                {t(`extensions.tradeDetails.party${summary.buyerType === "market" ? "Market" : "Burg"}`)}{" "}
                <IconButton
                  className="icon-dot-circled pointer"
                  data-tip={t("extensions.tradeDetails.zoomBuyer")}
                  onClick={summary.onZoomBuyer}
                />
              </span>
            </>
          )}
        </div>

        <div ref={parentRef} id="tradeDetailsBody" className="table">
          <table className="fmg-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="header">
                <th />
                <th
                  data-tip={t("extensions.tradeDetails.goodTip")}
                  className={`sortable alphabetically ${getSortIcon("good", true)} -trade-details-dialog__margin-left-0`}
                  onClick={() => setSorting("good")}
                >
                  {t("extensions.tradeDetails.good")}
                </th>
                <th
                  data-tip={t("extensions.tradeDetails.unitsTip")}
                  className={`sortable ${getSortIcon("units")}`}
                  onClick={() => setSorting("units")}
                >
                  {t("extensions.tradeDetails.units")}
                </th>
                <th
                  data-tip={t("extensions.tradeDetails.priceTip")}
                  className={`sortable ${getSortIcon("price")}`}
                  onClick={() => setSorting("price")}
                >
                  {t("extensions.tradeDetails.price")}
                </th>
                <th
                  data-tip={t("extensions.tradeDetails.valueTip")}
                  className={`sortable ${getSortIcon("value")}`}
                  onClick={() => setSorting("value")}
                >
                  {t("extensions.tradeDetails.value")}
                </th>
                <th data-tip={t("extensions.tradeDetails.unitVolumeTip")}>{t("extensions.tradeDetails.unitVolume")}</th>
                <th data-tip={t("extensions.tradeDetails.volumeTip")}>{t("extensions.tradeDetails.volume")}</th>
              </tr>
            </thead>
            <VirtualTableBody
              items={sortedRows}
              scrollElementRef={parentRef}
              renderRow={row => (
                <tr
                  key={row.dealId}
                  className="states tradeDeal"
                  data-good={row.goodName}
                  data-units={row.units}
                  data-price={row.price}
                  data-value={row.value}
                >
                  <td>
                    <svg
                      aria-label={row.goodName}
                      data-tip={t("extensions.tradeDetails.goodIcon")}
                      width="2em"
                      height="2em"
                      className="goodIcon"
                    >
                      <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                      <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                    </svg>
                  </td>
                  <td data-tip={t("extensions.tradeDetails.goodName")} className="goodName">
                    {row.goodName}
                  </td>
                  <td className="goodUnits">{rn(row.units, 2)}</td>
                  <td className="goodPrice">{formatPrice(rn(row.price, 2))}</td>
                  <td className="goodValue">{formatPrice(rn(row.value, 2))}</td>
                  <td>{rn(row.cargoSlotsPerUnit, 2)}</td>
                  <td>{rn(row.occupiedSlots, 2)}</td>
                </tr>
              )}
            />
          </table>
        </div>

        <div id="tradeDetailsFooter" className="totalLine footer">
          <div>
            {t("extensions.tradeDetails.distance")} <span id="tradeDetailsFooterDistance">{distance}</span>
          </div>
          <div data-tip={t("extensions.tradeDetails.unitsTotalTip")}>
            {t("extensions.tradeDetails.unitsTotal")} <span id="tradeDetailsFooterUnits">{rn(totalUnits, 2)}</span>
          </div>
          <div data-tip={t("extensions.tradeDetails.valueTotalTip")}>
            {t("extensions.tradeDetails.valueTotal")}{" "}
            <span id="tradeDetailsFooterValue">{formatPrice(totalValue)}</span>
          </div>
          {routeLegs.length > 0 && (
            <div data-tip={t("extensions.tradeDetails.routeTip")}>
              {t("extensions.tradeDetails.route")}{" "}
              {routeLegs
                .map(leg =>
                  t("extensions.tradeDetails.routeLeg", {
                    mode: t(ROUTE_MODE_KEYS[leg.mode]),
                    distance: leg.distance
                  })
                )
                .join(" · ")}
            </div>
          )}
          {transportSummaries.map(summary => (
            <div key={`${summary.mode}-${summary.transportName}`} data-tip={t("extensions.tradeDetails.transportTip")}>
              {t("extensions.tradeDetails.transport", {
                mode: t(ROUTE_MODE_KEYS[summary.mode]),
                name: summary.transportName,
                count: summary.unitCount,
                used: summary.usedSlots,
                capacity: summary.capacitySlots,
                free: summary.freeSlots,
                pct: Math.round(summary.utilization * 100)
              })}
              {summary.assetSource ? ` · ${summary.assetSource}` : ""}
              {summary.reservationState ? ` (${summary.reservationState})` : ""}
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
