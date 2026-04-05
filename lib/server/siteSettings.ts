import type { SiteSettings } from '@prisma/client';
import { prisma, isDatabaseConfigured } from './prisma.js';
import {
  DEFAULT_PROMPT_CLASSIFICATION,
  DEFAULT_PROMPT_INFORMATION_AGENT,
  DEFAULT_PROMPT_SARAH_INTRO,
  DEFAULT_PROMPT_SARAH_TONE,
  DEFAULT_WELCOME_MESSAGE,
} from '../workflow/promptDefaults.js';
import { DEFAULT_WIDGET_THEME, mergeWidgetTheme, themeToCssVars, type WidgetTheme } from './widgetTheme.js';
import OpenAI from 'openai';
import type { WorkflowRunOptions } from '../workflow/agent.js';

export type SiteSettingsDTO = {
  widgetTheme: WidgetTheme;
  llmProviderLabel: string;
  llmBaseUrl: string | null;
  llmApiKeySet: boolean;
  llmClassificationModel: string;
  llmSarahModel: string;
  llmInformationModel: string;
  promptClassification: string;
  promptSarahIntro: string;
  promptSarahTone: string;
  promptInformationAgent: string;
  welcomeMessage: string;
};

function rowToDTO(row: SiteSettings): SiteSettingsDTO {
  return {
    widgetTheme: mergeWidgetTheme(row.widgetTheme),
    llmProviderLabel: row.llmProviderLabel,
    llmBaseUrl: row.llmBaseUrl,
    llmApiKeySet: Boolean(row.llmApiKey?.trim()),
    llmClassificationModel: row.llmClassificationModel,
    llmSarahModel: row.llmSarahModel,
    llmInformationModel: row.llmInformationModel,
    promptClassification: row.promptClassification,
    promptSarahIntro: row.promptSarahIntro,
    promptSarahTone: row.promptSarahTone,
    promptInformationAgent: row.promptInformationAgent,
    welcomeMessage: row.welcomeMessage,
  };
}

async function createDefaultRow(): Promise<SiteSettings> {
  return prisma.siteSettings.create({
    data: {
      id: 1,
      widgetTheme: DEFAULT_WIDGET_THEME as object,
      llmProviderLabel: 'openai',
      llmBaseUrl: null,
      llmApiKey: null,
      llmClassificationModel: 'gpt-4.1-nano',
      llmSarahModel: 'gpt-5-nano',
      llmInformationModel: 'gpt-4.1-nano',
      promptClassification: DEFAULT_PROMPT_CLASSIFICATION,
      promptSarahIntro: DEFAULT_PROMPT_SARAH_INTRO,
      promptSarahTone: DEFAULT_PROMPT_SARAH_TONE,
      promptInformationAgent: DEFAULT_PROMPT_INFORMATION_AGENT,
      welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    },
  });
}

/** Returns null if DATABASE_URL unset or DB unreachable — caller uses env-only fallbacks. */
export async function loadSiteSettingsRow(): Promise<SiteSettings | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    let row = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!row) {
      row = await createDefaultRow();
    }
    return row;
  } catch (e) {
    console.error('loadSiteSettingsRow', e);
    return null;
  }
}

export async function getSiteSettingsDTO(): Promise<SiteSettingsDTO | null> {
  const row = await loadSiteSettingsRow();
  return row ? rowToDTO(row) : null;
}

/** Build full workflow + guardrail options (OpenAI-compatible main LLM + optional separate guardrail OpenAI). */
export function buildWorkflowOptionsFromDb(row: SiteSettings | null): WorkflowRunOptions {
  const envKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const dbKey = row?.llmApiKey?.trim() ?? '';
  const openaiApiKey = dbKey || envKey;

  const baseFromRow = row?.llmBaseUrl?.trim() || undefined;
  const runtime = {
    openaiApiKey,
    baseUrl: baseFromRow,
    models: {
      classification: row?.llmClassificationModel?.trim() || 'gpt-4.1-nano',
      sarah: row?.llmSarahModel?.trim() || 'gpt-5-nano',
      information: row?.llmInformationModel?.trim() || 'gpt-4.1-nano',
    },
    prompts: {
      classification: row?.promptClassification?.trim() || DEFAULT_PROMPT_CLASSIFICATION,
      sarahIntro: row?.promptSarahIntro?.trim() || DEFAULT_PROMPT_SARAH_INTRO,
      sarahTone: row?.promptSarahTone?.trim() || DEFAULT_PROMPT_SARAH_TONE,
      informationAgent: row?.promptInformationAgent?.trim() || DEFAULT_PROMPT_INFORMATION_AGENT,
    },
  };

  const guardrailsKey =
    process.env.GUARDRAILS_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    openaiApiKey;
  const guardrailsBaseUrl = process.env.GUARDRAILS_OPENAI_BASE_URL?.trim() || undefined;
  const guardrailModel = process.env.GUARDRAIL_MODEL?.trim() || 'gpt-4o-mini';

  return {
    runtime,
    guardrailClient: new OpenAI({
      apiKey: guardrailsKey,
      baseURL: guardrailsBaseUrl,
    }),
    guardrailModel,
  };
}

export async function getPublicWidgetConfig(): Promise<{
  welcomeMessage: string;
  cssVars: Record<string, string>;
}> {
  const row = await loadSiteSettingsRow();
  const welcome = row?.welcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE;
  const theme = row ? mergeWidgetTheme(row.widgetTheme) : DEFAULT_WIDGET_THEME;
  return {
    welcomeMessage: welcome,
    cssVars: themeToCssVars(theme),
  };
}
