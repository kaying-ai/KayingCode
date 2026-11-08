// 模型 / 思考档选择面板、用量面板与斜杠命令补全条。
//
// 可选项来源是两条链路拼起来的（见 relayWorkspaceConfig.ts 的说明）：Node 的
// workspace-config 只发布 mode 与 slash 目录，模型目录来自移动专用只读通道。
// 因此「模型」面板在 catalog 不可用时显式说不可用，而不是回落到一个空列表。
import { View, Text, ScrollView } from "@tarojs/components";
import type {
  SessionUsageState,
  WorkspaceConfigOption,
  WorkspaceSlashCommand,
} from "@zcode/shared/kayingcode-protocol-v4";
import { cacheHitFraction, formatPercent, formatTokensZh } from "./chatFormat";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/icons";

export function ModelSheet({
  kind,
  modelOption,
  thoughtLevels,
  currentProvider,
  currentModel,
  currentThought,
  otherOptions,
  draft,
  busy,
  onClose,
  onSelectModel,
  onSelectThought,
}: {
  kind: "model" | "thought";
  modelOption: WorkspaceConfigOption | null;
  thoughtLevels: readonly string[];
  currentProvider: string;
  currentModel: string;
  currentThought: string;
  otherOptions: readonly WorkspaceConfigOption[];
  draft: boolean;
  busy: boolean;
  onClose: () => void;
  onSelectModel: (value: string) => void;
  onSelectThought: (value: string) => void;
}) {
  const options = modelOption?.options ?? [];
  const currentValue = currentProvider ? `${currentProvider}/${currentModel}` : currentModel;
  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="sheet">
        <View className="sheet-head">
          <Text className="sheet-title">
            {kind === "model" ? (draft ? "新会话 · 模型" : "模型") : "思考等级"}
          </Text>
          <Text className="sheet-close" onClick={onClose}>
            关闭
          </Text>
        </View>
        <ScrollView className="sheet-body" scrollY>
          {kind === "model" ? (
            options.length === 0 ? (
              // 与 Flutter `_ModelSheet` 同口径：这里只报模型名。拼 `provider/model` 会把
              // ZCode 会话的 provider id（UUID）一起摆出来，看起来就是「名字不对」。
              <Text className="sheet-note">{`当前模型: ${currentModel || "未设置"}`}</Text>
            ) : (
              options.map((option) => (
                <View
                  key={option.value}
                  className={`choice-row ${option.value === currentValue ? "choice-active" : ""}`}
                  onClick={() => !busy && onSelectModel(option.value)}
                >
                  <View className="choice-main">
                    <Text className="choice-name">{option.name}</Text>
                    {option.modelProviderName ? (
                      <Text className="choice-sub">{option.modelProviderName}</Text>
                    ) : null}
                  </View>
                  {option.value === currentValue ? (
                    <Icon className="choice-tick" name="radio_button_checked" />
                  ) : null}
                </View>
              ))
            )
          ) : thoughtLevels.length === 0 ? (
            <Text className="sheet-note">当前模型未提供思考档位</Text>
          ) : (
            <View className="chips chips-wrap">
              {thoughtLevels.map((level) => (
                <Text
                  key={level}
                  className={`chip ${level === currentThought ? "chip-active" : ""}`}
                  onClick={() => !busy && onSelectThought(level)}
                >
                  {level}
                </Text>
              ))}
            </View>
          )}
          {otherOptions.length > 0 ? (
            <>
              <Text className="panel-group">其他配置</Text>
              {otherOptions.map((option) => (
                <View key={option.id} className="detail-row">
                  <Text className="detail-label">{option.name}</Text>
                  <Text className="detail-value">{String(option.currentValue)}</Text>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

export function UsageSheet({
  usage,
  busy,
  onClose,
  onQueryTaskUsage,
}: {
  usage: SessionUsageState | null;
  busy: boolean;
  onClose: () => void;
  onQueryTaskUsage: () => void;
}) {
  const contextWindow = usage?.contextWindow ?? null;
  const cumulative = usage?.cumulative ?? null;
  const used = contextWindow?.usedTokens ?? 0;
  const max = contextWindow?.maxTokens ?? 0;
  const percent = max > 0 ? (used / max) * 100 : 0;
  const hit = cumulative ? cacheHitFraction(contextWindow?.cache, cumulative) : null;
  return (
    <View className="sheet-overlay">
      <View className="sheet-backdrop" onClick={onClose} />
      <View className="sheet">
        <View className="sheet-head">
          <Text className="sheet-title">用量统计</Text>
          <Text className="sheet-close" onClick={onClose}>
            关闭
          </Text>
        </View>
        <ScrollView className="sheet-body" scrollY>
          <Text className="panel-group">上下文容量</Text>
          <View className="usage-line">
            <Text className="usage-label">{`${formatTokensZh(used)} / ${formatTokensZh(max)}`}</Text>
            {max > 0 ? (
              <Text className={`usage-value ${percent >= 90 ? "tone-error" : ""}`}>
                {`${percent.toFixed(1)}%`}
              </Text>
            ) : null}
          </View>
          <View className="usage-track">
            <View
              className={`usage-fill ${percent >= 90 ? "usage-fill-error" : ""}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </View>
          <View className="usage-line">
            <Text className="usage-label">累计输入</Text>
            <Text className="usage-value">{`${formatTokensZh(cumulative?.inputTokens ?? 0)} tokens`}</Text>
          </View>
          <View className="usage-line">
            <Text className="usage-label">累计输出</Text>
            <Text className="usage-value">{`${formatTokensZh(cumulative?.outputTokens ?? 0)} tokens`}</Text>
          </View>
          <View className="usage-line">
            <Text className="usage-label">缓存命中率</Text>
            <Text className="usage-value">{hit === null ? "—" : formatPercent(hit)}</Text>
          </View>
          <Text
            className="sheet-action"
            onClick={() => {
              if (!busy) onQueryTaskUsage();
            }}
          >
            查询任务级用量 (getTaskTokenUsage)
          </Text>
          <Text className="panel-group">剩余额度</Text>
          <Text className="sheet-note">
            当前链路不可用：Relay 移动 attachment 未开放 usage-stats 通道，额度与 MCP
            配额请在电脑端查看。
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

export interface SlashEntry {
  name: string;
  description: string;
  inputHint?: string;
  /** true 表示 skill（`$name`），当前 relay 链路拿不到 skills 通道，恒为空。 */
  isSkill: boolean;
}

export function slashEntriesOf(commands: readonly WorkspaceSlashCommand[]): SlashEntry[] {
  return commands
    .filter((command) => command.name.length > 0)
    .map((command) => ({
      name: command.name,
      description: command.description,
      ...(command.inputHint ? { inputHint: command.inputHint } : {}),
      isSkill: false,
    }));
}

export function SlashBar({
  entries,
  query,
  onPick,
}: {
  entries: readonly SlashEntry[];
  query: string;
  onPick: (entry: SlashEntry) => void;
}) {
  const term = query.replace(/^[/$]/, "").toLowerCase();
  const filtered =
    term.length === 0
      ? entries
      : entries.filter((entry) => entry.name.toLowerCase().startsWith(term));
  return (
    <View className="slash">
      <ScrollView className="slash-list" scrollY>
        {filtered.length === 0 ? (
          <Text className="sheet-note">没有匹配的命令</Text>
        ) : (
          filtered.map((entry) => (
            <View key={entry.name} className="slash-item" onClick={() => onPick(entry)}>
              <Icon className="slash-icon" name={slashIconOf(entry)} />
              <View className="slash-main">
                <Text className="slash-name">{`${entry.isSkill ? "$" : "/"}${entry.name}`}</Text>
                <Text className="slash-desc">{entry.description || entry.inputHint || ""}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/**
 * 斜杠命令的图标三分支（对齐 Flutter chat/sheets.dart）：
 * skill → auto_awesome_outlined、compact → compress、其余 → bolt。
 * goal 不在 Flutter 的三分支里，借用 flag_outlined（目标语义）。
 */
function slashIconOf(entry: SlashEntry): IconName {
  if (entry.isSkill) return "auto_awesome_outlined";
  if (entry.name === "compact") return "compress";
  if (entry.name === "goal") return "flag_outlined";
  return "bolt";
}
