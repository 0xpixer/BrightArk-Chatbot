/**
 * IMPORTANT — Agent Builder vs this file
 *
 * What you configure and “train” in OpenAI **Agent Builder** (platform.openai.com) is a
 * **hosted workflow** (`wf_…`). This repository does **not** load that workflow by ID.
 * The code below defines **separate** agents in TypeScript, so replies follow these
 * prompts—not the canvas you edited in Builder—unless you replace this file.
 *
 * To use your trained Builder workflow with this Shopify + `/api/chat` setup:
 * 1. Open your workflow in Agent Builder → **Code** (top nav).
 * 2. Copy / download the generated **Agents SDK** source and paste it here (or merge),
 *    preserving an exported `runWorkflow` with the same shape `{ input_as_text, conversationHistory? }`
 *    and return type compatible with `api/chat.ts` (`message` / `output_text` / `safe_text`).
 *
 * Alternative: keep Builder as the source of truth by embedding **ChatKit** (OpenAI hosts
 * the workflow); that uses a different frontend than `public/chat-widget.js`. See README.
 */
import {
  Agent,
  Runner,
  assistant,
  InputGuardrailTripwireTriggered,
  OutputGuardrailTripwireTriggered,
  tool,
  user,
} from '@openai/agents';
import type { AgentInputItem } from '@openai/agents-core';
import { runGuardrails } from '@openai/guardrails';
import '@openai/guardrails';
import { z } from 'zod';

/** Trace metadata only (dashboard grouping)—does not load the Builder workflow. */
const WORKFLOW_TRACE_ID =
  process.env.OPENAI_WORKFLOW_ID?.trim() ||
  'wf_69d06a9b8f708190a49d2fb0a96f45210dda58e7b54f5c6e';

export type ConversationTurn = { role: 'user' | 'assistant'; content: string };

export type WorkflowInput = {
  input_as_text: string;
  /** Prior turns (excluding the current `input_as_text`); keeps the multi-agent run stateless across HTTP requests */
  conversationHistory?: ConversationTurn[];
};

export type WorkflowResult =
  | { message: string }
  | { output_text: string }
  | { safe_text: string };

/** TODO: Human-in-the-loop approvals for sensitive tool actions */
export async function approvalRequest(_payload: unknown): Promise<void> {
  throw new Error('approvalRequest is not implemented yet');
}

const getRetentionOffers = tool({
  name: 'get_retention_offers',
  description:
    'Fetch personalized retention or win-back offers for the shopper. Call when the user is canceling, unhappy, or asking for a deal.',
  parameters: z.object({
    reason: z.string().optional().describe('Why retention context applies'),
  }),
  execute: async () => {
    // TODO: Integrate with Shopify discounts / CRM
    return JSON.stringify({ offers: [] });
  },
});

const informationAgent = new Agent({
  name: 'Information Agent',
  instructions: `You are BrightArk's Digital Expert for the Shopify storefront.
Answer product, shipping, sizing, brand, and general shopping questions clearly and helpfully.
Keep replies concise. If you lack store-specific data, say what you can infer and suggest checking the product page or contacting support.`,
  outputType: z.object({
    message: z.string().describe('User-facing reply'),
  }),
});

const returnAgent = new Agent({
  name: 'Return Agent',
  instructions: `You handle returns, exchanges, order issues, and refunds for BrightArk.
Be empathetic and policy-aware. Explain steps the customer should take in Shopify (order page, return portal if any).
Do not invent a return policy; if unknown, describe typical next steps and offer to escalate.`,
  outputType: z.object({
    output_text: z.string().describe('User-facing reply'),
  }),
});

const retentionAgent = new Agent({
  name: 'Retention Agent',
  instructions: `You help retain customers who are canceling subscriptions, complaining, or comparing competitors.
Use tools when offers or incentives are relevant. Be respectful—no pressure tactics.`,
  tools: [getRetentionOffers],
  outputType: z.object({
    message: z.string().describe('User-facing reply'),
  }),
});

const classificationAgent = Agent.create({
  name: 'Classification Agent',
  instructions: `You route BrightArk storefront chat to the right specialist:
- **Return Agent**: returns, refunds, exchanges, wrong/damaged items, order problems.
- **Retention Agent**: cancellation, competitor mentions, "I'm leaving", loyalty/churn, asking for discounts to stay.
- **Information Agent**: everything else (products, how-to, shipping times, general BrightArk questions).

Hand off to exactly one specialist. Do not answer the user yourself.`,
  handoffs: [returnAgent, retentionAgent, informationAgent],
});

const inputGuardrailBundle = {
  guardrails: [
    {
      name: 'Secret Keys',
      config: { threshold: 'permissive' as const },
    },
  ],
};

function buildAgentInput(workflow: WorkflowInput): string | AgentInputItem[] {
  const { input_as_text, conversationHistory } = workflow;
  if (!conversationHistory?.length) return input_as_text;
  const items: AgentInputItem[] = [];
  for (const turn of conversationHistory) {
    if (turn.role === 'user') items.push(user(turn.content));
    else items.push(assistant(turn.content));
  }
  items.push(user(input_as_text));
  return items;
}

function normalizeFinalOutput(
  finalOutput: unknown,
): { message: string } | { output_text: string } {
  if (finalOutput && typeof finalOutput === 'object') {
    const o = finalOutput as Record<string, unknown>;
    if (typeof o.message === 'string') return { message: o.message };
    if (typeof o.output_text === 'string') return { output_text: o.output_text };
  }
  return { message: String(finalOutput ?? '') };
}

export const runWorkflow = async (workflow: WorkflowInput): Promise<WorkflowResult> => {
  const guardrailResults = await runGuardrails(
    workflow.input_as_text,
    inputGuardrailBundle,
    {},
    false,
  );
  if (guardrailResults.some((r) => r.tripwireTriggered)) {
    return { safe_text: '' };
  }

  const runner = new Runner({
    traceMetadata: {
      workflow_id: WORKFLOW_TRACE_ID,
    },
    workflowName: 'BrightArk multi-agent storefront',
  });

  const agentInput = buildAgentInput(workflow);

  try {
    const result = await runner.run(classificationAgent, agentInput, { maxTurns: 25 });
    return normalizeFinalOutput(result.finalOutput);
  } catch (err) {
    if (
      err instanceof InputGuardrailTripwireTriggered ||
      err instanceof OutputGuardrailTripwireTriggered
    ) {
      return { safe_text: '' };
    }
    throw err;
  }
};
