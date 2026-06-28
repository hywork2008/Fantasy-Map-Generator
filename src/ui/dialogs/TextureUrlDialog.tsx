import type React from "react";
import { useRef, useState } from "react";
import { textureUrlDialogStore, useTextureUrlDialogState } from "../../store/textureUrlDialogState";
import { tip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";

export const TextureUrlDialog: React.FC = () => {
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
      title="Load custom texture"
      onClose={close}
      buttons={[
        { label: "Apply", onClick: apply },
        { label: "Cancel", onClick: close }
      ]}
    >
      <div>
        <p style={{ margin: "0 0 0.4em" }}>Provide a texture image URL:</p>
        <input
          type="url"
          style={{ width: "100%" }}
          placeholder="http://www.example.com/image.jpg"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
        />
        <canvas ref={canvasRef} width={256} height={144} style={{ marginTop: "0.5em" }} />
      </div>
    </Dialog>
  );
};
