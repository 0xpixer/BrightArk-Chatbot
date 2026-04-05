export type WorkflowRuntimeConfig = {
  openaiApiKey: string;
  baseUrl?: string;
  models: {
    classification: string;
    /** Promotional / brand-conversation path (product_promotion). */
    agent: string;
    information: string;
  };
  /** Max output tokens for promotional + information agents. */
  shopperFacingMaxTokens: number;
  prompts: {
    classification: string;
    agentIntro: string;
    agentTone: string;
    informationAgent: string;
    liveChatReplyRules: string;
  };
};
