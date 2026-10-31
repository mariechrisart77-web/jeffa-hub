// Einziger Einstieg der Prompt-App: Chat (Browser+Server) und Bild (Server).
// Bild-Teil kommt aus ./index.js (reiner Prompt-Plan), Chat-Teil aus dem shared-Modul,
// das Browser (apps/chat) und Server (functions/api/chat.ts) gemeinsam nutzen.
export {
  buildPromptPlan,
  buildPromptPlan as buildImagePrompt,
  guardAdult,
  reconcile,
  isAdultProfile,
} from './index.js';

export {
  buildChatSystem,
  genderOf,
  genderLine,
  genderize,
  emojiStyle,
  normalizeMode,
  CHAT_AGE_RULE,
  pickChatModels,
  isUncensoredModel,
  isRefusal,
  refusalFallback,
  autoImageDecision,
} from '../../apps/shared/promptapp/chat.js';
