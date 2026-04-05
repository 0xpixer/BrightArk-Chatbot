/**
 * Admin JSON API — single dispatcher for Vercel Hobby (one function for all /api/admin/*).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Prisma } from '@prisma/client';
import { prisma, isDatabaseConfigured } from './prisma.js';
import {
  verifyPassword,
  createSession,
  setSessionCookie,
  hashPassword,
  destroySession,
  clearSessionCookie,
  getSessionUser,
} from './auth.js';
import { requireAdminUser } from './requireAdminUser.js';
import { getSiteSettingsDTO, loadSiteSettingsRow } from './siteSettings.js';
import { mergeWidgetTheme } from './widgetTheme.js';

export async function dispatchAdmin(
  req: VercelRequest,
  res: VercelResponse,
  route: string,
): Promise<void> {
  switch (route) {
    case 'status':
      return handleStatus(req, res);
    case 'login':
      return handleLogin(req, res);
    case 'register':
      return handleRegister(req, res);
    case 'logout':
      return handleLogout(req, res);
    case 'me':
      return handleMe(req, res);
    case 'settings':
      return handleSettings(req, res);
    case 'conversations':
      return handleConversations(req, res);
    case 'conversation-detail':
      return handleConversationDetail(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}

async function handleStatus(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!isDatabaseConfigured()) {
    res.status(200).json({ database: false, hasUsers: false });
    return;
  }
  try {
    const count = await prisma.user.count();
    res.status(200).json({ database: true, hasUsers: count > 0, connected: true });
  } catch (e) {
    console.error('[admin status] database check failed', e);
    res.status(200).json({
      database: true,
      hasUsers: false,
      connected: false,
      error:
        'DATABASE_URL is set but the server could not query the database. Typical fixes: run `npx prisma migrate deploy` against this database; use Neon’s pooled URL with `?sslmode=require`; then redeploy.',
    });
  }
}

type LoginBody = { email?: string; password?: string };

async function handleLogin(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body: LoginBody;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as LoginBody)
        : ((req.body ?? {}) as LoginBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.status(200).json({
    user: { id: user.id, email: user.email, username: user.username },
  });
}

type RegisterBody = { email?: string; password?: string; username?: string };

async function handleRegister(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body: RegisterBody;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as RegisterBody)
        : ((req.body ?? {}) as RegisterBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  const count = await prisma.user.count();
  if (count > 0) {
    res.status(403).json({ error: 'Registration is closed. Sign in instead.' });
    return;
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const username = typeof body.username === 'string' ? body.username.trim() : undefined;
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, username: username || null },
  });
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.status(201).json({
    user: { id: user.id, email: user.email, username: user.username },
  });
}

async function handleLogout(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (isDatabaseConfigured()) {
    await destroySession(req);
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}

type MePatchBody = { username?: string; password?: string; currentPassword?: string };

async function handleMe(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET') {
    if (!isDatabaseConfigured()) {
      res.status(200).json({ user: null });
      return;
    }
    try {
      const sessionUser = await getSessionUser(req);
      if (!sessionUser) {
        res.status(200).json({ user: null });
        return;
      }
      res.status(200).json({
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          username: sessionUser.username,
        },
      });
    } catch (e) {
      console.error('[admin me GET]', e);
      res.status(200).json({ user: null });
    }
    return;
  }
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  const user = await requireAdminUser(req, res);
  if (!user) return;
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  let body: MePatchBody;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as MePatchBody)
        : ((req.body ?? {}) as MePatchBody);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  const data: { username?: string | null; passwordHash?: string } = {};
  if (body.username !== undefined) {
    const u = typeof body.username === 'string' ? body.username.trim() : '';
    data.username = u || null;
  }
  if (body.password !== undefined && body.password !== '') {
    const newPass = body.password;
    if (newPass.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (!user.passwordHash) {
      data.passwordHash = await hashPassword(newPass);
    } else {
      const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const ok = await verifyPassword(current, user.passwordHash);
      if (!ok) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }
      data.passwordHash = await hashPassword(newPass);
    }
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'No changes' });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
  });
  res.status(200).json({
    user: { id: updated.id, email: updated.email, username: updated.username },
  });
}

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

async function handleSettings(req: VercelRequest, res: VercelResponse): Promise<void> {
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

async function handleConversations(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  const user = await requireAdminUser(req, res);
  if (!user) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const rows = await prisma.chatConversation.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, role: true },
      },
    },
  });
  res.status(200).json({
    conversations: rows.map((c) => ({
      id: c.id,
      updatedAt: c.updatedAt.toISOString(),
      lastMessage: c.messages[0]?.content?.slice(0, 200) ?? '',
      lastRole: c.messages[0]?.role ?? null,
    })),
  });
}

async function handleConversationDetail(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  if (!isDatabaseConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' });
    return;
  }
  const user = await requireAdminUser(req, res);
  if (!user) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  const conv = await prisma.chatConversation.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!conv) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(200).json({
    conversation: {
      id: conv.id,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  });
}
