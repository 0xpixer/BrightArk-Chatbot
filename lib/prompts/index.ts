/**
 * Default prompt copy for new SiteSettings rows and API fallbacks.
 * Each field lives in its own file under lib/prompts/; Admin → Prompts stores overrides in the database.
 */
export { welcomeMessage } from './welcomeMessage.js';
export { classification } from './classification.js';
export { agentIntro } from './agentIntro.js';
export { agentTone } from './agentTone.js';
export { informationAgent } from './informationAgent.js';
export { liveChatReplyRules } from './liveChatReplyRules.js';
export { shopperFacingMaxTokens } from './shopperFacingMaxTokens.js';

import { welcomeMessage } from './welcomeMessage.js';
import { classification } from './classification.js';
import { agentIntro } from './agentIntro.js';
import { agentTone } from './agentTone.js';
import { informationAgent } from './informationAgent.js';
import { liveChatReplyRules } from './liveChatReplyRules.js';
import { shopperFacingMaxTokens } from './shopperFacingMaxTokens.js';

/** Single object for seeds and tooling. */
export const defaultPromptBundle = {
  welcomeMessage,
  classification,
  agentIntro,
  agentTone,
  informationAgent,
  liveChatReplyRules,
  shopperFacingMaxTokens,
} as const;
