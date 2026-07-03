import type React from "react";
import { Dialog } from "../../../hostUi";

import { setGoodsStockDialogState, useGoodsStockDialogState } from "../../store/goodsStockDialogState";

export const GoodsStockDialog: React.FC = () => {
  const isOpen = useGoodsStockDialogState(s => s.isOpen);
  const goodName = useGoodsStockDialogState(s => s.goodName);
  const sources = useGoodsStockDialogState(s => s.sources);
  const onZoom = useGoodsStockDialogState(s => s.onZoom);

  const close = () => setGoodsStockDialogState({ isOpen: false });

  return (
    <Dialog isOpen={isOpen} title={`${goodName} — Stock`} onClose={close}>
      <div id="goodsStockContainer">
        {sources.length === 0 ? (
          <i>No stock of {goodName} found in any market or burg inventory.</i>
        ) : (
          <div className="table">
            <table className="states-table">
              <colgroup>
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="header">
                  <th />
                  <th>Location</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr
                    key={`${s.type}-${s.id}`}
                    data-tip="Click to zoom to location"
                    className="states pointer"
                    onClick={() => onZoom(s.x, s.y)}
                  >
                    <td>
                      <span className={s.type === "market" ? "icon-store" : "icon-dot-circled"} />
                    </td>
                    <td>{s.name}</td>
                    <td>{s.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
};
