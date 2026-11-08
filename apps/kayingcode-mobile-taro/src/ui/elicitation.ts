export function buildElicitationContent(
  questions: readonly { question: string; multiSelect?: boolean }[],
  answers: Readonly<Record<string, string[]>>,
): Record<string, unknown> {
  const content: Record<string, unknown> = { answers: {} as Record<string, string> };
  const answerMap = content.answers as Record<string, string>;
  questions.forEach((question, index) => {
    const values = answers[question.question] ?? [];
    if (values.length === 0) return;
    answerMap[question.question] = values.join(", ").trim();
    const answer = question.multiSelect ? values : values[0];
    content[`answer_${index}`] = answer;
    if (questions.length === 1) content.answer = answer;
  });
  return content;
}
