import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "../../../src/components/ui/tooltip.js";
import { ChatContextUsage } from "../../../src/chat-input-toolbar/contextUsage.js";
import { ModelConfigSelect } from "../../../src/ModelConfigSelect.js";
import { resolveV4ModelTriggerDisplay } from "../../../src/v4/composer/modelTriggerDisplay.js";
import "./styles.css";

const MESSAGES = {
  "chat.contextUsage.title": "上下文容量",
  "chat.contextUsage.cacheHitRate": "平均缓存命中率",
  "chat.contextUsage.breakdown": "上下文来源",
  "chat.contextUsage.breakdown.messages": "消息",
  "chat.contextUsage.breakdown.systemPrompt": "系统提示词",
  "chat.contextUsage.breakdown.metaUserContext": "其他",
  "chat.contextUsage.breakdown.skills": "技能",
  "chat.contextUsage.breakdown.toolPrompt": "工具提示词",
  "chat.contextUsage.breakdown.systemTools": "系统工具",
  "chat.contextUsage.breakdown.mcpTools": "MCP 工具",
  "chat.contextUsage.compress": "压缩",
};

const intl = {
  formatMessage: ({ id }) => MESSAGES[id] ?? id,
};

// 与参考图同口径：478K / 1M，来源占比 87.5% / 7.3% / 3.8% / 0.8% / 0.4% / 0.2%。
const taskUsage = {
  used: 478_000,
  size: 1_000_000,
  cache: { hitRate: 0.992 },
  breakdown: [
    { source: "messages", chars: 87_500 },
    { source: "system_tool_schemas", chars: 7_300 },
    { source: "mcp_tool_schemas", chars: 3_800 },
    { source: "skills", chars: 800 },
    { source: "system_prompt", chars: 400 },
    { source: "meta_user_context", chars: 200 },
  ],
};

const modelGroups = [
  {
    key: "registry-provider:acme",
    label: "OpenCode Go (Chat)",
    items: [
      {
        key: "registry-provider:acme:deepseek-v4.1-flash",
        value: "acme/deepseek-v4.1-flash",
        name: "deepseek-v4.1-flash",
      },
      {
        key: "registry-provider:acme:gpt-5.1-codex",
        value: "acme/gpt-5.1-codex",
        name: "gpt-5.1-codex",
      },
    ],
  },
];

const normalizedValue = "acme/deepseek-v4.1-flash";
// providerName 故意缺省：验证目录缺名时回落到菜单分组标签。
const modelTriggerDisplay = resolveV4ModelTriggerDisplay({
  modelGroups,
  normalizedValue,
  fallbackLabel: "选择模型",
  providerId: "acme",
  providerName: undefined,
});

function ComposerCluster({ width }) {
  return (
    <div className="p-4">
      <div
        className="group/toolbar @container/composer flex items-end gap-3 rounded-xl border border-border p-2"
        style={{ width }}
        data-testid={`composer-row-${width}`}
      >
        <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden empty:hidden">
          <ChatContextUsage
            taskUsage={taskUsage}
            selectedProvider="glm"
            intl={intl}
            locale="zh-CN"
          />
          <ModelConfigSelect
            modelGroups={modelGroups}
            normalizedValue={normalizedValue}
            triggerLabel={modelTriggerDisplay.fullLabel}
            triggerLabelPrefix={modelTriggerDisplay.providerPrefix}
            triggerLabelValue={modelTriggerDisplay.modelLabel}
            triggerLabelPrefixClassName="composer-provider-prefix inline group-data-[composer-provider-compact=true]/toolbar:hidden"
            showManageModelsAction={false}
            lockReasonMessage="运行中不可切换"
            isItemLocked={() => false}
            onValueChange={() => {}}
            disabled={false}
            tooltipTitle={modelTriggerDisplay.fullLabel}
            labelVisibilityClassName="hidden @sm/composer:inline-flex"
            indicatorClassName="hidden @sm/composer:block group-data-[composer-model-icon=true]/toolbar:hidden"
            triggerLabelClassName="hidden min-w-0 text-left @sm/composer:block group-data-[composer-model-icon=true]/toolbar:hidden [&>span]:max-w-full [&>span>span]:block [&>span>span]:truncate"
            triggerClassName="composer-model-trigger max-w-[var(--composer-model-max-width,22rem)] group-data-[composer-model-icon=true]/toolbar:size-7 group-data-[composer-model-icon=true]/toolbar:p-0 group-data-[composer-model-icon=true]/toolbar:gap-0 group-data-[composer-model-icon=true]/toolbar:justify-center @max-sm/composer:size-7 @max-sm/composer:justify-center @max-sm/composer:gap-0 @max-sm/composer:p-0"
            triggerIconClassName="inline-flex @sm/composer:hidden group-data-[composer-model-icon=true]/toolbar:inline-flex"
            focusSelectorOnClose={null}
          />
        </span>
      </div>
    </div>
  );
}

function Fixture() {
  return (
    <TooltipProvider>
      {/* 640px 容器 < 42rem：恢复前 provider 前缀会被 @2xl/composer 断点隐藏。 */}
      <ComposerCluster width={640} />
      <ComposerCluster width={1100} />
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
