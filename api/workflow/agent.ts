import {
  Agent,
  Runner,
  assistant,
  tool,
  user,
  withTrace,
} from '@openai/agents';
import type { AgentInputItem } from '@openai/agents';
import { runGuardrails, type GuardrailBundle } from '@openai/guardrails';
import '@openai/guardrails';
import OpenAI from 'openai';
import { z } from 'zod';

const WORKFLOW_ID =
  process.env.OPENAI_WORKFLOW_ID?.trim() ||
  'wf_69d06a9b8f708190a49d2fb0a96f45210dda58e7b54f5c6e';

export type ConversationTurn = { role: 'user' | 'assistant'; content: string };

export type WorkflowInput = {
  input_as_text: string;
  conversationHistory?: ConversationTurn[];
};

export type WorkflowResult =
  | { message: string }
  | { output_text: string }
  | { output_parsed?: unknown }
  | { safe_text: string }
  | Record<string, unknown>;

const getRetentionOffers = tool({
  name: 'getRetentionOffers',
  description: 'Retrieve possible retention offers for a customer',
  parameters: z.object({
    customer_id: z.string(),
    account_type: z.string(),
    current_plan: z.string(),
    tenure_months: z.number().int(),
    recent_complaints: z.boolean(),
  }),
  execute: async () => {
    // TODO: Unimplemented — return structured placeholder for the agent
    return JSON.stringify({ offers: [] });
  },
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const jailbreakGuardrailConfig = {
  guardrails: [
    {
      name: 'Jailbreak',
      config: { model: 'gpt-5-nano', confidence_threshold: 0.7 },
    },
  ],
};

const context = { guardrailLlm: client };

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

async function scrubConversationHistory(history: unknown[], piiOnly: GuardrailBundle): Promise<void> {
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
        const res = await runGuardrails((part as { text: string }).text, piiOnly, context, true);
        (part as { text: string }).text = getGuardrailSafeText(res, (part as { text: string }).text);
      }
    }
  }
}

async function scrubWorkflowInput(workflow: Record<string, unknown>, inputKey: string, piiOnly: GuardrailBundle): Promise<void> {
  if (!workflow || typeof workflow !== 'object') return;
  const value = workflow[inputKey];
  if (typeof value !== 'string') return;
  const res = await runGuardrails(value, piiOnly, context, true);
  workflow[inputKey] = getGuardrailSafeText(res, value);
}

async function runAndApplyGuardrails(
  inputText: string,
  config: GuardrailBundle,
  history: unknown[],
  workflow: Record<string, unknown>,
) {
  const guardrails = Array.isArray(config?.guardrails) ? config.guardrails : [];
  const results = await runGuardrails(inputText, config, context, true);
  const shouldMaskPII = guardrails.find(
    (g) =>
      (g as { name?: string; config?: { block?: boolean } })?.name === 'Contains PII' &&
      (g as { config?: { block?: boolean } })?.config &&
      (g as { config: { block?: boolean } }).config.block === false,
  );
  if (shouldMaskPII) {
    const piiOnly: GuardrailBundle = { guardrails: [shouldMaskPII as GuardrailBundle['guardrails'][number]] };
    await scrubConversationHistory(history, piiOnly);
    await scrubWorkflowInput(workflow, 'input_as_text', piiOnly);
    await scrubWorkflowInput(workflow, 'input_text', piiOnly);
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
  classification: z.enum(['return_item', 'cancel_subscription', 'get_information']),
});

const classificationAgent = new Agent({
  name: 'Classification agent',
  instructions: `Classify the user’s intent into one of the following categories: "return_item", "cancel_subscription", or "get_information".

1. Any device-related return requests should route to return_item.
2. Any retention or cancellation risk, including any request for discounts should route to cancel_subscription.
3. Any other requests should go to get_information.`,
  model: 'gpt-4.1-mini',
  outputType: ClassificationAgentSchema,
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true,
  },
});

const returnAgent = new Agent({
  name: 'Return agent',
  instructions: `Offer a replacement device with free shipping.
`,
  model: 'gpt-4.1-mini',
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true,
  },
});

const retentionAgent = new Agent({
  name: 'Retention Agent',
  instructions:
    'You are a customer retention conversational agent whose goal is to prevent subscription cancellations. Ask for their current plan and reason for dissatisfaction. Use getRetentionOffers to identify return options. For now, just say there is a 20% offer available for 1 year.',
  model: 'gpt-4.1-mini',
  tools: [getRetentionOffers],
  modelSettings: {
    temperature: 1,
    topP: 1,
    parallelToolCalls: true,
    maxTokens: 2048,
    store: true,
  },
});

