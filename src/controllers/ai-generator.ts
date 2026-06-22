import { modules } from "../store/editorState";
import { openDialog } from "../ui/dialogs/dialogService";
import { openURL } from "../utils";
import { ERROR } from "../utils/debug";
import { tip } from "../utils/uiHelpers";

interface AiProviderConfig {
  keyLink: string;
  generate: (params: {
    key: string;
    model: string;
    prompt: string;
    temperature: number;
    onContent: (c: string) => void;
  }) => Promise<void>;
}

const PROVIDERS: Record<string, AiProviderConfig> = {
  openai: {
    keyLink: "https://platform.openai.com/account/api-keys",
    generate: generateWithOpenAI
  },
  anthropic: {
    keyLink: "https://console.anthropic.com/account/keys",
    generate: generateWithAnthropic
  },
  ollama: {
    keyLink: "https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Ollama-text-generation",
    generate: generateWithOllama
  }
};

const DEFAULT_MODEL = "gpt-4o-mini";

const MODELS: Record<string, string> = {
  "gpt-4o-mini": "openai",
  "chatgpt-4o-latest": "openai",
  "gpt-4o": "openai",
  "gpt-4-turbo": "openai",
  o3: "openai",
  "o3-mini": "openai",
  "o3-pro": "openai",
  "o4-mini": "openai",
  "claude-opus-4-20250514": "anthropic",
  "claude-sonnet-4-20250514": "anthropic",
  "claude-3-5-haiku-latest": "anthropic",
  "claude-3-5-sonnet-latest": "anthropic",
  "claude-3-opus-latest": "anthropic",
  "ollama (local models)": "ollama"
};

const SYSTEM_MESSAGE = "I'm working on my fantasy map.";

