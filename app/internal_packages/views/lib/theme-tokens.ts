import _ from 'underscore';

/**
 * The `Theme` pushed to Views (`useTheme`). `colors` keys become
 * `--ms-<key>` CSS variables and `ms-<key>` Tailwind colors inside the View, so renaming one
 * breaks every View that uses it.
 */
export interface ViewTheme {
  mode: 'light' | 'dark';
  colors: {
    bg: string;
    panel: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    danger: string;
    success: string;
    warning: string;
    link: string;
    heading: string;
  };
  chart: string[];
  font: { family: string; size: string };
}

// Each entry is a `data-token` on a probe child; views.less assigns the matching LESS
// variable to that child's `color`.
const COLOR_PROBES: { [key in keyof ViewTheme['colors']]: string } = {
  bg: 'background',
  panel: 'background-secondary',
  text: 'text',
  muted: 'text-subtle',
  border: 'border',
  accent: 'accent',
  danger: 'danger',
  success: 'success',
  warning: 'warning',
  link: 'link',
  heading: 'text-heading',
};

// Categorical series colors, chosen to stay distinguishable from each other and legible on
// the theme background. The dark set is lighter and less saturated for the dark surface.
const CHART_COLORS = {
  light: ['#2f6fdf', '#e8702a', '#2a9d6f', '#c43d8a', '#7a5af5', '#b8921a', '#1b9fb5', '#8c6239'],
  dark: ['#6f9bf0', '#f29a5c', '#5cc49a', '#e07ab3', '#a68cf8', '#e0c050', '#5ccbe0', '#c49a73'],
};

// The theme is defined in LESS variables, which don't exist at runtime. views.less assigns
// each one to a hidden probe element, so the resolved values (including the system accent
// and the active theme's overrides) can be read back from computed styles.
export function currentThemeTokens(): ViewTheme {
  const probe = document.createElement('div');
  probe.className = 'views-theme-probe';
  for (const token of [...Object.values(COLOR_PROBES), 'font']) {
    const el = document.createElement('div');
    el.dataset.token = token;
    probe.appendChild(el);
  }
  document.body.appendChild(probe);

  const resolved: { [token: string]: CSSStyleDeclaration } = {};
  for (const el of Array.from(probe.children) as HTMLElement[]) {
    resolved[el.dataset.token] = window.getComputedStyle(el);
  }
  const colors = {} as ViewTheme['colors'];
  for (const [key, token] of Object.entries(COLOR_PROBES)) {
    colors[key] = resolved[token].color;
  }
  const font = { family: resolved.font.fontFamily, size: resolved.font.fontSize };
  probe.remove();

  const mode = isDark(colors.bg) ? 'dark' : 'light';
  return { mode, colors, chart: CHART_COLORS[mode], font };
}

function isDark(rgb: string) {
  const [r, g, b] = (rgb.match(/[\d.]+/g) || ['255', '255', '255']).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/**
 * Calls `callback` whenever the resolved theme changes. Theme switches, automatic light/dark
 * switching, and the system accent color (ThemeManager.applySystemAccent) all land as
 * changes to the `<managed-styles>` stylesheets, so watching those catches every source
 * without each one needing its own event. Restyles that don't change any token are dropped.
 */
export function onThemeChange(callback: () => void): () => void {
  const container = document.querySelector('managed-styles') || document.head;
  let last = JSON.stringify(currentThemeTokens());

  const check = _.debounce(() => {
    const next = JSON.stringify(currentThemeTokens());
    if (next === last) return;
    last = next;
    callback();
  }, 100);

  const observer = new MutationObserver(check);
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    check.cancel();
  };
}
