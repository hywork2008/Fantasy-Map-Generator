import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, VirtualTableBody } from "../../../hostUi";
import { setGoodsStockDialogState, useGoodsStockDialogState } from "../../store/goodsStockDialogState";

export const GoodsStockDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useGoodsStockDialogState(s => s.isOpen);
  const goodName = useGoodsStockDialogState(s => s.goodName);
  const sources = useGoodsStockDialogState(s => s.sources);
  const onZoom = useGoodsStockDialogState(s => s.onZoom);

  const close = () => setGoodsStockDialogState({ isOpen: false });

  const parentRef = useRef<HTMLDivElement>(null);
  const localizedGoodName = t(`economy.goods.names.${goodName}`, { defaultValue: goodName });

  return (
    <Dialog isOpen={isOpen} title={`${localizedGoodName} — Stock`} onClose={close} className="fmg-dialog--table">
      <div id="goodsStockContainer">
        {sources.length === 0 ? (
          <i>No stock of {localizedGoodName} found in any market or burg inventory.</i>
        ) : (
          <div ref={parentRef} className="table">
            <table className="fmg-table">
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
              <VirtualTableBody
                items={sources}
                scrollElementRef={parentRef}
                renderRow={s => (
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
                )}
              />
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
};
