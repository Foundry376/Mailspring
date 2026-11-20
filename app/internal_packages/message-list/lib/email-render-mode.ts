export const EMAIL_RENDER_MODE_KEY = 'core.reading.emailRenderMode';

export type ResolvedEmailRenderMode = 'light' | 'dark';

// `auto` picks light or dark from the active theme, so emails follow the OS whenever the
// Automatic theme is selected. Only the explicit light/dark layer is used; themes never style
// the email body themselves (#2850). Unknown values, like the legacy `theme`, read as light.
export function resolvedEmailRenderMode(): ResolvedEmailRenderMode {
  const configured = AppEnv.config.get(EMAIL_RENDER_MODE_KEY);
  if (configured === 'dark') return 'dark';
  if (configured === 'auto') return AppEnv.themes.isActiveThemeDark() ? 'dark' : 'light';
  return 'light';
}
