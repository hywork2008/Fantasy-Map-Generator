import { type FC, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBurgEditorState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { getBurgMarketSnapshot } from "../../controllers/characterMarket";
import { formatRetailQuantity } from "../../generators/goodsTradeLots";
import { GoodIcon } from "./GoodIcon";

/** Read-only retail stock available in the burg currently open in Edit Burg. */
export const BurgEditorGoodsTab: FC = () => {
  const { t } = useTranslation();
  const burgId = useBurgEditorState(state => state.burgData?.id);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const refresh = () => setRefreshToken(token => token + 1);
    document.addEventListener("fmg:time-advance-completed", refresh);
    return () => document.removeEventListener("fmg:time-advance-completed", refresh);
  }, []);

  // Market and inventory records mutate in place; refreshToken deliberately re-reads them after time advances.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken forces a fresh read of mutable market records
  const snapshot = useMemo(() => (burgId === undefined ? null : getBurgMarketSnapshot(burgId)), [burgId, refreshToken]);
  const stockedRows = useMemo(() => snapshot?.rows.filter(row => row.availableStock > 0) ?? [], [snapshot]);

  if (!snapshot) {
    return (
      <div id="burgGoodsTab" role="status">
        This burg does not have an active market.
      </div>
    );
  }

  if (!stockedRows.length) {
    return (
      <div id="burgGoodsTab" role="status">
        No goods are currently available on this burg's market shelves.
      </div>
    );
  }

  return (
    <div id="burgGoodsTab">
      <p data-tip="These are the quantities immediately available for a character to buy in this burg. Prices are the local retail prices used by Trade.">
        {snapshot.marketName} market inventory
      </p>
      <div className="table" style={{ overflow: "auto" }}>
        <table id="burgGoodsTable" className="fmg-table">
          <thead>
            <tr>
              <th scope="col">Good</th>
              <th scope="col">Merchant</th>
              <th scope="col">Available locally</th>
              <th scope="col">Ask</th>
              <th scope="col">Bid</th>
            </tr>
          </thead>
          <tbody>
            {stockedRows.map(row => {
              const goodName = t(`economy.goods.names.${row.goodName}`, { defaultValue: row.goodName });
              return (
                <tr key={row.goodId}>
                  <td title={row.unit}>
                    <GoodIcon icon={row.goodIcon} size="1.3em" /> {goodName}
                  </td>
                  <td>{row.merchantName}</td>
                  <td>{formatRetailQuantity(row.availableStock, row.retailLotSize)}</td>
                  <td>{formatPrice(row.buyPrice)}</td>
                  <td>{formatPrice(row.sellPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
