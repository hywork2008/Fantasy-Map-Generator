import type React from "react";
import { useState } from "react";
import { addGoogleFont, addLocalFont, addWebFont, fonts } from "../../services/fonts";
import { useDialogState } from "../../store/dialogState";
import { tip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const FontDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("addFontDialog"));
  const [method, setMethod] = useState("googleFont");
  const [family, setFamily] = useState("");
  const [src, setSrc] = useState("");

  const handleAdd = () => {
    if (!family) return tip("Please provide a font name", false, "error");

    const existingFont =
      method === "fontURL"
        ? fonts.find(font => font.family === family && font.src === src)
        : fonts.find(font => font.family === family);
    if (existingFont) return tip("The font is already added", false, "error");

    if (method === "fontURL") addWebFont(family, src);
    else if (method === "googleFont") addGoogleFont(family);
    else if (method === "localFont") addLocalFont(family);

    setFamily("");
    setSrc("");
    closeDialog("addFontDialog");
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Add custom font"
      onClose={() => closeDialog("addFontDialog")}
      buttons={[
        { label: "Add", onClick: handleAdd },
        { label: "Cancel", onClick: () => closeDialog("addFontDialog") }
      ]}
    >
      <span>There are 3 ways to add a custom font:</span>
      <p>
        <strong>Google font</strong>. Open{" "}
        <a href="https://fonts.google.com/" target="_blank" rel="noreferrer">
          Google Fonts
        </a>
        , find a font you like and enter its name to the field below.
      </p>
      <p>
        <strong>Local font</strong>. If you have a font{" "}
        <a
          href="https://faqs.skillcrush.com/article/275-downloading-installing-a-font-on-your-computer"
          target="_blank"
          rel="noreferrer"
        >
          installed on your computer
        </a>
        , just provide the font name. Make sure the browser is reloaded after the installation. The font won't work on
        machines not having it installed. Good source of fonts are{" "}
        <a href="https://fontesk.com" target="_blank" rel="noreferrer">
          Fontdesk
        </a>{" "}
        and{" "}
        <a href="https://www.dafont.com" target="_blank" rel="noreferrer">
          DaFont
        </a>
        .
      </p>
      <p>
        <strong>Font URL</strong>. Provide font name and link to the font file hosted online. The best free font
        hostings are{" "}
        <a href="https://fonts.google.com/" target="_blank" rel="noreferrer">
          Google Fonts
        </a>{" "}
        and{" "}
        <a target="_blank" href="https://www.cdnfonts.com" rel="noreferrer">
          CDN Fonts
        </a>
        . To get font file open the link to css provided by these services and manually copy the link to{" "}
        <code>woff2</code> of desired variant. To add another variant (e.g. Cyrillic), add the font one more time under
        the same name, but with another URL
      </p>
      <div style={{ marginTop: "0.3em" }} data-tip="Select font adding method">
        <select id="addFontMethod" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="googleFont">Google font</option>
          <option value="localFont">Local font</option>
          <option value="fontURL">Font URL</option>
        </select>
        <input
          id="addFontNameInput"
          placeholder="font family"
          style={{ width: "15em" }}
          value={family}
          onChange={e => setFamily(e.target.value)}
        />
        <div>
          <input
            id="addFontURLInput"
            placeholder="font file URL"
            style={{ width: "22.6em", marginTop: "0.1em", display: method === "fontURL" ? "inline" : "none" }}
            value={src}
            onChange={e => setSrc(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
};
