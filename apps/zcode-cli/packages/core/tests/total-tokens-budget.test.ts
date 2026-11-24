import { describe, expect, it } from "vitest";
import { TOTAL_TOKENS_BUDGET, formatTotalTokensReminder } from "../src/context/total-tokens.js";
import {
  consumeTotalTokensBudget,
  createTotalTokensBudgetState,
  decideTotalTokensReminder,
  isTotalTokensReminderEnabled,
  reanchorTotalTokensBudget,
  rollOverTotalTokensBudget,
} from "../src/runtime/helpers/total-tokens-budget.js";

describe("total tokens budget", () => {
  it("counts usage relative to the latest anchor and never grows back", () => {
    let state = createTotalTokensBudgetState();
    const first = consumeTotalTokensBudget(state, 1_000);
    expect(first.remaining).toBe(TOTAL_TOKENS_BUDGET - 1_000);
    state = first.state;

    // 上下文变小时已用量不回退，剩余额度也不会回升。
    const second = consumeTotalTokensBudget(state, 400);
    expect(second.remaining).toBe(TOTAL_TOKENS_BUDGET - 1_000);
    expect(second.state.maxUsed).toBe(1_000);

    const third = consumeTotalTokensBudget(second.state, 2_500);
    expect(third.remaining).toBe(TOTAL_TOKENS_BUDGET - 2_500);
  });

  it("reanchors from the rolled-over total and resets the window usage", () => {
    const rolled = rollOverTotalTokensBudget(createTotalTokensBudgetState(), 3_000);
    const anchored = reanchorTotalTokensBudget(rolled, 1_200);
    expect(anchored).toMatchObject({ rolledOver: 3_000, anchor: 4_200, maxUsed: 0 });
    expect(consumeTotalTokensBudget(anchored, 200).remaining).toBe(TOTAL_TOKENS_BUDGET);
  });

  it("decides when to emit and reanchor the reminder", () => {
    expect(decideTotalTokensReminder({ reason: "turn_input", mainSession: true, fromUser: true }))
      .toEqual({ emit: true, reanchor: true });
    expect(decideTotalTokensReminder({ reason: "turn_input", mainSession: true, fromUser: false }))
      .toEqual({ emit: false, reanchor: false });
    expect(decideTotalTokensReminder({ reason: "turn_input", mainSession: false, fromUser: true }))
      .toEqual({ emit: false, reanchor: false });
    expect(decideTotalTokensReminder({ reason: "tool_batch", mainSession: true, fromUser: false }))
      .toEqual({ emit: true, reanchor: false });
    expect(decideTotalTokensReminder({ reason: "text_guide", mainSession: true, fromUser: true }))
      .toEqual({ emit: true, reanchor: true });
    expect(decideTotalTokensReminder({ reason: "text_guide", mainSession: true, fromUser: false }))
      .toEqual({ emit: true, reanchor: false });
    expect(decideTotalTokensReminder({ reason: "text_guide", mainSession: false, fromUser: true }))
      .toEqual({ emit: true, reanchor: false });
  });

  it("formats the fixed budget line", () => {
    expect(formatTotalTokensReminder(TOTAL_TOKENS_BUDGET)).toBe(
      `<total_tokens>${TOTAL_TOKENS_BUDGET} tokens left</total_tokens>`,
    );
  });

  it("keeps the reminder off unless explicitly enabled", () => {
    // 上游 4.0 起提醒是显式开关；缺省、false 与空配置都不产出 system 行或附件。
    expect(isTotalTokensReminderEnabled({})).toBe(false);
    expect(isTotalTokensReminderEnabled({ totalTokensReminder: {} })).toBe(false);
    expect(isTotalTokensReminderEnabled({ totalTokensReminder: { enabled: false } })).toBe(false);
    expect(isTotalTokensReminderEnabled({ totalTokensReminder: { enabled: true } })).toBe(true);
  });
});
