import { ChatMessage } from "./providers";
import { trimHistory as trimShared } from "./shared/trim.js";

export function trimHistory(messages: ChatMessage[], limit: number): ChatMessage[] {
  return trimShared(messages, limit) as ChatMessage[];
}
