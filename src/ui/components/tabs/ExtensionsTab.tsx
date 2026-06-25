import type React from "react";
import { useExtensionState } from "../../../store/extensionState";

export const ExtensionsTab: React.FC = () => {
  const { extensions, enabledExtensions, toggleExtension } = useExtensionState();

  const extensionList = Object.values(extensions);

  return (
    <div className="tab-content" id="extensionsTabContent">
      <h3 style={{ marginBottom: "1rem" }}>Extensions Manager</h3>
      {extensionList.length === 0 ? (
        <p>No extensions available.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {extensionList.map(ext => {
            const isEnabled = enabledExtensions[ext.id] ?? false;
            return (
              <div key={ext.id} style={{ border: "1px solid #ccc", padding: "10px", borderRadius: "5px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{ext.name}</strong>
                  <button
                    className="options"
                    type="button"
                    style={{ width: "80px", margin: 0, padding: "5px" }}
                    onClick={() => toggleExtension(ext.id)}
                  >
                    {isEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
                <p style={{ fontSize: "0.9em", margin: "5px 0 0 0", color: "#666" }}>{ext.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
