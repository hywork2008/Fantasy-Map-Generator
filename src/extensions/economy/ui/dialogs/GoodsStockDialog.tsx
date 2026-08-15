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
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.goodsStock", { name: localizedGoodName })}
      onClose={close}
      className="fmg-dialog--table"
    >
      <div id="goodsStockContainer">
        {sources.length === 0 ? (
          <i>{t("extensions.goodsStock.empty", { name: localizedGoodName })}</i>
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
                  <th>{t("extensions.goodsStock.location")}</th>
                  <th>{t("extensions.goodsStock.units")}</th>
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
