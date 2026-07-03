import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  disableDynamicExtension,
  enableDynamicExtension,
  installExtensionFromZip,
  uninstallExtension
} from "../../../extensions/dynamicLoader";
import { extensionDB } from "../../../extensions/extensionDB";
import { useExtensionState } from "../../../store/extensionState";

interface InstalledMeta {
  id: string;
  name: string;
  version: string;
  builtin: boolean;
}

export const ExtensionsTab: React.FC = () => {
  const { extensions, enabledExtensions, toggleExtension } = useExtensionState();
  const [installedMeta, setInstalledMeta] = useState<InstalledMeta[]>([]);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Merge DB records with zustand-registered extensions to build full list
  const refreshInstalledMeta = useCallback(async () => {
    const dbRecords = await extensionDB.getAll();
    const dbIds = new Set(dbRecords.map(r => r.id));

    // Built-in extensions are in zustand but not in DB
    const builtins: InstalledMeta[] = Object.values(extensions)
      .filter(ext => !dbIds.has(ext.id))
      .map(ext => ({ id: ext.id, name: ext.name, version: "built-in", builtin: true }));

    const dynamic: InstalledMeta[] = dbRecords.map(r => ({
      id: r.id,
      name: r.manifest.name,
      version: r.manifest.version,
      builtin: r.builtin ?? false
    }));

    setInstalledMeta([...builtins, ...dynamic].sort((a, b) => a.name.localeCompare(b.name)));
  }, [extensions]);

  useEffect(() => {
    refreshInstalledMeta();
  }, [refreshInstalledMeta]);

  const handleInstallClick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleToggle = async (id: string, isEnabled: boolean, isBuiltin: boolean) => {
    if (isBuiltin) {
      // Built-in extensions are toggled through extensionState only (no DOM injection)
      toggleExtension(id);
    } else if (isEnabled) {
      // Disable: eject script/style and remove from zustand
      disableDynamicExtension(id);
      toggleExtension(id, false);
    } else {
      // Enable: re-inject script/style
      await enableDynamicExtension(id);
      toggleExtension(id, true);
    }
  };

  const handleUninstall = async (id: string) => {
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
          disabled={installing}
        >
          {installing ? "Installing…" : "⊕ Install Extension (.zip)"}
        </button>
        <input ref={fileInputRef} type="file" accept=".zip" className="d-none" onChange={handleFileChange} />
      </div>

      {error && <div>{error}</div>}

      {/* Extension list */}
      {installedMeta.length === 0 ? (
        <p>No extensions installed yet.</p>
      ) : (
        <div className="d-flex">
          {installedMeta.map(meta => {
            const isEnabled = enabledExtensions[meta.id] ?? false;
            const desc = extensions[meta.id]?.description;

            return (
              <div key={meta.id} style={{ background: isEnabled ? "var(--tab-bg-active, #f5f5f5)" : "transparent" }}>
                <div>
                  {/* Toggle switch */}
                  <label title={isEnabled ? "Disable extension" : "Enable extension"}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggle(meta.id, isEnabled, meta.builtin)}
                    />
                    <span style={{ background: isEnabled ? "#4a9e4a" : "#aaa", cursor: "pointer" }} />
                    <span
                      style={{
                        position: "absolute",
                        top: "3px",
                        left: isEnabled ? "19px" : "3px",
                        pointerEvents: "none"
                      }}
                    />
                  </label>

                  {/* Name + version */}
                  <div>
                    <strong>{meta.name}</strong>
                    <span style={{ background: meta.builtin ? "#e8e8e8" : "#ddeeff" }}>
                      {meta.builtin ? "built-in" : `v${meta.version}`}
                    </span>
                  </div>

                  {/* Uninstall — only for dynamic (non-builtin) extensions */}
                  {!meta.builtin && (
                    <button
                      type="button"
                      className="options"
                      title="Uninstall this extension"
                      onClick={() => handleUninstall(meta.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {desc && <p>{desc}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
