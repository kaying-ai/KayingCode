// 输入区（composer）：多行输入 + 单行工具条 + 发送/停止状态机 + 斜杠补全。
//
// 工具条按 Flutter chat/composer.dart 对等组织：左组 `+` / 模式 / 聚合（带待办徽标）/ 队列，
// 右组用量 / 模型 / 思考档 / 发送或停止；图标键与发送键都是 40×40（控件圆角 8）。
//
// 与 Flutter 同口径：停止按钮的条件是「会话运行中 **且** 输入框为空」——输入框有内容时
// 即便在运行中也给发送键（发送即排队/插入），否则用户无法在处理中追加要求。
// 模式为 plan / yolo / full 时模式标签走警示色，与消息流上方的模式横幅同一语义。
import { Textarea, View, Text } from "@tarojs/components";
import { Icon, Spinner } from "../icons/Icon";
import { modeIsHot, modeLabel } from "./chatFormat";
import { SlashBar, type SlashEntry } from "./sheets";

export function Composer({
  draft,
  running,
  sending,
  agentName,
  mode,
  queueCount,
  contextRatio,
  insightsCount,
  slashEntries,
  slashQuery,
  onDraftChange,
  onSend,
  onStop,
  onPlusMenu,
  onPickMode,
  onOpenInsights,
  onOpenUsage,
  onPickModel,
  onPickThought,
  onPickSlash,
  files,
  uploadProgress,
  onRemoveFile,
}: {
  draft: string;
  running: boolean;
  sending: boolean;
  agentName: string;
  mode: string;
  queueCount: number;
  contextRatio: number | null;
  insightsCount: number;
  slashEntries: readonly SlashEntry[];
  slashQuery: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  onPlusMenu: () => void;
  onPickMode: () => void;
  /** 新会话（未落库）没有聚合/用量面板，与 Flutter 一样不显示这两个入口。 */
  onOpenInsights?: () => void;
  onOpenUsage?: () => void;
  onPickModel: () => void;
  onPickThought: () => void;
  onPickSlash: (entry: SlashEntry) => void;
  files: readonly { fileName: string; bytes: Uint8Array }[];
  uploadProgress: number | null;
  onRemoveFile: (index: number) => void;
}) {
  const trimmed = draft.trim();
  const empty = trimmed.length === 0 && files.length === 0;
  const showStop = running && empty;
  const showSlash = slashEntries.length > 0 && /^[/$]\S*$/.test(draft.trim());
  const sendDisabled = sending || empty;
  return (
    <View className="composer-wrap">
      {showSlash ? (
        <SlashBar entries={slashEntries} query={slashQuery} onPick={onPickSlash} />
      ) : null}
      <View className="composer">
        {files.map((file, index) => (
          <View className="attach" key={`${file.fileName}-${index}`}>
            <Icon name="attach_file" />
            <Text className="attach-name">{file.fileName}</Text>
            <Text className="attach-size">{Math.ceil(file.bytes.length / 1024)} KB</Text>
            <Text className="tool-chip" onClick={() => onRemoveFile(index)}>
              移除
            </Text>
          </View>
        ))}
        {uploadProgress !== null ? (
          <Text className="caption">附件上传 {Math.round(uploadProgress * 100)}%</Text>
        ) : null}
        <Textarea
          className="composer-input"
          value={draft}
          maxlength={-1}
          autoHeight
          placeholder={running ? "继续输入以排队后续修改" : `向 ${agentName} 提问…`}
          onInput={(event) => onDraftChange(event.detail.value)}
        />
        {/* 工具条单行不换行：图标键与文字标签都固定尺寸，不会把发送键挤到第二行。 */}
        <View className="composer-bar">
          <View className="composer-tools">
            <Text className="bar-icon" onClick={() => !sending && onPlusMenu()}>
              <Icon name="add" size={22} />
            </Text>
            <Text
              className={`bar-label ${modeIsHot(mode) ? "bar-label-warn" : ""}`}
              onClick={() => !sending && onPickMode()}
            >
              {modeLabel(mode)}
            </Text>
            {onOpenInsights ? (
              <View className="bar-icon-wrap">
                <Text className="bar-icon" onClick={onOpenInsights}>
                  <Icon name="grid_view_rounded" size={22} />
                </Text>
                {insightsCount > 0 ? <Text className="bar-badge">{insightsCount}</Text> : null}
              </View>
            ) : null}
            {queueCount > 0 ? <Text className="bar-queue">{`√${queueCount}`}</Text> : null}
          </View>
          <View className="composer-tail">
            {onOpenUsage ? (
              <Text className="bar-label" onClick={onOpenUsage}>
                {contextRatio === null ? "用量" : `${Math.round(contextRatio * 100)}%`}
              </Text>
            ) : null}
            <Text className="bar-icon" onClick={() => onPickModel()}>
              <Icon name="memory" size={22} />
            </Text>
            <Text className="bar-icon" onClick={() => onPickThought()}>
              <Icon name="psychology" size={22} />
            </Text>
            {/* 发送/停止用 View 而不是 Taro `Button`：小程序的原生 <button> 不渲染图标字体，
                之前这里是个空白方块（H5 正常、真机空白）。几何按 Flutter `_SendOrStop` 照搬：
                40×40、图标 24px；发送=圆形主色底，停止=圆角 8 的 raise 底；空输入或发送中不改
                外观（Flutter 只是把 onTap 置空）。 */}
            <View
              className={`send-button ${showStop ? "send-button-stop" : "send-button-primary"}`}
              onClick={() => {
                if (showStop) {
                  onStop();
                  return;
                }
                if (sendDisabled) return;
                onSend();
              }}
            >
              {sending ? (
                <Spinner size={18} />
              ) : (
                <Icon name={showStop ? "stop" : "arrow_upward"} size={24} />
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
