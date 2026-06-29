import type React from "react";
import { useEffect, useState } from "react";
import { AI_MODELS, AI_PROVIDERS } from "../../controllers/ai-generator";
import { useAiGeneratorState } from "../../store/aiGeneratorState";
import { useDialogState } from "../../store/dialogState";
import { openURL } from "../../utils";
import { tip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const AiGeneratorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("aiGenerator"));
  const {
    prompt,
    result,
    model,
    temperature,
    apiKey,
    onApply,
    setPrompt,
    setResult,
    setModel,
    setTemperature,
    setApiKey
  } = useAiGeneratorState();

  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const providerName = AI_MODELS[model];
      if (providerName) {
        const key = localStorage.getItem(`fmg-ai-kl-${providerName}`) || "";
        setApiKey(key);
      }
    }
  }, [isOpen, model, setApiKey]);

  const handleGenerate = async () => {
    if (!apiKey) return tip("Please enter an API key", true, "error", 4000);
    if (!model) return tip("Please select a model", true, "error", 4000);
    if (!prompt) return tip("Please enter a prompt", true, "error", 4000);
    if (Number.isNaN(temperature)) return tip("Temperature must be a number", true, "error", 4000);

    const providerName = AI_MODELS[model];
    const provider = AI_PROVIDERS[providerName];
    if (!provider) return tip("Invalid provider configuration", true, "error", 4000);

    localStorage.setItem(`fmg-ai-kl-${providerName}`, apiKey);

    try {
      setIsGenerating(true);
      setResult("");
      await provider.generate({
        key: apiKey,
        model,
        prompt,
        temperature,
        onContent: content => setResult(prev => prev + content)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error) || "Failed to generate text";
      tip(message, true, "error", 4000);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApply = () => {
    if (!result) return tip("No result to apply", true, "error", 4000);
    if (onApply) onApply(result);
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setModel(newModel);
    const providerName = AI_MODELS[newModel];
    if (providerName) {
      const key = localStorage.getItem(`fmg-ai-kl-${providerName}`) || "";
      setApiKey(key);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="AI Text Generator"
      onClose={() => closeDialog("aiGenerator")}
      buttons={[
        { label: "Generate", onClick: handleGenerate },
        { label: "Apply", onClick: handleApply },
        { label: "Close", onClick: () => closeDialog("aiGenerator") }
      ]}
    >
      <div id="aiGeneratorContainer">
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3em", width: "100%" }}>
            <textarea
              id="aiGeneratorResult"
              placeholder="Generated text will appear here"
              cols={30}
              rows={10}
              value={result}
              onChange={e => setResult(e.target.value)}
              disabled={isGenerating}
            />
            <textarea
              id="aiGeneratorPrompt"
              placeholder="Type a prompt here"
              cols={30}
              rows={5}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
              <label htmlFor="aiGeneratorModel">
                Model:
                <select id="aiGeneratorModel" value={model} onChange={handleModelChange}>
                  {Object.keys(AI_MODELS).map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label
                htmlFor="aiGeneratorTemperature"
                data-tip="Temperature controls response randomness; higher values mean more creativity, lower values mean more predictability"
              >
                Temperature:
                <input
                  id="aiGeneratorTemperature"
                  type="number"
                  min={-1}
                  max={2}
                  step=".1"
                  className="icon-key"
                  value={temperature}
                  onChange={e => setTemperature(e.target.valueAsNumber)}
                />
              </label>
              <label htmlFor="aiGeneratorKey">
                Key:
                <input
                  id="aiGeneratorKey"
                  placeholder="Enter API key"
                  className="icon-key"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  data-tip="Enter API key. Note: the Generator doesn't store the key or any generated data"
                />
                <button
                  type="button"
                  id="aiGeneratorKeyHelp"
                  className="icon-help-circled"
                  data-tip="Click to see the usage instructions"
                  onClick={() => openURL(AI_PROVIDERS[AI_MODELS[model]]?.keyLink)}
                ></button>
              </label>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
