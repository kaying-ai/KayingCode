import { useState } from "react";
import { View, Text, Input, Button } from "@tarojs/components";
import type { PendingInteraction } from "@zcode/shared/kayingcode-protocol-v4";
import { buildElicitationContent } from "./elicitation";

export type InteractionAnswer = {
  optionId?: string;
  freeText?: string;
  action?: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
};

export function InteractionCard({
  interaction,
  busy,
  onAnswer,
}: {
  interaction: PendingInteraction;
  busy: boolean;
  onAnswer: (answer: InteractionAnswer) => void;
}) {
  const payload = interaction.payload;
  const [freeText, setFreeText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  if (payload.kind === "workspaceHookReview") {
    return (
      <View className="interaction surface-card">
        <Text className="list-title">工作区需要确认</Text>
        <Text className="caption">请在电脑端完成工作区 Hook 审核。</Text>
      </View>
    );
  }
  const questions = payload.kind === "userInput" ? (payload.questions ?? []) : [];
  return (
    <View className="interaction surface-card">
      <Text className="list-title">
        {payload.kind === "permission" ? `权限请求 · ${payload.toolName}` : "等待你的输入"}
      </Text>
      <Text className="caption">
        {payload.kind === "permission" ? payload.summary : payload.prompt}
      </Text>
      {payload.kind === "permission" ? (
        <View className="interaction-options">
          {payload.options.map((option) => (
            <Button
              key={option.optionId}
              className="action action-ghost"
              disabled={busy}
              onClick={() =>
                onAnswer({
                  optionId: option.optionId,
                  ...(freeText.trim() ? { freeText: freeText.trim() } : {}),
                })
              }
            >
              {option.label}
            </Button>
          ))}
        </View>
      ) : null}
      {payload.kind === "userInput" && payload.options ? (
        <View className="interaction-options">
          {payload.options.map((option) => (
            <Button
              key={option.optionId}
              className="action action-ghost"
              disabled={busy}
              onClick={() => onAnswer({ action: "accept", content: {} })}
            >
              {option.label}
            </Button>
          ))}
        </View>
      ) : null}
      {questions.map((question) => (
        <View key={question.question} className="question">
          <Text className="list-title">{question.header || question.question}</Text>
          <Text className="caption">{question.question}</Text>
          <View className="interaction-options">
            {question.options.map((option) => {
              const selected = (answers[question.question] ?? []).includes(option.value);
              return (
                <Text
                  key={option.value}
                  className={`choice ${selected ? "chosen" : ""}`}
                  onClick={() => {
                    setAnswers((previous) => {
                      const values = previous[question.question] ?? [];
                      return {
                        ...previous,
                        [question.question]: question.multiSelect
                          ? selected
                            ? values.filter((value) => value !== option.value)
                            : [...values, option.value]
                          : [option.value],
                      };
                    });
                  }}
                >
                  {option.label}
                </Text>
              );
            })}
          </View>
        </View>
      ))}
      {questions.length > 0 ? (
        <Button
          className="action action-secondary"
          disabled={busy || Object.values(answers).every((values) => values.length === 0)}
          onClick={() =>
            onAnswer({ action: "accept", content: buildElicitationContent(questions, answers) })
          }
        >
          提交答案
        </Button>
      ) : null}
      {payload.freeText ? (
        <View className="interaction-free">
          <Input
            className="control"
            value={freeText}
            password={payload.kind === "userInput" && payload.sensitive === true}
            placeholder="输入回复…"
            onInput={(event) => setFreeText(event.detail.value)}
          />
          <Button
            className="action action-primary"
            disabled={busy || !freeText.trim()}
            onClick={() => onAnswer({ freeText: freeText.trim() })}
          >
            发送
          </Button>
        </View>
      ) : null}
    </View>
  );
}
