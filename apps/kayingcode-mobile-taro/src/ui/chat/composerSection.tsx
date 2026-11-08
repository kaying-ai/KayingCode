// 输入区分区：composer + 它自己的弹层（「+」面板 / 模型 / 思考档 / 模式选择）。
//
// 从 pages/chat 抽出（页面超出行数上限，且这些状态与回调只服务输入区）：页面只负责
// 「谁在会话里、给哪个会话发命令」，选区不落到页面。模式与模型的候选来源沿用 controller
// 的 modeOption / modelOption（V4 workspace-config 优先、ZCode presentation 兜底）。
import { useState } from "react";
import Taro from "@tarojs/taro";
import type { useChatController } from "./useChatController";
import type { useChatSend } from "./useChatSend";
import { Composer } from "./composer";
import { PlusSheet } from "./plusSheet";
import { modeLabel } from "./chatFormat";
import { ModelSheet, type SlashEntry } from "./sheets";

/** 协议冻结的可切换模式集合（`switchCollaborationMode` 的值域）；目录缺失时同样用它回落。 */
const MODE_FALLBACK = ["build", "edit", "plan", "yolo"] as const;
type CollaborationMode = (typeof MODE_FALLBACK)[number];
const isCollaborationMode = (value: string): value is CollaborationMode =>
  (MODE_FALLBACK as readonly string[]).includes(value);

export function ComposerSection({
  chat,
  sender,
  sessionId,
  running,
  agentName,
  mode,
  contextRatio,
  insightsCount,
  canAttach,
  onOpenInsights,
  onOpenUsage,
  speak,
}: {
  chat: ReturnType<typeof useChatController>;
  sender: ReturnType<typeof useChatSend>;
  sessionId: string | null;
  running: boolean;
  agentName: string;
  mode: string;
  contextRatio: number | null;
  insightsCount: number;
  canAttach: boolean;
  /** 新会话（未落库）没有聚合/用量面板，与 Flutter 一样不显示这两个入口。 */
  onOpenInsights?: () => void;
  onOpenUsage?: () => void;
  speak: (run: () => Promise<unknown>, prefix: string) => void;
}) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [sheet, setSheet] = useState<"model" | "thought" | null>(null);
  const config = chat.state.config;
  const commands = chat.commands;

  const switchModel = (value: string) => {
    setSheet(null);
    const index = value.indexOf("/");
    const provider = index > 0 ? value.slice(0, index) : "";
    const model = index > 0 ? value.slice(index + 1) : value;
    if (!sessionId) {
      chat.setDraft((previous) => ({ ...previous, provider, model }));
      return;
    }
    speak(
      () =>
        commands!.switchModelConfig(sessionId, {
          provider,
          model,
          thought: config?.thought ?? "",
        }),
      "切换失败",
    );
  };

  const switchThought = (thought: string) => {
    setSheet(null);
    if (!sessionId) {
      chat.setDraft((previous) => ({ ...previous, thought }));
      return;
    }
    speak(
      () =>
        commands!.switchModelConfig(sessionId, {
          provider: config?.provider ?? "",
          model: config?.model ?? "",
          thought,
        }),
      "切换失败",
    );
  };

  const pickMode = async () => {
    // 模式候选来自工作区目录（对齐 Flutter chat_page.dart:_showModeMenu 的
    // `prep.option("mode").options`）；目录里可能含不可切换的 auto，先按协议值域过滤。
    const switchable = (chat.modeOption?.options ?? []).filter((option) =>
      isCollaborationMode(option.value),
    );
    const values: readonly CollaborationMode[] =
      switchable.length > 0
        ? switchable.map((option) => option.value as CollaborationMode)
        : MODE_FALLBACK;
    // 回落标签走 modeLabel（中文），不能把 build/edit 这些协议值直接摆给用户看。
    const labels =
      switchable.length > 0
        ? switchable.map((option) => option.name)
        : MODE_FALLBACK.map((value) => modeLabel(value));
    let tapped: number;
    try {
      tapped = (await Taro.showActionSheet({ itemList: [...labels] })).tapIndex;
    } catch {
      // 用户取消：原生选择器以 reject 表达，不是错误。
      return;
    }
    const next = values[tapped];
    if (!next) return;
    if (!sessionId) {
      chat.setDraft((previous) => ({ ...previous, mode: next }));
      return;
    }
    speak(() => commands!.switchCollaborationMode(sessionId, next), "切换失败");
  };

  const pickSlash = (entry: SlashEntry) => sender.pickSlash(entry);

  return (
    <>
      <Composer
        draft={sender.draftText}
        running={running}
        sending={chat.sending}
        agentName={agentName}
        mode={mode}
        queueCount={chat.state.queue?.items.length ?? 0}
        contextRatio={contextRatio}
        insightsCount={insightsCount}
        slashEntries={chat.slashEntries}
        slashQuery={sender.draftText.trim().split(" ")[0] ?? ""}
        onDraftChange={sender.setDraftText}
        onSend={() => void sender.send()}
        onStop={() =>
          speak(
            () =>
              commands!.stop(
                sessionId!,
                chat.state.control?.activeWorks?.[0]?.foregroundExecutionId,
              ),
            "停止失败",
          )
        }
        onPlusMenu={() => setPlusOpen(true)}
        onPickMode={() => void pickMode()}
        onOpenInsights={onOpenInsights}
        onOpenUsage={onOpenUsage}
        onPickModel={() => setSheet("model")}
        onPickThought={() => setSheet("thought")}
        onPickSlash={pickSlash}
        files={sender.files}
        uploadProgress={sender.uploadProgress}
        onRemoveFile={sender.removeFile}
      />

      {plusOpen ? (
        <PlusSheet
          entries={chat.slashEntries}
          canAttach={canAttach}
          onSelect={(entry) => {
            pickSlash(entry);
            setPlusOpen(false);
          }}
          onAttach={() => {
            setPlusOpen(false);
            void sender.pickFile();
          }}
          onClose={() => setPlusOpen(false)}
        />
      ) : null}

      {sheet ? (
        <ModelSheet
          kind={sheet}
          modelOption={chat.modelOption}
          thoughtLevels={chat.thoughtLevels}
          currentProvider={config?.provider ?? chat.draft.provider}
          currentModel={config?.model ?? chat.draft.model}
          currentThought={config?.thought ?? chat.draft.thought}
          otherOptions={chat.otherOptions}
          draft={sessionId === null}
          busy={chat.sending}
          onClose={() => setSheet(null)}
          onSelectModel={switchModel}
          onSelectThought={switchThought}
        />
      ) : null}
    </>
  );
}
