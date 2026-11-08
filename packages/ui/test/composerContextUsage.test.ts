import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { BUILTIN_MODEL_PROVIDER_IDS } from "@zcode/shared";
import {
  buildContextUsageBreakdownSegments,
  buildContextUsageProgressSegments,
  formatContextCacheHitRateLabel,
  formatContextUsageShare,
  formatContextUsageSummary,
  getRenderableTaskUsage,
  resolveComposerContextTaskUsage,
} from "../src/chat-input-toolbar/contextUsageMetrics.js";
import {
  formatProviderModelLabel,
  resolveV4ModelTriggerDisplay,
} from "../src/v4/composer/modelTriggerDisplay.js";
import type { ModelSelectGroup } from "../src/ModelConfigSelect.js";

test("上下文来源明细按占用排序并合并同一来源", () => {
  const segments = buildContextUsageBreakdownSegments([
    { source: "system_prompt", chars: 4_000 },
    { source: "messages", chars: 87_500 },
    { source: "mcp_tool_schemas", chars: 3_800 },
    { source: "messages", chars: 125 },
    { source: "skills", chars: 0 },
  ]);

  assert.deepEqual(
    segments.map((segment) => segment.source),
    ["messages", "system_prompt", "mcp_tool_schemas"],
  );
  assert.equal(segments[0]?.chars, 87_625);
  const totalShare = segments.reduce((sum, segment) => sum + segment.share, 0);
  assert.ok(Math.abs(totalShare - 1) < 1e-9);
  assert.equal(formatContextUsageShare(segments[0]?.share ?? 0, "zh-CN"), "91.8%");

  // 进度分段必须是 0..1 小数口径：混用 0..100 会让每段都被 Progress 钳成满宽。
  const progress = buildContextUsageProgressSegments(segments);
  assert.deepEqual(
    progress.map((segment) => segment.id),
    ["messages", "system_prompt", "mcp_tool_schemas"],
  );
  for (const segment of progress) {
    assert.ok(segment.percent > 0 && segment.percent <= 1);
  }
});

test("用量摘要按 K/M 与百分比输出，不受中文 locale 影响", () => {
  assert.equal(
    formatContextUsageSummary({
      locale: "zh-CN",
      percent: 0.478,
      size: 1_000_000,
      used: 478_000,
    }),
    "478K/1M (47.8%)",
  );
});

test("缓存命中率只在明显收益时展示", () => {
  assert.equal(formatContextCacheHitRateLabel(0.992, "zh-CN"), "99.2%");
  assert.equal(formatContextCacheHitRateLabel(0.78, "zh-CN"), "78%");
  assert.equal(formatContextCacheHitRateLabel(0.77, "zh-CN"), null);
  assert.equal(formatContextCacheHitRateLabel(0.5, "zh-CN"), null);
  assert.equal(formatContextCacheHitRateLabel(0.5, "zh-CN", { showBelowThreshold: true }), "50%");
  assert.equal(formatContextCacheHitRateLabel(null, "zh-CN"), null);
  assert.equal(formatContextCacheHitRateLabel(undefined, "zh-CN"), null);
});

test("没有可展示用量时不渲染触发器", () => {
  assert.equal(getRenderableTaskUsage(null), null);
  assert.equal(getRenderableTaskUsage(undefined), null);
  assert.equal(getRenderableTaskUsage({ used: 0, size: 1_000_000 }), null);
  assert.equal(getRenderableTaskUsage({ used: 120, size: 0 }), null);
  assert.equal(getRenderableTaskUsage({ used: Number.NaN, size: 1_000_000 }), null);
  assert.equal(getRenderableTaskUsage({ used: 478_000, size: 1_000_000 })?.percent, 47.8);
});

test("会话快照 contextWindow 投影保留缓存与来源明细", () => {
  const usage = resolveComposerContextTaskUsage({
    contextWindow: {
      usedTokens: 10,
      maxTokens: 100,
      cache: { hitRate: 0.9 },
      breakdown: [{ source: "messages", chars: 5 }],
    },
  });
  assert.deepEqual(usage, {
    used: 10,
    size: 100,
    cache: { hitRate: 0.9 },
    breakdown: [{ source: "messages", chars: 5 }],
  });
  assert.equal(resolveComposerContextTaskUsage(null), null);
  assert.equal(resolveComposerContextTaskUsage({ contextWindow: null }), null);
});

