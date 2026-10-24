import type { ChatMessage, QuestionMessage } from "@chotu/shared";

/** A question stays open until a later user message exists. */
export function openQuestion(messages: readonly ChatMessage[]): QuestionMessage | undefined {
  let candidate: QuestionMessage | undefined;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.kind !== "question") continue;
    const answered = messages.slice(index + 1).some((later) => later.role === "user");
    if (!answered) candidate = message;
  }
  return candidate;
}
