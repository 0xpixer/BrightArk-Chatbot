/**
 * BrightArk workflow — Agents SDK. `OPENAI_WORKFLOW_ID` is for tracing only.
 * Model, base URL, and prompts can be overridden per request via `WorkflowRunOptions`.
 */
import { Agent, Runner, assistant, user, withTrace } from '@openai/agents';
import { OpenAIProvider } from '@openai/agents-openai';
import type { AgentInputItem } from '@openai/agents';
import { runGuardrails, type GuardrailBundle } from '@openai/guardrails';
import '@openai/guardrails';
import OpenAI from 'openai';
import { z } from 'zod';
import type { WorkflowRuntimeConfig } from './runtimeConfig.js';
import {
  DEFAULT_PROMPT_CLASSIFICATION,
  DEFAULT_PROMPT_INFORMATION_AGENT,
  DEFAULT_PROMPT_SARAH_INTRO,
  DEFAULT_PROMPT_SARAH_TONE,
} from './promptDefaults.js';

const WORKFLOW_ID =
  process.env.OPENAI_WORKFLOW_ID?.trim() ||
  'wf_69d06a9b8f708190a49d2fb0a96f45210dda58e7b54f5c6e';

export type { WorkflowRuntimeConfig } from './runtimeConfig.js';

export type ConversationTurn = { role: 'user' | 'assistant'; content: string };

export type WorkflowInput = {
  input_as_text: string;
  conversationHistory?: ConversationTurn[];
  timezone?: string;
  userLocalDateToday?: string;
};

export type WorkflowResult =
  | { message: string }
  | { output_text: string }
  | { output_parsed?: unknown }
  | { safe_text: string }
  | Record<string, unknown>;

export type WorkflowRunOptions = {
  runtime: WorkflowRuntimeConfig;
  /** OpenAI-compatible client for @openai/guardrails (use a real OpenAI key when the main LLM is a third-party API). */
  guardrailClient: OpenAI;
  /** Model name the guardrail bundle calls (must exist on guardrailClient’s API). */
  guardrailModel: string;
};

function defaultRuntime(): WorkflowRuntimeConfig {
  const key = process.env.OPENAI_API_KEY?.trim() ?? '';
  return {
    openaiApiKey: key,
    baseUrl: undefined,
    models: {
      classification: 'gpt-4.1-nano',
      sarah: 'gpt-5-nano',
      information: 'gpt-4.1-nano',
    },
    prompts: {
      classification: DEFAULT_PROMPT_CLASSIFICATION,
      sarahIntro: DEFAULT_PROMPT_SARAH_INTRO,
      sarahTone: DEFAULT_PROMPT_SARAH_TONE,
      informationAgent: DEFAULT_PROMPT_INFORMATION_AGENT,
    },
  };
}

export function resolveWorkflowRunOptions(override?: Partial<WorkflowRunOptions>): WorkflowRunOptions {
  const runtime = override?.runtime ?? defaultRuntime();
  const guardrailKey =
    process.env.GUARDRAILS_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    runtime.openaiApiKey;
  const guardrailBase =
    process.env.GUARDRAILS_OPENAI_BASE_URL?.trim() || undefined;
  const guardrailClient =
    override?.guardrailClient ??
    new OpenAI({
      apiKey: guardrailKey,
      baseURL: guardrailBase,
    });
  const guardrailModel =
    override?.guardrailModel ??
    (process.env.GUARDRAIL_MODEL?.trim() || 'gpt-4o-mini');
  return { runtime, guardrailClient, guardrailModel };
}

function jailbreakBundle(model: string): GuardrailBundle {
  return {
    guardrails: [
      {
        name: 'Jailbreak',
        config: { model, confidence_threshold: 0.7 },
      },
    ],
  };
}

function guardrailsHasTripwire(results: unknown[]): boolean {
  return (results ?? []).some((r) => (r as { tripwireTriggered?: boolean })?.tripwireTriggered === true);
}

function getGuardrailSafeText(results: unknown[], fallbackText: string): string {
  for (const r of results ?? []) {
    const info = (r as { info?: Record<string, unknown> })?.info;
    if (info && 'checked_text' in info) {
      return (info.checked_text as string) ?? fallbackText;
    }
  }
  const pii = (results ?? []).find(
    (r) => (r as { info?: Record<string, unknown> })?.info && 'anonymized_text' in (r as { info: Record<string, unknown> }).info,
  ) as { info?: { anonymized_text?: string } } | undefined;
  return pii?.info?.anonymized_text ?? fallbackText;
}

