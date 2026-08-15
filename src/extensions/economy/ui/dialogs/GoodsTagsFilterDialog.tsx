import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../../hostUi";

import { setGoodsTagsDialogState, useGoodsTagsDialogState } from "../../store/goodsTagsDialogState";

export const GoodsTagsFilterDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useGoodsTagsDialogState(s => s.isOpen);
  const tags = useGoodsTagsDialogState(s => s.tags);
  const activeTags = useGoodsTagsDialogState(s => s.activeTags);
  const onApply = useGoodsTagsDialogState(s => s.onApply);

  const [localActive, setLocalActive] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) setLocalActive(activeTags);
  }, [isOpen, activeTags]);

  const close = () => setGoodsTagsDialogState({ isOpen: false });

  const toggleTag = (tag: string) => {
    setLocalActive(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  const handleApply = () => {
    onApply(localActive);
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.filterByTags")}
      onClose={close}
      buttons={[
        { label: t("common.apply"), onClick: handleApply },
        { label: t("common.cancel"), onClick: close }
      ]}
    >
      <div id="goodsTagsContainer" className="fmg-dialog-content overflow-hidden">
        {tags.length === 0 ? (
          <div className="header">{t("extensions.goodsTags.empty")}</div>
        ) : (
          <div data-tip={t("extensions.goodsTags.filterTip")} className="table d-grid">
            {tags.map(tag => (
              <label key={tag} className="d-flex">
                <input
                  type="checkbox"
                  className="native"
                  checked={localActive.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />{" "}
                {tag}
              </label>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
};
