import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  runWorkflow,
  type ConversationTurn,
} from './workflow/agent.js';

type ChatBody = {
  message?: string;
  conversationHistory?: unknown;
};

function getCorsOrigin(): string {
  const domain = process.env.SHOPIFY_DOMAIN?.trim();
  if (!domain) return '*';
  if (domain.startsWith('http://') || domain.startsWith('https://')) return domain;
  return `https://${domain}`;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function parseHistory(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ConversationTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: string }).role;
    const content = (item as { content?: string }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string' || !content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

function extractReply(result: unknown): string {
  if (result && typeof result === 'object') {
    const o = result as Record<string, unknown>;
    if (typeof o.safe_text === 'string') {
      return "I'm sorry, I can't help with that.";
    }
    if (typeof o.message === 'string') return o.message;
    if (typeof o.output_text === 'string') return o.output_text;
  }
  return JSON.stringify(result ?? null);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const origin = getCorsOrigin();
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(500).json({
      error: 'Server misconfiguration',
      reply: 'Chat is temporarily unavailable.',
      conversationHistory: [],
    });
    return;
  }

  let body: ChatBody;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as ChatBody)
        : ((req.body ?? {}) as ChatBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    res.status(400).json({ error: 'Missing or empty "message"' });
    return;
  }

  const conversationHistory = parseHistory(body.conversationHistory);

  try {
    const result = await runWorkflow({
      input_as_text: message,
      conversationHistory,
    });
    const reply = extractReply(result);
    const nextHistory: ConversationTurn[] = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ];
    res.status(200).json({ reply, conversationHistory: nextHistory });
  } catch (err) {
    console.error('chat handler error', err);
    res.status(500).json({
      error: 'Failed to run assistant',
      reply: 'Something went wrong. Please try again in a moment.',
      conversationHistory,
    });
  }
}
