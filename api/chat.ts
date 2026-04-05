import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  runWorkflow,
  runWorkflowStreaming,
  type ConversationTurn,
} from './workflow/agent.js';
import { loadSiteSettingsRow, buildWorkflowOptionsFromDb } from './lib/siteSettings.js';
import { persistChatTurn } from './lib/dialogueStore.js';

type ChatBody = {
  message?: string;
  conversationHistory?: unknown;
  timezone?: string;
  stream?: boolean;
  /** Client-generated id; messages are appended when DATABASE_URL is set. */
  conversationId?: string;
};

const DEFAULT_TIMEZONE = 'Asia/Singapore';

function resolveTimeZone(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_TIMEZONE;
  const tz = raw.trim();
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function formatUserLocalDate(timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  };
  try {
    return new Date().toLocaleDateString('en-US', opts);
  } catch {
    return new Date().toLocaleDateString('en-US', {
      ...opts,
      timeZone: DEFAULT_TIMEZONE,
    });
  }
}

function applyCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
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

function sendSse(res: VercelResponse, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
  const timeZone = resolveTimeZone(body.timezone);
  const userLocalDateToday = formatUserLocalDate(timeZone);
  const conversationId =
    typeof body.conversationId === 'string' ? body.conversationId.trim() : undefined;

  const settingsRow = await loadSiteSettingsRow();
  const workflowOptions = buildWorkflowOptionsFromDb(settingsRow);

  if (!workflowOptions.runtime.openaiApiKey.trim()) {
    res.status(500).json({
      error: 'Server misconfiguration',
      reply: 'Chat is temporarily unavailable.',
      conversationHistory: [],
    });
    return;
  }

  const accept = typeof req.headers.accept === 'string' ? req.headers.accept : '';
  const wantStream =
    body.stream === true || accept.includes('text/event-stream');

  if (wantStream) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const { reply } = await runWorkflowStreaming(
        {
          input_as_text: message,
          conversationHistory,
          timezone: timeZone,
          userLocalDateToday,
        },
        (text) => {
          sendSse(res, { type: 'delta', text });
        },
        workflowOptions,
      );
      const nextHistory: ConversationTurn[] = [
        ...conversationHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: reply },
      ];
      await persistChatTurn(conversationId, message, reply);
      sendSse(res, {
        type: 'done',
        reply,
        conversationHistory: nextHistory,
      });
      res.end();
    } catch (err) {
      console.error('chat handler error (stream)', err);
      sendSse(res, {
        type: 'error',
        message: 'Something went wrong. Please try again in a moment.',
      });
      res.end();
    }
    return;
  }

  try {
    const result = await runWorkflow(
      {
        input_as_text: message,
        conversationHistory,
        timezone: timeZone,
        userLocalDateToday,
      },
      workflowOptions,
    );
    const reply = extractReply(result);
    const nextHistory: ConversationTurn[] = [
      ...conversationHistory,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ];
    await persistChatTurn(conversationId, message, reply);
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
