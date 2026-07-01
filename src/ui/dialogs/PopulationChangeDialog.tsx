import React, { useCallback, useState } from "react";
import { useDialogState } from "../../store/dialogState";
import { rn } from "../../utils/numberUtils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface PopulationChangeConfig {
  [key: string]: unknown;
  title: string;
  description: string;
  initialRural: number;
  initialUrban: number;
  urbanDisabled?: boolean;
  onApply: (rural: number, urban: number) => void;
}

export const PopulationChangeDialog: React.FC = () => {
  const config = useDialogState(s => s.dialogConfigs.populationChangeDialog) as unknown as
    | PopulationChangeConfig
    | undefined;

  const [rural, setRural] = useState(0);
  const [urban, setUrban] = useState(0);

  const handleOpen = useCallback(
    (prev: PopulationChangeConfig | undefined, next: PopulationChangeConfig | undefined) => {
      if (next && next !== prev) {
        setRural(next.initialRural);
        setUrban(next.initialUrban);
      }
    },
    []
  );

  // Reset form values when config changes (new dialog opened)
  const configRef = React.useRef<PopulationChangeConfig | undefined>(undefined);
  if (config !== configRef.current) {
    handleOpen(configRef.current, config);
    configRef.current = config;
  }

  const handleClose = useCallback(() => closeDialog("populationChangeDialog"), []);

  const handleApply = useCallback(() => {
    config?.onApply(rural, urban);
    closeDialog("populationChangeDialog");
  }, [config, rural, urban]);

  if (!config) return null;

  const total = config.initialRural + config.initialUrban;
  const totalNew = rural + urban;
  const perc = total > 0 ? rn((totalNew / total) * 100) : 0;
  const format = (n: number) => Number(n).toLocaleString();

  return (
    <Dialog
      isOpen={true}
      title={config.title}
      onClose={handleClose}
      buttons={[
        { label: "Apply", onClick: handleApply },
        { label: "Cancel", onClick: handleClose }
      ]}
      className="-population-change-dialog__width-24em"
    >
      <div>
        <i>{config.description}</i>
        <div className="-population-change-dialog__margin-0-5em-0">
          Rural:{" "}
          <input
            type="number"
            min={0}
            step={1}
            value={rural}
            className="-population-change-dialog__width-6em"
            onChange={e => setRural(e.target.valueAsNumber)}
          />{" "}
          Urban:{" "}
          <input
            type="number"
            min={0}
            step={1}
            value={urban}
            className="-population-change-dialog__width-6em"
            disabled={config.urbanDisabled}
            onChange={e => setUrban(e.target.valueAsNumber)}
          />
        </div>
        <div>
          Total population: {format(total)} ⇒ {format(Number.isNaN(totalNew) ? total : totalNew)} (
          {Number.isNaN(perc) ? 100 : perc}%)
        </div>
      </div>
    </Dialog>
  );
};
