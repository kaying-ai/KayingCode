// 发送链路：草稿、斜杠命令语义、队列裁决、新建会话。
//
// 三条纪律：
// - ACK 未知（断线）时草稿保留，pending 条目留给重连对账收口，绝不自动重发；
// - 斜杠命令先于普通发送判定（/compact 与 /goal 是 maintenance 命令，不是文本）；
// - 队列裁决取 inputRouting.mode=choice 的当前队列快照，回传用户确认时看到的
//   queueItemId 集合，避免并发增删后被处置了没确认过的条目。
import { useState } from "react";
import Taro from "@tarojs/taro";
import { ChannelAttachments, runMobileSlashCommand } from "@kayingcode/mobile-client-core";
import { flow } from "../../flow/store";
import { pickMobileFiles, type PickedMobileFile } from "../../ports/filePicker";
import type { SlashEntry } from "./sheets";
import type { useChatController } from "./useChatController";

type ChatController = ReturnType<typeof useChatController>;

export function useChatSend({
  chat,
  sessionId,
  setSessionId,
}: {
  chat: ChatController;
  sessionId: string | null;
  setSessionId: (sessionId: string | null) => void;
}) {
  const [draftText, setDraftText] = useState("");
  const [files, setFiles] = useState<PickedMobileFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const commands = chat.connection?.commands ?? null;

  const draftConfig = () => {
    const config: { provider?: string; model?: string; thought?: string; mode?: string } = {};
    if (chat.draft.provider) config.provider = chat.draft.provider;
    if (chat.draft.model) config.model = chat.draft.model;
    if (chat.draft.thought) config.thought = chat.draft.thought;
    if (chat.draft.mode && chat.draft.mode !== "build") config.mode = chat.draft.mode;
    return config;
  };

  /** 斜杠命令：compact / goal 走专用命令，其余原样交给 CLI 处理。 */
  const runSlash = async (text: string): Promise<boolean> => {
    if (!commands || !sessionId) return false;
    return runMobileSlashCommand(commands, sessionId, text);
  };

  /** inputRouting.mode=choice：held 队列下输入不静默入队，让用户决定清空还是保留。 */
  const heldQueueDisposition = async () => {
    const items = chat.state.queue?.items ?? [];
    if (chat.state.inputRouting?.mode === "reject") {
      chat.notify(
        chat.state.inputRouting.reasonCode
          ? `当前不接受新输入（${chat.state.inputRouting.reasonCode}）`
          : "当前不接受新输入",
      );
      return "blocked" as const;
    }
    if (chat.state.inputRouting?.mode !== "choice" || items.length === 0) return null;
    const result = await Taro.showModal({
      title: "有排队中的消息",
      content: "立即发送将清空排队消息并插队执行",
      confirmText: "立即发送",
      cancelText: "排队发送",
    });
    return {
      heldQueueDisposition: result.confirm
        ? ("clearQueueAndSend" as const)
        : ("keepQueueAndSend" as const),
      expectedHeldQueueItemIds: items.map((item) => item.queueItemId),
    };
  };

  /**
   * send(override) 里的 override 供斜杠面板「点一下即执行」使用：React setState 不会
   * 在同一 tick 内让 send 读到新草稿，所以文本必须显式传入而不是依赖 draftText。
   */
  const send = async (override?: string) => {
    const text = (override ?? draftText).trim();
    if (!chat.connection || chat.sending || (text.length === 0 && files.length === 0)) return;
    const connection = chat.connection;
    chat.setSending(true);
    try {
      if (files.length === 0 && (await runSlash(text))) {
        setDraftText("");
        return;
      }
      if (!sessionId && files.length === 0) {
        const created = await chat.connection.createSession(text, draftConfig());
        setSessionId(created);
        setDraftText("");
        return;
      }
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        targetSessionId = await connection.createSession(undefined, draftConfig());
        setSessionId(targetSessionId);
      }
      const attachments: Awaited<ReturnType<ChannelAttachments["put"]>>[] = [];
      if (files.length > 0) {
        const current = flow.getZcodeSession();
        if (!current?.bridge || !current.workspaceTarget) throw new Error("当前链路不能上传附件");
        const bridge = current.bridge;
        const generation = bridge.recovered;
        const uploader = new ChannelAttachments(bridge, current.workspaceTarget);
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index]!;
          const uploaded = await uploader.put({
            sessionId: targetSessionId,
            ...file,
            onProgress: (progress) => setUploadProgress((index + progress) / files.length),
          });
          if (flow.getConnection() !== connection || bridge.recovered !== generation) {
            throw new Error("连接已切换，请重新发送附件");
          }
          attachments.push(uploaded);
        }
      }
      const disposition = await heldQueueDisposition();
      if (disposition === "blocked") return;
      const ack = await connection.sendText(targetSessionId, text, {
        ...disposition,
        ...(attachments.length ? { attachments } : {}),
      });
      if (ack.status === "accepted" || ack.status === "duplicate") {
        setDraftText("");
        setFiles([]);
      } else chat.notify(ack.message ?? ack.reasonCode ?? "发送未受理");
    } catch (caught) {
      // ACK 未知（断线）时草稿保留；pending 条目由重连对账收口。
      chat.fail(caught, "发送失败");
    } finally {
      setUploadProgress(null);
      chat.setSending(false);
    }
  };

  const pickFile = async () => {
    try {
      const picked = await pickMobileFiles();
      if (picked.length > 0) setFiles((current) => [...current, ...picked]);
    } catch (caught) {
      chat.fail(caught, "选择文件失败");
    }
  };

  const pickSlash = (entry: SlashEntry) => {
    if (entry.name === "compact") {
      setDraftText("/compact");
      void send("/compact");
      return;
    }
    setDraftText(`${entry.isSkill ? "$" : "/"}${entry.name} `);
  };

  return {
    draftText,
    setDraftText,
    files,
    uploadProgress,
    removeFile: (index: number) =>
      setFiles((current) => current.filter((_, item) => item !== index)),
    pickFile,
    send,
    pickSlash,
    commands,
  };
}