async function scrubConversationHistory(
  history: unknown[],
  piiOnly: GuardrailBundle,
  guardrailContext: { guardrailLlm: OpenAI },
): Promise<void> {
  for (const msg of history ?? []) {
    const content = Array.isArray((msg as { content?: unknown })?.content)
      ? (msg as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === 'object' &&
        (part as { type?: string }).type === 'input_text' &&
        typeof (part as { text?: string }).text === 'string'
      ) {
        const res = await runGuardrails((part as { text: string }).text, piiOnly, guardrailContext, true);
        (part as { text: string }).text = getGuardrailSafeText(res, (part as { text: string }).text);
      }
    }
  }
}

async function scrubWorkflowInput(
  workflow: Record<string, unknown>,
  inputKey: string,
  piiOnly: GuardrailBundle,
  guardrailContext: { guardrailLlm: OpenAI },
): Promise<void> {
  if (!workflow || typeof workflow !== 'object') return;
  const value = workflow[inputKey];
  if (typeof value !== 'string') return;
  const res = await runGuardrails(value, piiOnly, guardrailContext, true);
  workflow[inputKey] = getGuardrailSafeText(res, value);
}

async function runAndApplyGuardrails(
  inputText: string,
  config: GuardrailBundle,
  history: unknown[],
  workflow: Record<string, unknown>,
  guardrailContext: { guardrailLlm: OpenAI },
) {
  const guardrails = Array.isArray(config?.guardrails) ? config.guardrails : [];
  const results = await runGuardrails(inputText, config, guardrailContext, true);
  const shouldMaskPII = guardrails.find(
    (g) =>
      (g as { name?: string; config?: { block?: boolean } })?.name === 'Contains PII' &&
      (g as { config?: { block?: boolean } })?.config &&
      (g as { config: { block?: boolean } }).config.block === false,
  );
  if (shouldMaskPII) {
    const piiOnly: GuardrailBundle = { guardrails: [shouldMaskPII as GuardrailBundle['guardrails'][number]] };
    await scrubConversationHistory(history, piiOnly, guardrailContext);
    await scrubWorkflowInput(workflow, 'input_as_text', piiOnly, guardrailContext);
    await scrubWorkflowInput(workflow, 'input_text', piiOnly, guardrailContext);
  }
  const hasTripwire = guardrailsHasTripwire(results);
  const safeText = getGuardrailSafeText(results, inputText) ?? inputText;
  return {
    results,
    hasTripwire,
    safeText,
    failOutput: buildGuardrailFailOutput(results ?? []),
    passOutput: { safe_text: safeText },
  };
}

