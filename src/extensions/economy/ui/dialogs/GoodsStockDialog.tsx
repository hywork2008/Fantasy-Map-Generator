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
          <i className="-goods-stock-dialog__color-888">
            No stock of {goodName} found in any market or burg inventory.
          </i>
        ) : (
          <>
            <div className="header -goods-stock-dialog__grid-template-columns-1-6em-7em-4em">
              <div />
              <div>Location</div>
              <div>Units</div>
            </div>
            <div className="table -goods-stock-dialog__max-height-30em">
              {sources.map((s, _idx) => (
                <div
                  key={`${s.type}-${s.id}`}
                  data-tip="Click to zoom to location"
                  className="states pointer"
                  onClick={() => onZoom(s.x, s.y)}
                >
                  <div
                    className={`\${s.type === "market" ? "icon-store" : "icon-dot-circled"} -goods-stock-dialog__width-1em`}
                  />
                  <div className="-goods-stock-dialog__width-7em">{s.name}</div>
                  <div className="-goods-stock-dialog__width-4em">{s.stock}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
