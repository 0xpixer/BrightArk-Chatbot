/**
 * Widget appearance — stored as JSON on SiteSettings.widgetTheme.
 * Keys map to CSS custom properties applied on #brightark-chat-root.
 */
export type WidgetTheme = {
  primary?: string;
  /** Floating launcher button (#brightark-chat-bubble) background; defaults to primary if unset. */
  launcherBubbleBg?: string;
  /** 0–100: mix launcher color with transparent (100 = solid). Uses CSS color-mix. */
  launcherBubbleOpacityPct?: number;
  accent?: string;
  panelBg?: string;
  messagesBg?: string;
  botBubbleBg?: string;
  botBubbleBorder?: string;
  botText?: string;
  userBubbleBg?: string;
  userText?: string;
  headerBg?: string;
  headerText?: string;
  inputBorder?: string;
  fontFamily?: string;
  fontSizePx?: number;
  bubbleRadiusPx?: number;
  bubbleRadiusCornerPx?: number;
  panelRadiusPx?: number;
  panelShadow?: string;
  bubbleShadow?: string;
  borderWidthPx?: number;
};

export const DEFAULT_WIDGET_THEME: WidgetTheme = {
  primary: '#E06429',
  accent: '#000000',
  panelBg: '#ffffff',
  messagesBg: '#f6f7f9',
  botBubbleBg: '#ffffff',
  botBubbleBorder: '#e5e7eb',
  botText: '#222222',
  userBubbleBg: '#1a1a2e',
  userText: '#ffffff',
  headerBg: '#1a1a2e',
  headerText: '#ffffff',
  inputBorder: '#d1d5db',
  fontFamily: 'system-ui,-apple-system,sans-serif',
  fontSizePx: 14,
  bubbleRadiusPx: 12,
  bubbleRadiusCornerPx: 4,
  panelRadiusPx: 12,
  panelShadow: '0 8px 32px rgba(0,0,0,.18)',
  bubbleShadow: 'none',
  borderWidthPx: 1,
};

export function mergeWidgetTheme(raw: unknown): WidgetTheme {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WIDGET_THEME };
  return { ...DEFAULT_WIDGET_THEME, ...(raw as WidgetTheme) };
}

export function themeToCssVars(t: WidgetTheme): Record<string, string> {
  const m = mergeWidgetTheme(t);
  const primary = m.primary ?? DEFAULT_WIDGET_THEME.primary!;
  const launcher =
    (m.launcherBubbleBg && String(m.launcherBubbleBg).trim()) ||
    primary;
  const launcherOp = m.launcherBubbleOpacityPct;
  const launcherOpPct =
    typeof launcherOp === 'number' && Number.isFinite(launcherOp)
      ? Math.min(100, Math.max(0, Math.round(launcherOp)))
      : 100;
  return {
    '--ba-primary': primary,
    '--ba-launcher-bubble-bg': launcher,
    '--ba-launcher-opacity-pct': `${launcherOpPct}%`,
    '--ba-accent': m.accent ?? DEFAULT_WIDGET_THEME.accent!,
    '--ba-panel-bg': m.panelBg ?? DEFAULT_WIDGET_THEME.panelBg!,
    '--ba-messages-bg': m.messagesBg ?? DEFAULT_WIDGET_THEME.messagesBg!,
    '--ba-bot-bg': m.botBubbleBg ?? DEFAULT_WIDGET_THEME.botBubbleBg!,
    '--ba-bot-border': m.botBubbleBorder ?? DEFAULT_WIDGET_THEME.botBubbleBorder!,
    '--ba-bot-text': m.botText ?? DEFAULT_WIDGET_THEME.botText!,
    '--ba-user-bg': m.userBubbleBg ?? DEFAULT_WIDGET_THEME.userBubbleBg!,
    '--ba-user-text': m.userText ?? DEFAULT_WIDGET_THEME.userText!,
    '--ba-header-bg': m.headerBg ?? DEFAULT_WIDGET_THEME.headerBg!,
    '--ba-header-text': m.headerText ?? DEFAULT_WIDGET_THEME.headerText!,
    '--ba-input-border': m.inputBorder ?? DEFAULT_WIDGET_THEME.inputBorder!,
    '--ba-font': m.fontFamily ?? DEFAULT_WIDGET_THEME.fontFamily!,
    '--ba-font-size': `${m.fontSizePx ?? DEFAULT_WIDGET_THEME.fontSizePx}px`,
    '--ba-bubble-radius': `${m.bubbleRadiusPx ?? DEFAULT_WIDGET_THEME.bubbleRadiusPx}px`,
    '--ba-bubble-corner': `${m.bubbleRadiusCornerPx ?? DEFAULT_WIDGET_THEME.bubbleRadiusCornerPx}px`,
    '--ba-panel-radius': `${m.panelRadiusPx ?? DEFAULT_WIDGET_THEME.panelRadiusPx}px`,
    '--ba-panel-shadow': m.panelShadow ?? DEFAULT_WIDGET_THEME.panelShadow!,
    '--ba-bubble-shadow': m.bubbleShadow ?? DEFAULT_WIDGET_THEME.bubbleShadow!,
    '--ba-border-width': `${m.borderWidthPx ?? DEFAULT_WIDGET_THEME.borderWidthPx}px`,
  };
}
