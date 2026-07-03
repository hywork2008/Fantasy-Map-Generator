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
          <i>No burgs produced {goodName}.</i>
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
                  <th>Burg</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {producers.map(p => (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
};
