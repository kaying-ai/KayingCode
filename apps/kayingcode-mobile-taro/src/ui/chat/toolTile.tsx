// 工具调用卡片。
//
// 工具族的「专门视图」是名字子串启发式（与 Flutter 一致）：bash / todo·plan /
// web search / mcp·skill 各有一块结构化呈现，其余落到通用输出块。默认折叠只对
// 只读类工具生效——读文件的结果通常很长，而写/执行类需要先看到结果。
import { useState } from "react";
import { View, Text } from "@tarojs/components";
import type { ConversationRow, ToolCallRow } from "@zcode/shared/kayingcode-protocol-v4";
import { DiffView } from "./diffView";
import { formatRowTime } from "./chatFormat";
import { Icon } from "../icons/Icon";
import type { IconName } from "../icons/icons";
import {
  extractDiff,
  isMcpTool,
  isReadOnlyTool,
  isTodoPlanTool,
  isWebSearchTool,
  parseMcpSummary,
  parseSearchSummary,
  parseTodoSteps,
  toolErrorText,
  toolOutputText,
  toolTargetPath,
  toolTone,
} from "./toolDetail";

interface StatusMeta {
  icon: IconName;
  tone: string;
  label: string;
}

function statusMeta(status: string): StatusMeta {
  switch (status) {
    case "running":
    case "inputStreaming":
      return { icon: "build_outlined", tone: "run", label: "执行中" };
    case "pendingApproval":
      return { icon: "hourglass_top", tone: "run", label: "执行中" };
    case "success":
      return { icon: "check", tone: "ok", label: "执行完毕" };
    case "error":
      return { icon: "error_outline", tone: "error", label: "" };
    case "cancelled":
      return { icon: "block", tone: "warn", label: "" };
    default:
      return { icon: "build_outlined", tone: "faint", label: "" };
  }
}

export function ToolCallTile({
  row,
  onView,
}: {
  row: ConversationRow;
  onView: (row: ConversationRow) => void;
}) {
  const tool = row as ToolCallRow;
  const [open, setOpen] = useState(() => !isReadOnlyTool(tool.toolName));
  const status = statusMeta(tool.status);
  const tone = toolTone(tool.toolName);
  const path = toolTargetPath(row);
  const outputText = toolOutputText(row);
  const diff = extractDiff(row);
  const errorText = toolErrorText(row);
  const preview = firstLine(path ?? tool.inputText ?? outputText ?? "");
  const time = formatRowTime(Number(tool.createdAt) || 0);

  return (
    <View className={`tool tool-tone-${tone}`}>
      <View className="tool-head" onClick={() => setOpen(!open)}>
        <Icon className={`tool-status tool-${status.tone}`} name={status.icon} />
        <View className="tool-title">
          <Text className="tool-name">{tool.toolName || "tool"}</Text>
          {tagText(tool, status.label) ? (
            <Text className={`tool-tag tool-${status.tone}`}>{tagText(tool, status.label)}</Text>
          ) : null}
        </View>
        {time ? <Text className="tool-time">{time}</Text> : null}
        <Icon
          className="tool-caret"
          name={open ? "keyboard_arrow_down" : "keyboard_arrow_up"}
        />
      </View>

      {open ? null : preview ? (
        <Text className="tool-preview" onClick={() => setOpen(true)}>
          {preview}
        </Text>
      ) : null}

      {open ? (
        <View className="tool-body">
          {path && !diff ? <Text className="tool-path">{path}</Text> : null}
          <ToolSpecific row={row} tool={tool} outputText={outputText} />
          {errorText ? <KeyValue label="错误" value={errorText} tone="error" /> : null}
          {tool.progress ? (
            <Text className="tool-progress">
              {firstLine(tool.progress.previewLine ?? "") || "…"}
              {typeof tool.progress.bytes === "number"
                ? ` · ${(tool.progress.bytes / 1024).toFixed(1)} KB`
                : ""}
            </Text>
          ) : null}
          {diff ? <DiffView diff={diff} /> : null}
          <Text className="tool-view" onClick={() => onView(row)}>
            查看
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function tagText(tool: ToolCallRow, label: string): string {
  if (tool.status === "error") return tool.error?.code ?? "";
  return label;
}

function ToolSpecific({
  row,
  tool,
  outputText,
}: {
  row: ConversationRow;
  tool: ToolCallRow;
  outputText: string;
}) {
  const name = tool.toolName.toLowerCase();
  if (name === "bash") {
    return (
      <>
        {tool.inputText ? <KeyValue label="输入" value={tool.inputText} tone="warn" /> : null}
        {outputText ? <KeyValue label="输出" value={outputText} tone="warn" /> : null}
      </>
    );
  }
  if (isTodoPlanTool(tool.toolName)) {
    const steps = todoStepsOf(tool);
    if (steps) {
      return (
        <View className="todo-steps">
          {steps.map((step, index) => (
            <View key={index} className="todo-step">
              <Icon
                className={`todo-mark todo-${step.status}`}
                name={
                  step.status === "completed"
                    ? "check_circle"
                    : step.status === "in_progress"
                      ? "play_circle_outline"
                      : "radio_button_unchecked"
                }
              />
              <Text className={`todo-title todo-${step.status}`}>{step.title}</Text>
            </View>
          ))}
        </View>
      );
    }
  }
  if (isWebSearchTool(tool.toolName)) {
    const summary = parseSearchSummary(outputText);
    if (summary) {
      return (
        <View className="search-hits">
          {summary.hits.map((hit, index) => (
            <View key={index} className="search-hit">
              {hit.title ? <Text className="search-title">{hit.title}</Text> : null}
              {hit.snippet ? <Text className="search-snippet">{hit.snippet}</Text> : null}
              {hit.url ? <Text className="search-url">{hit.url}</Text> : null}
            </View>
          ))}
        </View>
      );
    }
  }
  if (isMcpTool(tool.toolName, outputText)) {
    const summary = parseMcpSummary(outputText);
    if (summary) return <Text className="tool-output">{summary}</Text>;
  }
  if (outputText) return <Text className="tool-output">{outputText}</Text>;
  void row;
  return null;
}

function todoStepsOf(tool: ToolCallRow) {
  const candidates: unknown[] = [
    tool.input,
    tool.inputText,
    (tool as unknown as Record<string, unknown>).content,
    tool.output,
    tool.output?.text,
  ];
  for (const candidate of candidates) {
    const parsed = parseTodoSteps(candidate);
    if (parsed) return parsed;
  }
  return null;
}

export function KeyValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <View className={`kv kv-${tone}`}>
      <Text className="kv-label">{label}</Text>
      <Text className="kv-value">{value}</Text>
    </View>
  );
}

function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}
