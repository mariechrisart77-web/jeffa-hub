/**
 * @typedef {{role: string, content: string}} Message
 * @param {Message[]} messages
 * @param {number} limit
 * @returns {Message[]}
 */
export function trimHistory(messages, limit) {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}
