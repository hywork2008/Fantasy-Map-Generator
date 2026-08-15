import type React from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { tip } from "../../services/tooltipService";
import { textureUrlDialogStore, useTextureUrlDialogState } from "../../store/textureUrlDialogState";
import { Dialog } from "./Dialog";

export const TextureUrlDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useTextureUrlDialogState(s => s.isOpen);
  const [url, setUrl] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const close = () => {
    textureUrlDialogStore.getState().close();
    setUrl("");
  };

  const onUrlChange = (value: string) => {
    setUrl(value);
    if (!value) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = value;
  };

  const apply = () => {
    if (!url) {
      tip("Please provide a valid URL", false, "error");
      return;
    }
    textureUrlDialogStore.getState().onApply(url);
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.textureUrl")}
      onClose={close}
      buttons={[
        { label: "Apply", onClick: apply },
        { label: "Cancel", onClick: close }
      ]}
    >
      <div>
        <p>Provide a texture image URL:</p>
        <input
          type="url"
          placeholder="http://www.example.com/image.jpg"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
        />
        <canvas ref={canvasRef} width={256} height={144} />
      </div>
    </Dialog>
  );
};
