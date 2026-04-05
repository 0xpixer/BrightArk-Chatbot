/**
 * Backward-compatible names for code that imported from this file.
 * Source of truth: `lib/prompts/*`; runtime values come from the database via siteSettings.
 */
export {
  welcomeMessage as DEFAULT_WELCOME_MESSAGE,
  classification as DEFAULT_PROMPT_CLASSIFICATION,
  agentIntro as DEFAULT_PROMPT_AGENT_INTRO,
  agentTone as DEFAULT_PROMPT_AGENT_TONE,
  informationAgent as DEFAULT_PROMPT_INFORMATION_AGENT,
  liveChatReplyRules as DEFAULT_LIVE_CHAT_REPLY_RULES,
  shopperFacingMaxTokens as DEFAULT_SHOPPER_FACING_MAX_TOKENS,
} from '../prompts/index.js';
