import type React from "react";
import { Dialog } from "../../../hostUi";

import { setGoodsProducersDialogState, useGoodsProducersDialogState } from "../../store/goodsProducersDialogState";

export const GoodsProducersDialog: React.FC = () => {
  const isOpen = useGoodsProducersDialogState(s => s.isOpen);
  const goodName = useGoodsProducersDialogState(s => s.goodName);
  const producers = useGoodsProducersDialogState(s => s.producers);
  const onZoom = useGoodsProducersDialogState(s => s.onZoom);

  const close = () => setGoodsProducersDialogState({ isOpen: false });

  return (
    <Dialog isOpen={isOpen} title={`${goodName} — Producers`} onClose={close}>
      <div id="goodsProducersContainer">
        {producers.length === 0 ? (
          <i className="-goods-producers-dialog__color-888">No burgs produced {goodName}.</i>
        ) : (
          <>
            <div className="header" style={{ gridTemplateColumns: "1.6em 7em 4em" }}>
              <div />
              <div>Burg</div>
              <div>Units</div>
            </div>
            <div className="table -goods-producers-dialog__max-height-30em">
              {producers.map(p => (
                <div
                  key={p.id}
                  data-tip="Click to zoom to burg"
                  className="states pointer"
                  onClick={() => onZoom(p.x, p.y)}
                >
                  <div className="icon-dot-circled -goods-producers-dialog__width-1em" />
                  <div className="-goods-producers-dialog__width-7em">{p.name}</div>
                  <div className="-goods-producers-dialog__width-4em">{p.units}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
