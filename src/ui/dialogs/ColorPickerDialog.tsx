import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorPickerDialogState } from "../../store/colorPickerDialogState";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const HATCH_COUNT = 42;
const DEFAULT_COLOR = "#ffffff";

function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export const ColorPickerDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("colorPicker"));
  const { fill, callback } = useColorPickerDialogState();
  const [hex, setHex] = useState(DEFAULT_COLOR);

  useEffect(() => {
    if (isOpen) setHex(isHexColor(fill) ? fill : DEFAULT_COLOR);
  }, [isOpen, fill]);

  const hatchIds = useMemo(() => Array.from({ length: HATCH_COUNT }, (_, i) => `hatch${i}`), []);

  const handleColorChange = (value: string) => {
    setHex(value);
    callback?.(value);
  };

  const handleHatchClick = (id: string) => {
    callback?.(`url(#${id})`);
  };

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.colorPicker")} onClose={() => closeDialog("colorPicker")}>
      <div id="colorPickerBody">
        <div className="editor-row">
          <label htmlFor="colorPickerInput">Color:</label>
          <input id="colorPickerInput" type="color" value={hex} onChange={e => handleColorChange(e.target.value)} />
        </div>

        <div className="editor-row">
          <p>Hatching:</p>
          <div id="colorPickerHatches" className="d-flex" style={{ flexWrap: "wrap", gap: "2px", maxWidth: 320 }}>
            {hatchIds.map(id => {
              const selected = fill === `url(#${id})`;
              return (
                <svg
                  key={id}
                  width={20}
                  height={20}
                  role="img"
                  aria-label={`Fill with hatching ${id}`}
                  onClick={() => handleHatchClick(id)}
                  style={{ cursor: "pointer", border: selected ? "1px solid #333" : "1px solid #ccc" }}
                >
                  <title>{`Fill with hatching ${id}`}</title>
                  <rect width={20} height={20} fill={`url(#${id})`} />
                </svg>
              );
            })}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