async function generateWithOpenAI({
  key,
  model,
  prompt,
  temperature,
  onContent
}: {
  key: string;
  model: string;
  prompt: string;
  temperature: number;
  onContent: (c: string) => void;
}): Promise<void> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`
  };

  const messages = [
    { role: "system", content: SYSTEM_MESSAGE },
    { role: "user", content: prompt }
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, temperature, stream: true })
  });

  const getContent = (json: unknown) => {
    const data = json as { choices?: { delta?: { content?: string } }[] };
    const content = data.choices?.[0]?.delta?.content;
    if (content) onContent(content);
  };

  await handleStream(response, getContent);
}

async function generateWithAnthropic({
  key,
  model,
  prompt,
  temperature,
  onContent
}: {
  key: string;
  model: string;
  prompt: string;
  temperature: number;
  onContent: (c: string) => void;
}): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  };

  const messages = [{ role: "user", content: prompt }];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, system: SYSTEM_MESSAGE, messages, temperature, max_tokens: 4096, stream: true })
  });

  const getContent = (json: unknown) => {
    const data = json as { delta?: { text?: string } };
    const content = data.delta?.text;
    if (content) onContent(content);
  };

  await handleStream(response, getContent);
}

async function generateWithOllama({
  key,
  model: _model,
  prompt,
  temperature,
  onContent
}: {
  key: string;
  model: string;
  prompt: string;
  temperature: number;
  onContent: (c: string) => void;
}): Promise<void> {
  const ollamaModelName = key;

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModelName,
      prompt,
      system: SYSTEM_MESSAGE,
      options: { temperature },
      stream: true
    })
  });

  const getContent = (json: unknown) => {
    const data = json as { response?: string };
    if (data.response) onContent(data.response);
  };

  await handleStream(response, getContent);
}

async function handleStream(response: Response, getContent: (json: unknown) => void): Promise<void> {
  if (!response.ok) {
    let errorMessage = `Failed to generate (${response.status} ${response.statusText})`;
    try {
      const json = await response.json();
      errorMessage = json.error?.message || json.error || errorMessage;
    } catch (error) {
      ERROR && console.error("Failed to parse AI provider error response", error);
    }
    throw new Error(errorMessage);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line === "data: [DONE]") break;

      try {
        const parsed = line.startsWith("data: ") ? JSON.parse(line.slice(6)) : JSON.parse(line);
        getContent(parsed);
      } catch (error) {
        ERROR && console.error("Failed to parse line:", line, error);
      }
    }

    buffer = lines.at(-1) ?? "";
  }
}

export function generateWithAi(defaultPrompt: string, onApply: (result: string) => void): void {
  updateValues();

  openDialog("aiGenerator", {
    title: "AI Text Generator",
    position: { my: "center", at: "center", of: "svg" },
    resizable: false,
    buttons: {
      Generate: (e?: Event) => {
        generate((e as Event).target as HTMLButtonElement);
      },
      Apply: () => {
        const result = (document.getElementById("aiGeneratorResult") as HTMLTextAreaElement).value;
        if (!result) return tip("No result to apply", true, "error", 4000);
        onApply(result);
        /* $(this).dialog("close") removed */
      },
      Close: () => {
        /* $(this).dialog("close") removed */
      }
    }
  });

  if (modules.generateWithAi) return;
  modules.generateWithAi = true;

  document.getElementById("aiGeneratorKeyHelp")!.addEventListener("click", () => {
    const model = (document.getElementById("aiGeneratorModel") as HTMLSelectElement).value;
    const provider = MODELS[model];
    openURL(PROVIDERS[provider].keyLink);
  });

  function updateValues(): void {
    (document.getElementById("aiGeneratorResult") as HTMLTextAreaElement).value = "";
    (document.getElementById("aiGeneratorPrompt") as HTMLTextAreaElement).value = defaultPrompt;
    (document.getElementById("aiGeneratorTemperature") as HTMLInputElement).value =
      localStorage.getItem("fmg-ai-temperature") || "1";

    const selectEl = document.getElementById("aiGeneratorModel") as HTMLSelectElement;
    selectEl.options.length = 0;
    for (const model of Object.keys(MODELS)) selectEl.options.add(new Option(model, model));
    selectEl.value = localStorage.getItem("fmg-ai-model") || "";
    if (!selectEl.value || !MODELS[selectEl.value]) selectEl.value = DEFAULT_MODEL;

    const provider = MODELS[selectEl.value];
    (document.getElementById("aiGeneratorKey") as HTMLInputElement).value =
      localStorage.getItem(`fmg-ai-kl-${provider}`) || "";
  }

  async function generate(button: HTMLButtonElement): Promise<void> {
    const key = (document.getElementById("aiGeneratorKey") as HTMLInputElement).value;
    if (!key) return tip("Please enter an API key", true, "error", 4000);

    const model = (document.getElementById("aiGeneratorModel") as HTMLSelectElement).value;
    if (!model) return tip("Please select a model", true, "error", 4000);
    localStorage.setItem("fmg-ai-model", model);

    const provider = MODELS[model];
    localStorage.setItem(`fmg-ai-kl-${provider}`, key);

    const prompt = (document.getElementById("aiGeneratorPrompt") as HTMLTextAreaElement).value;
    if (!prompt) return tip("Please enter a prompt", true, "error", 4000);

    const temperature = (document.getElementById("aiGeneratorTemperature") as HTMLInputElement).valueAsNumber;
    if (Number.isNaN(temperature)) return tip("Temperature must be a number", true, "error", 4000);
    localStorage.setItem("fmg-ai-temperature", String(temperature));

    try {
      button.disabled = true;
      const resultArea = document.getElementById("aiGeneratorResult") as HTMLTextAreaElement;
      resultArea.disabled = true;
      resultArea.value = "";
      const onContent = (content: string) => (resultArea.value += content);

      await PROVIDERS[provider].generate({ key, model, prompt, temperature, onContent });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error) || "Failed to generate text";
      return tip(message, true, "error", 4000);
    } finally {
      button.disabled = false;
      (document.getElementById("aiGeneratorResult") as HTMLTextAreaElement).disabled = false;
    }
  }
}