function buildGuardrailFailOutput(results: unknown[]) {
  const get = (name: string) =>
    (results ?? []).find(
      (r) =>
        ((r as { info?: { guardrail_name?: string; guardrailName?: string } })?.info?.guardrail_name ??
          (r as { info?: { guardrailName?: string } })?.info?.guardrailName) === name,
    ) as { tripwireTriggered?: boolean; info?: Record<string, unknown> } | undefined;
  const pii = get('Contains PII');
  const mod = get('Moderation');
  const jb = get('Jailbreak');
  const hal = get('Hallucination Detection');
  const nsfw = get('NSFW Text');
  const url = get('URL Filter');
  const custom = get('Custom Prompt Check');
  const pid = get('Prompt Injection Detection');
  const piiCounts = Object.entries((pii?.info?.detected_entities as Record<string, unknown>) ?? {})
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}:${(v as unknown[]).length}`);
  return {
    pii: { failed: piiCounts.length > 0 || pii?.tripwireTriggered === true, detected_counts: piiCounts },
    moderation: {
      failed: mod?.tripwireTriggered === true || ((mod?.info?.flagged_categories as unknown[]) ?? []).length > 0,
      flagged_categories: mod?.info?.flagged_categories,
    },
    jailbreak: { failed: jb?.tripwireTriggered === true },
    hallucination: {
      failed: hal?.tripwireTriggered === true,
      reasoning: hal?.info?.reasoning,
      hallucination_type: hal?.info?.hallucination_type,
      hallucinated_statements: hal?.info?.hallucinated_statements,
      verified_statements: hal?.info?.verified_statements,
    },
    nsfw: { failed: nsfw?.tripwireTriggered === true },
    url_filter: { failed: url?.tripwireTriggered === true },
    custom_prompt_check: { failed: custom?.tripwireTriggered === true },
    prompt_injection: { failed: pid?.tripwireTriggered === true },
  };
}

const ClassificationAgentSchema = z.object({
  classification: z.enum(['product_promotion', 'get_information']),
});

function buildAgents(runtime: WorkflowRuntimeConfig) {
  const classificationAgent = new Agent({
    name: 'Classification agent',
    instructions: runtime.prompts.classification,
    model: runtime.models.classification,
    outputType: ClassificationAgentSchema,
    modelSettings: {
      temperature: 1,
      topP: 1,
      maxTokens: 2048,
      store: true,
    },
  });

  const sarahInstructions =
    runtime.prompts.sarahIntro.trim() +
    '\n\nCommunication tone: ' +
    runtime.prompts.sarahTone.trim();

  const sarahAgent = new Agent({
    name: 'Agent',
    instructions: sarahInstructions,
    model: runtime.models.sarah,
    modelSettings: {
      temperature: 1,
      topP: 1,
      maxTokens: 2048,
      store: true,
    },
  });

  const informationAgent = new Agent({
    name: 'Information agent',
    instructions: runtime.prompts.informationAgent,
    model: runtime.models.information,
    modelSettings: {
      temperature: 1,
      topP: 1,
      maxTokens: 2048,
      store: true,
    },
  });

  return { classificationAgent, sarahAgent, informationAgent };
}

function buildUserMessageText(workflow: WorkflowInput): string {
  const tz = workflow.timezone?.trim();
  const date = workflow.userLocalDateToday?.trim();
  if (tz && date) {
    return (
      "[User's local calendar date: " +
      date +
      ' (time zone: ' +
      tz +
      '). Use this when the user asks about "today", relative dates, or scheduling.]\n\n' +
      workflow.input_as_text
    );
  }
  return workflow.input_as_text;
}

function buildConversationItems(workflow: WorkflowInput): AgentInputItem[] {
  const items: AgentInputItem[] = [];
  for (const turn of workflow.conversationHistory ?? []) {
    if (turn.role === 'user') items.push(user(turn.content));
    else items.push(assistant(turn.content));
  }
  items.push({
    role: 'user',
    content: [{ type: 'input_text', text: buildUserMessageText(workflow) }],
  });
  return items;
}

/** True if text is only the classifier JSON (models often echo this if it stays in history). */
function isClassificationOnlyPayload(text: string): boolean {
  try {
    const o = JSON.parse(text.trim()) as Record<string, unknown>;
    const keys = Object.keys(o);
    return (
      keys.length === 1 &&
      keys[0] === 'classification' &&
      (o.classification === 'product_promotion' || o.classification === 'get_information')
    );
  } catch {
    return false;
  }
}

function cloneAgentInputItems(history: AgentInputItem[]): AgentInputItem[] {
  try {
    return structuredClone(history) as AgentInputItem[];
  } catch {
    return JSON.parse(JSON.stringify(history)) as AgentInputItem[];
  }
}

/**
 * Replace the classifier's structured JSON assistant turn with a prose hint so Sarah / Information
 * models answer in natural language instead of repeating `{"classification":...}`.
 */
function scrubClassificationAssistantEcho(
  history: AgentInputItem[],
  classification: 'product_promotion' | 'get_information',
): AgentInputItem[] {
  const hint =
    classification === 'get_information'
      ? '[Routing: the shopper needs factual product or support information. Answer in clear, natural sentences. Do not output JSON.]'
      : '[Routing: the shopper wants warm brand conversation as Sarah. Answer in natural sentences. Do not output JSON.]';

  const clone = cloneAgentInputItems(history);
  for (let i = clone.length - 1; i >= 0; i--) {
    const item = clone[i] as {
      type?: string;
      role?: string;
      content?: unknown;
    };
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) {
      continue;
    }
    let touched = false;
    for (const part of item.content) {
      const p = part as { type?: string; text?: string };
      if (
        p?.type === 'output_text' &&
        typeof p.text === 'string' &&
        isClassificationOnlyPayload(p.text)
      ) {
        p.text = hint;
        touched = true;
      }
    }
    if (touched) break;
  }
  return clone;
}

function finalOutputToText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  return JSON.stringify(output);
}

const STREAM_REFUSAL_REPLY = "I'm sorry, I can't help with that.";

async function runStreamingFinalAgent(
  runner: Runner,
  agent: Agent<any, any>,
  history: AgentInputItem[],
  onDelta: (text: string) => void,
): Promise<{ reply: string; history: AgentInputItem[] }> {
  const streamed = await runner.run(agent, history, { stream: true, maxTurns: 25 });
  const webStream = streamed.toTextStream() as unknown as {
    getReader(): ReadableStreamDefaultReader<string>;
  };
  const reader = webStream.getReader();
  let accumulated = '';
  try {
    await Promise.all([
      streamed.completed,
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            accumulated += value;
            onDelta(value);
          }
        }
      })(),
    ]);
  } finally {
    reader.releaseLock();
  }
  const fo = streamed.finalOutput;
  let reply =
    typeof fo === 'string' && fo.trim() !== ''
      ? fo
      : accumulated;
  if (isClassificationOnlyPayload(reply.trim())) {
    const r2 = await runner.run(agent, streamed.history, { maxTurns: 25, stream: false });
    if (r2.finalOutput === undefined || r2.finalOutput === null) {
      throw new Error('Agent result is undefined');
    }
    reply =
      typeof r2.finalOutput === 'string' && r2.finalOutput.trim() !== ''
        ? r2.finalOutput
        : finalOutputToText(r2.finalOutput);
    return { reply, history: r2.history };
  }
  return { reply, history: streamed.history };
}

function makeRunner(runtime: WorkflowRuntimeConfig): Runner {
  const provider = new OpenAIProvider({
    apiKey: runtime.openaiApiKey,
    baseURL: runtime.baseUrl || undefined,
  });
  return new Runner({
    modelProvider: provider,
    traceMetadata: {
      __trace_source__: 'agent-builder',
      workflow_id: WORKFLOW_ID,
    },
  });
}

export const runWorkflowStreaming = async (
  workflow: WorkflowInput,
  onDelta: (text: string) => void,
  options?: WorkflowRunOptions,
): Promise<{ reply: string }> => {
  const opts = options ?? resolveWorkflowRunOptions();
  const { classificationAgent, sarahAgent, informationAgent } = buildAgents(opts.runtime);
  const guardrailContext = { guardrailLlm: opts.guardrailClient };

  return await withTrace('BrightArk Chatbot', async () => {
    const workflowRecord = workflow as unknown as Record<string, unknown>;
    let conversationHistory: AgentInputItem[] = buildConversationItems(workflow);

    const runner = makeRunner(opts.runtime);

    const { hasTripwire: tripwire } = await runAndApplyGuardrails(
      workflow.input_as_text,
      jailbreakBundle(opts.guardrailModel),
      conversationHistory as unknown[],
      workflowRecord,
      guardrailContext,
    );

    if (tripwire) {
      return { reply: STREAM_REFUSAL_REPLY };
    }

    const classificationResult = await runner.run(classificationAgent, conversationHistory, {
      maxTurns: 25,
    });
    conversationHistory = classificationResult.history;

    if (!classificationResult.finalOutput) {
      throw new Error('Agent result is undefined');
    }

    const classification = classificationResult.finalOutput.classification;
    conversationHistory = scrubClassificationAssistantEcho(
      classificationResult.history,
      classification,
    );

    if (classification === 'product_promotion') {
      const { reply } = await runStreamingFinalAgent(runner, sarahAgent, conversationHistory, onDelta);
      return { reply };
    }

    if (classification === 'get_information') {
      const { reply } = await runStreamingFinalAgent(
        runner,
        informationAgent,
        conversationHistory,
        onDelta,
      );
      return { reply };
    }

    const fallback = JSON.stringify(classificationResult.finalOutput);
    onDelta(fallback);
    return { reply: fallback };
  });
};

export const runWorkflow = async (
  workflow: WorkflowInput,
  options?: WorkflowRunOptions,
): Promise<WorkflowResult> => {
  const opts = options ?? resolveWorkflowRunOptions();
  const { classificationAgent, sarahAgent, informationAgent } = buildAgents(opts.runtime);
  const guardrailContext = { guardrailLlm: opts.guardrailClient };

  return await withTrace('BrightArk Chatbot', async () => {
    const workflowRecord = workflow as unknown as Record<string, unknown>;
    let conversationHistory: AgentInputItem[] = buildConversationItems(workflow);

    const runner = makeRunner(opts.runtime);

    const guardrailsInputText = workflow.input_as_text;
    const { hasTripwire: tripwire, failOutput: guardrailsFailOutput } = await runAndApplyGuardrails(
      guardrailsInputText,
      jailbreakBundle(opts.guardrailModel),
      conversationHistory as unknown[],
      workflowRecord,
      guardrailContext,
    );

    if (tripwire) {
      void guardrailsFailOutput;
      return { safe_text: '' };
    }

    const classificationResult = await runner.run(classificationAgent, conversationHistory, {
      maxTurns: 25,
    });
    conversationHistory = classificationResult.history;

    if (!classificationResult.finalOutput) {
      throw new Error('Agent result is undefined');
    }

    const classification = classificationResult.finalOutput.classification;
    conversationHistory = scrubClassificationAssistantEcho(
      classificationResult.history,
      classification,
    );

    if (classification === 'product_promotion') {
      const r = await runner.run(sarahAgent, conversationHistory, { maxTurns: 25 });
      conversationHistory = r.history;
      if (r.finalOutput === undefined || r.finalOutput === null) {
        throw new Error('Agent result is undefined');
      }
      return { output_text: finalOutputToText(r.finalOutput) };
    }

    if (classification === 'get_information') {
      const r = await runner.run(informationAgent, conversationHistory, { maxTurns: 25 });
      conversationHistory = r.history;
      if (r.finalOutput === undefined || r.finalOutput === null) {
        throw new Error('Agent result is undefined');
      }
      return { output_text: finalOutputToText(r.finalOutput) };
    }

    return {
      output_text: JSON.stringify(classificationResult.finalOutput),
      output_parsed: classificationResult.finalOutput,
    };
  });
};
