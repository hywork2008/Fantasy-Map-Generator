export type StartupInitDeps = {
  document: Document;
  locationHostname: string;
  alertMessage: HTMLElement;
  jqueryDialog: (options: {
    resizable: boolean;
    title: string;
    width: string;
    position: { my: string; at: string; of: string };
    buttons: { OK: () => void };
  }) => void;
  hideLoading: () => void;
  checkLoadParameters: () => Promise<void>;
  restoreDefaultEvents: () => void;
  initiateAutosave: () => void;
  initTourPromptButton: () => void;
};

type JqueryDialogHost = {
  dialog: (action: string) => void;
};

const jqueryRuntime = window as Window & {
  $: (target: unknown) => JqueryDialogHost;
};

export function initStartupOnDomContentLoaded({
  document,
  locationHostname,
  alertMessage,
  jqueryDialog,
  hideLoading,
  checkLoadParameters,
  restoreDefaultEvents,
  initiateAutosave,
  initTourPromptButton
}: StartupInitDeps) {
  const onDomReady = async () => {
    if (!locationHostname) {
      const wiki = "https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Run-FMG-locally";
      alertMessage.innerHTML = `Fantasy Map Generator cannot run serverless. Follow the <a href="${wiki}" target="_blank">instructions</a> on how you can easily run a local web-server`;

      jqueryDialog({
        resizable: false,
        title: "Loading error",
        width: "28em",
        position: { my: "center center-4em", at: "center", of: "svg" },
        buttons: {
          OK: function () {
            jqueryRuntime.$(this).dialog("close");
          }
        }
      });
    } else {
      hideLoading();
      await checkLoadParameters();
    }

    restoreDefaultEvents();
    initiateAutosave();
    initTourPromptButton();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void onDomReady();
    });
    return;
  }

  void onDomReady();
}