const CUSTOM_MODEL_VALUE = "acme/deepseek-v4.1-flash";
const customProviderGroup: ModelSelectGroup = {
  key: "registry-provider:acme",
  label: "OpenCode Go (Chat)",
  items: [
    {
      key: "registry-provider:acme:deepseek-v4.1-flash",
      value: CUSTOM_MODEL_VALUE,
      name: "deepseek-v4.1-flash",
    },
  ],
};

test("模型触发器同时展示 provider 与模型名", () => {
  const display = resolveV4ModelTriggerDisplay({
    modelGroups: [customProviderGroup],
    normalizedValue: CUSTOM_MODEL_VALUE,
    fallbackLabel: "选择模型",
    providerId: "acme",
    providerName: "OpenCode Go (Chat)",
  });

  assert.equal(display.providerPrefix, "OpenCode Go (Chat)/");
  assert.equal(display.modelLabel, "deepseek-v4.1-flash");
  assert.equal(display.fullLabel, "OpenCode Go (Chat)/deepseek-v4.1-flash");
});

test("目录缺 providerName 时用菜单分组标签兜底，退化成 providerId 时不当作名字", () => {
  const fallback = resolveV4ModelTriggerDisplay({
    modelGroups: [customProviderGroup],
    normalizedValue: CUSTOM_MODEL_VALUE,
    fallbackLabel: "选择模型",
    providerId: "acme",
    providerName: undefined,
  });
  assert.equal(fallback.providerPrefix, "OpenCode Go (Chat)/");
  assert.equal(fallback.fullLabel, "OpenCode Go (Chat)/deepseek-v4.1-flash");

  const providerIdGroup: ModelSelectGroup = {
    ...customProviderGroup,
    label: "acme",
  };
  const suppressed = resolveV4ModelTriggerDisplay({
    modelGroups: [providerIdGroup],
    normalizedValue: CUSTOM_MODEL_VALUE,
    fallbackLabel: "选择模型",
    providerId: "acme",
    providerName: undefined,
  });
  assert.equal(suppressed.providerPrefix, undefined);
  assert.equal(suppressed.fullLabel, "deepseek-v4.1-flash");
});

test("内置套餐族只显示模型名", () => {
  const providerId = BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan;
  const codingPlanValue = `${providerId}/glm-5.3`;
  const display = resolveV4ModelTriggerDisplay({
    modelGroups: [
      {
        key: `registry-provider:${providerId}`,
        label: "Z.ai",
        items: [
          {
            key: `registry-provider:${providerId}:glm-5.3`,
            value: codingPlanValue,
            name: "GLM-5.3",
          },
        ],
      },
    ],
    normalizedValue: codingPlanValue,
    fallbackLabel: "选择模型",
    providerId,
    providerName: "Z.ai",
  });

  assert.equal(display.providerPrefix, undefined);
  assert.equal(display.fullLabel, "GLM-5.3");
});

test("formatProviderModelLabel 保留自定义 provider 前缀", () => {
  assert.equal(formatProviderModelLabel("acme", "Acme", "m1"), "Acme/m1");
  assert.equal(formatProviderModelLabel("acme", undefined, "m1", "Acme"), "Acme/m1");
  assert.equal(formatProviderModelLabel(undefined, undefined, "m1"), "m1");
});

test("输入区工具条挂载上下文用量并常显 provider 前缀", async () => {
  const toolbar = await readFile(
    new URL("../src/v4/composer/V4ComposerToolbar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(toolbar, /<ChatContextUsage[\s\S]{0,200}?taskUsage=\{taskUsage\}/u);
  assert.match(toolbar, /composer-provider-prefix inline/u);
  assert.doesNotMatch(toolbar, /composer-provider-prefix hidden/u);
});
