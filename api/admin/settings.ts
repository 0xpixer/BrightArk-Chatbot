import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Prisma } from '@prisma/client';
import { prisma, isDatabaseConfigured } from '../lib/prisma.js';
import { requireAdminUser } from '../lib/requireAdminUser.js';
import { getSiteSettingsDTO, loadSiteSettingsRow } from '../lib/siteSettings.js';
import { mergeWidgetTheme } from '../lib/widgetTheme.js';

type PatchBody = {
  widgetTheme?: Record<string, unknown>;
  llmProviderLabel?: string;
  llmBaseUrl?: string | null;
  llmApiKey?: string;
  clearLlmApiKey?: boolean;
  llmClassificationModel?: string;
  llmSarahModel?: string;
  llmInformationModel?: string;
  promptClassification?: string;
  promptSarahIntro?: string;
  promptSarahTone?: string;
  promptInformationAgent?: string;
  welcomeMessage?: string;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }

  const user = await requireAdminUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    await loadSiteSettingsRow();
    const dto = await getSiteSettingsDTO();
    if (!dto) {
      res.status(503).json({ error: 'Could not load settings (database error?)' });
      return;
    }
    res.status(200).json({ settings: dto });
    return;
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: PatchBody;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as PatchBody)
        : ((req.body ?? {}) as PatchBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  await loadSiteSettingsRow();
  const current = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (!current) {
    res.status(500).json({ error: 'Settings missing' });
    return;
  }

  const data: Record<string, unknown> = {};

  if (body.widgetTheme !== undefined && typeof body.widgetTheme === 'object') {
    data.widgetTheme = {
      ...mergeWidgetTheme(current.widgetTheme),
      ...body.widgetTheme,
    };
  }
  if (typeof body.llmProviderLabel === 'string') {
    data.llmProviderLabel = body.llmProviderLabel.trim() || 'openai';
  }
  if (body.llmBaseUrl !== undefined) {
    const v = body.llmBaseUrl;
    data.llmBaseUrl =
      v === null || v === ''
        ? null
        : typeof v === 'string'
          ? v.trim() || null
          : null;
  }
  if (body.clearLlmApiKey === true) {
    data.llmApiKey = null;
  } else if (typeof body.llmApiKey === 'string' && body.llmApiKey.trim()) {
    data.llmApiKey = body.llmApiKey.trim();
  }
  if (typeof body.llmClassificationModel === 'string' && body.llmClassificationModel.trim()) {
    data.llmClassificationModel = body.llmClassificationModel.trim();
  }
  if (typeof body.llmSarahModel === 'string' && body.llmSarahModel.trim()) {
    data.llmSarahModel = body.llmSarahModel.trim();
  }
  if (typeof body.llmInformationModel === 'string' && body.llmInformationModel.trim()) {
    data.llmInformationModel = body.llmInformationModel.trim();
  }
  if (typeof body.promptClassification === 'string') {
    data.promptClassification = body.promptClassification;
  }
  if (typeof body.promptSarahIntro === 'string') {
    data.promptSarahIntro = body.promptSarahIntro;
  }
  if (typeof body.promptSarahTone === 'string') {
    data.promptSarahTone = body.promptSarahTone;
  }
  if (typeof body.promptInformationAgent === 'string') {
    data.promptInformationAgent = body.promptInformationAgent;
  }
  if (typeof body.welcomeMessage === 'string') {
    data.welcomeMessage = body.welcomeMessage;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No changes' });
    return;
  }

  await prisma.siteSettings.update({
    where: { id: 1 },
    data: data as Prisma.SiteSettingsUpdateInput,
  });

  const dto = await getSiteSettingsDTO();
  res.status(200).json({ settings: dto });
}
