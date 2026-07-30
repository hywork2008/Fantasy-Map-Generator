import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  disableDynamicExtension,
  enableDynamicExtension,
  installExtensionFromZip,
  uninstallExtension
} from "../../../extensions/dynamicLoader";
import { extensionDB } from "../../../extensions/extensionDB";
import { type ExtensionDependency, useExtensionState } from "../../../store/extensionState";
import { useGenerationProgressState } from "../../../store/generationProgressState";

interface InstalledMeta {
  id: string;
  name: string;
  version: string;
  builtin: boolean;
  dependencies?: ExtensionDependency[];
}

export const ExtensionsTab: React.FC = () => {
  const { extensions, enabledExtensions, toggleExtension, setExtensionMeta } = useExtensionState();
  const [installedMeta, setInstalledMeta] = useState<InstalledMeta[]>([]);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshRequestRef = useRef(0);
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  const canConfigureInitialMap = useGenerationProgressState(
    state => state.isOpen && !state.isGenerating && state.isInitialGeneration
  );
  const generationLockMessage = "Extensions cannot be changed while map generation is in progress.";

  // Merge DB records with zustand-registered extensions to build full list
  const refreshInstalledMeta = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    const dbRecords = await extensionDB.getAll();
    // Multiple registrations occur synchronously during startup, while IndexedDB
    // reads resolve asynchronously. Ignore an earlier read that finishes after a
    // newer one, otherwise it can replace the list with its partial snapshot.
    if (requestId !== refreshRequestRef.current) return;

    const dbIds = new Set(dbRecords.map(r => r.id));
    // Read this after the asynchronous boundary so a refresh started before all
    // built-ins registered still reflects the complete current store.
    const registeredExtensions = useExtensionState.getState().extensions;

    // Built-in extensions are in zustand but not in DB
    const builtins: InstalledMeta[] = Object.values(registeredExtensions)
      .filter(ext => !dbIds.has(ext.id))
      .map(ext => ({ id: ext.id, name: ext.name, version: "built-in", builtin: true, dependencies: ext.dependencies }));

    const dynamic: InstalledMeta[] = dbRecords.map(r => ({
      id: r.id,
      name: r.manifest.name,
      version: r.manifest.version,
      builtin: r.builtin ?? false,
      dependencies: r.manifest.dependencies
    }));

    const merged = [...builtins, ...dynamic].sort((a, b) => a.name.localeCompare(b.name));
    setInstalledMeta(merged);
    // Keep the store's dependency graph (used by toggleExtension's validation) in sync,
    // including extensions that are currently disabled and thus absent from `extensions`.
    setExtensionMeta(merged.map(m => ({ id: m.id, name: m.name, dependencies: m.dependencies })));
  }, [setExtensionMeta]);

  useEffect(() => {
    void refreshInstalledMeta();
    return useExtensionState.subscribe((state, previousState) => {
      if (state.extensions !== previousState.extensions) void refreshInstalledMeta();
    });
  }, [refreshInstalledMeta]);

  const handleInstallClick = () => {
    if (isMapGenerationInProgress) {
      setError(generationLockMessage);
      return;
    }
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isMapGenerationInProgress) return;
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected
    e.target.value = "";
    setInstalling(true);
    setError(null);
    try {
      await installExtensionFromZip(file);
      await refreshInstalledMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error during installation");
    } finally {
      setInstalling(false);
    }
  };

  const handleToggle = async (id: string, isCurrentlyEnabled: boolean, isBuiltin: boolean) => {
    if (isMapGenerationInProgress) {
      setError(generationLockMessage);
      return;
    }
    const nextState = !isCurrentlyEnabled;
    // The store owns the dependency validation (required-on-enable, required-by-others-on-disable);
    // the UI only reacts to whether the toggle was allowed.
    const ok = toggleExtension(id, nextState);
    if (!ok) {
      setError(useExtensionState.getState().toggleError);
      return;
    }
    setError(null);

    if (!isBuiltin) {
      if (nextState) await enableDynamicExtension(id);
      else disableDynamicExtension(id);
    }
  };

  const handleUninstall = async (id: string) => {
    if (isMapGenerationInProgress) {
      setError(generationLockMessage);
      return;
    }
    await uninstallExtension(id);
    await refreshInstalledMeta();
  };

  return (
    <div id="extensionsTabContent" className="tabcontent d-block">
      {/* Install bar */}
      <div className="d-flex">
        <button
          type="button"
          className="options"
          style={{ opacity: installing ? 0.6 : 1 }}
          onClick={handleInstallClick}
          disabled={installing || isMapGenerationInProgress}
          title={isMapGenerationInProgress ? generationLockMessage : undefined}
        >
          {installing ? "Installing…" : "⊕ Install Extension (.zip)"}
        </button>
        <input ref={fileInputRef} type="file" accept=".zip" className="d-none" onChange={handleFileChange} />
      </div>

      {error && <div style={{ color: "var(--danger-color, red)", marginBottom: "8px" }}>{error}</div>}

      {/* Extension list */}
      {installedMeta.length === 0 ? (
        <p>No extensions installed yet.</p>
      ) : (
        <div className="table" style={{ maxHeight: "50vh", overflow: "auto" }}>
          <table className="fmg-table">
            <thead>
              <tr>
                <th>Enabled</th>
                <th>Extension</th>
                <th>Dependencies</th>
                <th>Description</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {installedMeta.map(meta => {
                const isEnabled = enabledExtensions[meta.id] ?? false;
                const desc = extensions[meta.id]?.description;
                const missingReq = meta.dependencies?.filter(d => d.required && !enabledExtensions[d.id]);
                const canEnable = !missingReq?.length;
                const blockingDependent = installedMeta.find(
                  m =>
                    m.id !== meta.id &&
                    enabledExtensions[m.id] &&
                    m.dependencies?.some(d => d.id === meta.id && d.required)
                );
                const canDisable = !blockingDependent;
                const disabled =
                  (isMapGenerationInProgress && !canConfigureInitialMap) || (isEnabled ? !canDisable : !canEnable);
                const toggleTitle = isMapGenerationInProgress
                  ? canConfigureInitialMap
                    ? isEnabled
                      ? canDisable
                        ? "Disable extension"
                        : `Cannot disable: required by ${blockingDependent?.name}`
                      : canEnable
                        ? "Enable extension"
                        : "Missing required dependencies"
                    : generationLockMessage
                  : isEnabled
                    ? canDisable
                      ? "Disable extension"
                      : `Cannot disable: required by ${blockingDependent?.name}`
                    : canEnable
                      ? "Enable extension"
                      : "Missing required dependencies";

                return (
                  <tr key={meta.id} style={{ background: isEnabled ? "var(--bg-light)" : "transparent" }}>
                    <td>
                      {/* Toggle switch */}
                      <label title={toggleTitle} style={{ position: "relative", display: "inline-block" }}>
                        <input
                          type="checkbox"
                          aria-label={`Toggle ${meta.name} extension`}
                          checked={isEnabled}
                          disabled={disabled}
                          onChange={() => handleToggle(meta.id, isEnabled, meta.builtin)}
                        />
                        <span
                          style={{
                            background: isEnabled ? "#4a9e4a" : disabled ? "var(--disabled-color, #666)" : "#aaa",
                            cursor: disabled ? "not-allowed" : "pointer"
                          }}
                        />
                        <span
                          style={{
                            position: "absolute",
                            top: "3px",
                            left: isEnabled ? "19px" : "3px",
                            pointerEvents: "none"
                          }}
                        />
                      </label>
                    </td>

                    <td>
                      {/* Name + version */}
                      <strong>{meta.name}</strong>{" "}
                      <span style={{ background: meta.builtin ? "#e8e8e8" : "#ddeeff" }}>
                        {meta.builtin ? "built-in" : `v${meta.version}`}
                      </span>
                    </td>

                    <td>
                      {/* Dependencies */}
                      {meta.dependencies?.map(dep => {
                        const isMet = enabledExtensions[dep.id];
                        const color = dep.required
                          ? isMet
                            ? "var(--success-color, green)"
                            : "var(--danger-color, red)"
                          : isMet
                            ? "var(--success-color, green)"
                            : "var(--warning-color, orange)";
                        return (
                          <span
                            key={dep.id}
                            style={{ color, marginRight: "6px" }}
                            title={dep.required ? "Required" : "Optional"}
                          >
                            {dep.id}
                            {dep.required ? "*" : ""}
                          </span>
                        );
                      })}
                    </td>

                    <td style={{ whiteSpace: "normal" }}>{desc}</td>

                    <td>
                      {/* Uninstall — only for dynamic (non-builtin) extensions */}
                      {!meta.builtin && (
                        <button
                          type="button"
                          className="options"
                          title="Uninstall this extension"
                          onClick={() => handleUninstall(meta.id)}
                          disabled={isMapGenerationInProgress}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