const informationAgent = new Agent({
  name: 'Information agent',
  instructions: `BrightArk Digital Expert: System Instructions
Role: You are the BrightArk Digital Expert, a professional assistant for dentists and distributors. Your mission is to provide technical, clinical, and commercial information regarding BrightArk’s end-to-end digital dentistry solutions.
Communication Tone: Professional, innovative, and concise. Always prioritize accuracy and efficiency to reflect BrightArk’s core values of Innovation, Care, and Integrity.
 --------------------------------------------------------------------------------
1. Product Ecosystem Knowledge (Required Mappings)
BrightArk iAlign (Clear Aligners): Features iMemory™ Shape Memory Technology that self-recovers up to 99.8% of its original state when soaked in warm water to maintain consistent force.
BrightArk iScan (Intraoral Scanner): An ultra-lightweight (210g), calibration-free scanner. It features AI lesion detection for 8 major issues and integrated anti-fog heating.
BrightArk iDesign (AI Platform): Formerly known as LingOral. An intelligent medical application for organizing records, performing cephalometric/3D analysis, and fusing CBCT data with crown scans.
BrightArk iTracker: An AI monitoring system for weekly "smile selfies," allowing remote treatment tracking without frequent clinic visits.
BrightArk iShade (Digital Shade Detector): Uses spectrophotometer technology to achieve 92.5% accuracy in shade matching (compared to 67.5% with traditional guides).
 --------------------------------------------------------------------------------
2. Commercial & Support Programs
Partner Program: Offer tiered benefits (Gold, Platinum, Diamond) based on case volume, including online training, offline seminars, and discounts ranging from 10% to 30%.
Referral Program: Dentists earn a 2% referral fee on paid order values from their referee’s clinic for the first 12 months.
Global Support: BrightArk provides local service teams in Singapore (HQ), the United States, Indonesia, Thailand, and Australia.
 --------------------------------------------------------------------------------
3. Technical Troubleshooting
iScan Setup: Requires Windows 10/11 Pro/Corporate (64-bit), minimum 16GB RAM, and an NVIDIA GeForce 1660GTX or higher (AMD cards not supported).
iShade Inaccuracy: Instruct users to perform white balance calibration by placing the device on its base and ensure the probe is clean and parallel to the tooth surface.
iAlign Maintenance: Patients must wear aligners for 22+ hours daily. Only cool water is permitted; hot liquids will deform the shape-memory material.
 --------------------------------------------------------------------------------
4. Agent Operational Rules
Be Direct: Do not provide unnecessary preamble.
Dentist/Distributor Focus: If a user asks about becoming a partner, immediately mention the gold/platinum/diamond tiers and clinical support.
Safety First: For any reports of pain or allergic reactions, the agent must instruct the user to stop use and contact a trained professional immediately.

Important: For those questions you can not answer, ask customers to info@thebrightark.com or leave a message in the contact page https://thebrightark.com/pages/contact`,
  model: 'gpt-4.1-nano',
  modelSettings: {
    temperature: 1,
    topP: 1,
    maxTokens: 2048,
    store: true,
  },
});

function approvalRequest(_message: string): boolean {
  // TODO: Implement human-in-the-loop
  return true;
}

function buildConversationItems(workflow: WorkflowInput): AgentInputItem[] {
  const items: AgentInputItem[] = [];
  for (const turn of workflow.conversationHistory ?? []) {
    if (turn.role === 'user') items.push(user(turn.content));
    else items.push(assistant(turn.content));
  }
  items.push({
    role: 'user',
    content: [{ type: 'input_text', text: workflow.input_as_text }],
  });
  return items;
}

function finalOutputToText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  return JSON.stringify(output);
}

export const runWorkflow = async (workflow: WorkflowInput): Promise<WorkflowResult> => {
  return await withTrace('BrightArk Chatbot', async () => {
    const workflowRecord = workflow as unknown as Record<string, unknown>;
    let conversationHistory: AgentInputItem[] = buildConversationItems(workflow);

    const runner = new Runner({
      traceMetadata: {
        __trace_source__: 'agent-builder',
        workflow_id: WORKFLOW_ID,
      },
    });

    const guardrailsInputText = workflow.input_as_text;
    const {
      hasTripwire: tripwire,
      failOutput: guardrailsFailOutput,
    } = await runAndApplyGuardrails(
      guardrailsInputText,
      jailbreakGuardrailConfig,
      conversationHistory as unknown[],
      workflowRecord,
    );

    if (tripwire) {
      void guardrailsFailOutput;
      return { safe_text: '' };
    }

    const classificationResult = await runner.run(classificationAgent, conversationHistory);
    conversationHistory = classificationResult.history;

    if (!classificationResult.finalOutput) {
      throw new Error('Agent result is undefined');
    }

    const classification = classificationResult.finalOutput.classification;

    if (classification === 'return_item') {
      const returnResult = await runner.run(returnAgent, conversationHistory);
      conversationHistory = returnResult.history;

      if (!returnResult.finalOutput) {
        throw new Error('Agent result is undefined');
      }

      const approvalMessage = 'Does this work for you?';
      if (approvalRequest(approvalMessage)) {
        return { message: 'Your return is on the way.' };
      }
      return { message: 'What else can I help you with?' };
    }

    if (classification === 'cancel_subscription') {
      const retentionResult = await runner.run(retentionAgent, conversationHistory);
      conversationHistory = retentionResult.history;

      if (retentionResult.finalOutput === undefined || retentionResult.finalOutput === null) {
        throw new Error('Agent result is undefined');
      }

      return { output_text: finalOutputToText(retentionResult.finalOutput) };
    }

    if (classification === 'get_information') {
      const informationResult = await runner.run(informationAgent, conversationHistory);
      conversationHistory = informationResult.history;

      if (informationResult.finalOutput === undefined || informationResult.finalOutput === null) {
        throw new Error('Agent result is undefined');
      }

      return { output_text: finalOutputToText(informationResult.finalOutput) };
    }

    return {
      output_text: JSON.stringify(classificationResult.finalOutput),
      output_parsed: classificationResult.finalOutput,
    };
  });
};
