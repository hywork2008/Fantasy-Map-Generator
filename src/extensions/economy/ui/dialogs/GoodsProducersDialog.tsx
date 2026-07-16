import type React from "react";
import { useRef } from "react";
import { Dialog, VirtualTableBody } from "../../../hostUi";
import { setGoodsProducersDialogState, useGoodsProducersDialogState } from "../../store/goodsProducersDialogState";

export const GoodsProducersDialog: React.FC = () => {
  const isOpen = useGoodsProducersDialogState(s => s.isOpen);
  const goodName = useGoodsProducersDialogState(s => s.goodName);
  const producers = useGoodsProducersDialogState(s => s.producers);
  const onZoom = useGoodsProducersDialogState(s => s.onZoom);

  const close = () => setGoodsProducersDialogState({ isOpen: false });

  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog isOpen={isOpen} title={`${goodName} — Producers`} onClose={close} className="fmg-dialog--table">
      <div id="goodsProducersContainer">
        {producers.length === 0 ? (
          <i>No burgs produced {goodName}.</i>
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
                  <th>Burg</th>
                  <th>Units</th>
                </tr>
              </thead>
              <VirtualTableBody
                items={producers}
                scrollElementRef={parentRef}
                renderRow={p => (
                  <tr
                    key={p.id}
                    data-tip="Click to zoom to burg"
                    className="states pointer"
                    onClick={() => onZoom(p.x, p.y)}
                  >
                    <td>
                      <span className="icon-dot-circled" />
                    </td>
                    <td>{p.name}</td>
                    <td>{p.units}</td>
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
