import type React from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  connectSimChannel,
  disconnectSimChannel,
  getConnectedSimChannel,
  subscribeSimChannelConnection
} from "../../io/simChannelConnection";
import { type ChannelInfo, deleteSimChannel, listSimChannels } from "../../io/simServer";
import { tip } from "../../services/tooltipService";
import { dialogStore, useDialogState } from "../../store/dialogState";
import { useGenerationProgressState } from "../../store/generationProgressState";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";

export const SIM_CHANNELS_DIALOG_ID = "simChannels";

/**
 * Lists the simulation server's channels; connect loads and follows one, delete removes it
 * for everyone. Opens by itself once per page when map creation starts and channels exist.
 */
export const SimChannelsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has(SIM_CHANNELS_DIALOG_ID));
  const isGenerationOpen = useGenerationProgressState(state => state.isOpen);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const offered = useRef(false);
  const current = useSyncExternalStore(subscribeSimChannelConnection, getConnectedSimChannel);

  const refresh = useCallback(() => listSimChannels().then(setChannels), []);

  useEffect(() => {
    if (!isGenerationOpen || offered.current) return;
    offered.current = true;
    void listSimChannels().then(list => {
      setChannels(list);
      if (list.length) dialogStore.getState().openDialog(SIM_CHANNELS_DIALOG_ID);
    });
  }, [isGenerationOpen]);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  const close = () => closeDialog(SIM_CHANNELS_DIALOG_ID);

  const connect = (channel: ChannelInfo) => {
    close();
    void connectSimChannel(channel.id).then(() =>
      tip(t("dialogs.simChannels.connected", { name: channel.name, id: channel.id }), true, "success", 6000)
    );
  };

  const disconnect = () => {
    const id = current;
    disconnectSimChannel();
    if (id) tip(t("dialogs.simChannels.disconnected", { id }), true, "success", 6000);
  };

  const remove = (channel: ChannelInfo) =>
    openConfirm(t("dialogs.simChannels.deleteConfirm", { name: channel.name, id: channel.id }), {
      title: t("dialogs.simChannels.delete"),
      confirm: t("dialogs.simChannels.delete"),
      cancel: t("common.cancel"),
      onConfirm: () =>
        void deleteSimChannel(channel.id).then(refresh, (error: Error) => tip(error.message, true, "error", 8000))
    });

  const formatDate = (date: ChannelInfo["date"]) => (date ? `${date.year}-${date.month}-${date.day}` : "—");

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.simChannels.title")}
      onClose={close}
      buttons={[
        { label: t("dialogs.simChannels.refresh"), onClick: () => void refresh() },
        { label: t("common.close"), onClick: close }
      ]}
    >
      {current && <p>{t("dialogs.simChannels.connectedTo", { id: current })}</p>}
      {channels.length === 0 ? (
        <p>{t("dialogs.simChannels.empty")}</p>
      ) : (
        <table className="fmg-table">
          <thead>
            <tr>
              <th>{t("dialogs.simChannels.name")}</th>
              <th>{t("dialogs.simChannels.id")}</th>
              <th>{t("dialogs.simChannels.date")}</th>
              <th>{t("dialogs.simChannels.burgs")}</th>
              <th>{t("dialogs.simChannels.revision")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {channels.map(channel => (
              <tr key={channel.id}>
                <td>{channel.name}</td>
                <td>{channel.id}</td>
                <td>{formatDate(channel.date)}</td>
                <td>{channel.counts?.burgs ?? "—"}</td>
                <td>{channel.revision}</td>
                <td>
                  {current === channel.id ? (
                    <button type="button" onClick={disconnect}>
                      {t("dialogs.simChannels.disconnect")}
                    </button>
                  ) : (
                    <button type="button" onClick={() => connect(channel)}>
                      {t("dialogs.simChannels.connect")}
                    </button>
                  )}{" "}
                  <button type="button" onClick={() => remove(channel)}>
                    {t("dialogs.simChannels.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>{t("dialogs.simChannels.note")}</p>
    </Dialog>
  );
};
