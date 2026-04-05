export type WorkflowRuntimeConfig = {
  openaiApiKey: string;
  baseUrl?: string;
  models: {
    classification: string;
    sarah: string;
    information: string;
  };
  prompts: {
    classification: string;
    sarahIntro: string;
    sarahTone: string;
    informationAgent: string;
  };
};
