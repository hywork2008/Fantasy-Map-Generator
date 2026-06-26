import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const AiGeneratorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("aiGenerator"));

  return (
    <Dialog isOpen={isOpen} title="AiGenerator" onClose={() => closeDialog("aiGenerator")}>
      <div id="aiGeneratorContainer">
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3em", width: "100%" }}>
            <textarea
              id="aiGeneratorResult"
              placeholder="Generated text will appear here"
              cols={30}
              rows={10}
              defaultValue={""}
            />
            <textarea id="aiGeneratorPrompt" placeholder="Type a prompt here" cols={30} rows={5} defaultValue={""} />
            <div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
              <label htmlFor="aiGeneratorModel">
                Model:
                <select id="aiGeneratorModel" />
              </label>
              <label
                htmlFor="aiGeneratorTemperature"
                data-tip="Temperature controls response randomness; higher values mean more creativity, lower values mean more predictability"
              >
                Temperature:
                <input id="aiGeneratorTemperature" type="number" min={-1} max={2} step=".1" className="icon-key" />
              </label>
              <label htmlFor="aiGeneratorKey">
                Key:
                <input
                  id="aiGeneratorKey"
                  placeholder="Enter API key"
                  className="icon-key"
                  data-tip="Enter API key. Note: the Generator doesn't store the key or any generated data"
                />
                <button
                  type="button"
                  id="aiGeneratorKeyHelp"
                  className="icon-help-circled"
                  data-tip="Click to see the usage instructions"
                ></button>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
