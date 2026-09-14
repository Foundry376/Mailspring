type RGBA = [number, number, number, number];

// Parses the `rgb(r, g, b)` / `rgba(r, g, b, a)` forms Chrome uses for computed
// colors. Returns null for anything else (eg. `color(srgb ...)`).
function parseComputedColor(value: string): RGBA | null {
  const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(value);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

function relativeLuminance([r, g, b]: RGBA): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// WCAG 2 contrast ratio, with `fg` alpha-composited over `bg` first.
function contrastRatio(fg: RGBA, bg: RGBA): number {
  const a = fg[3];
  const blended: RGBA = [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
  const l1 = relativeLuminance(blended);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// The color a transparent iframe at `el` would show through to: the nearest
// ancestor with an opaque background, falling back to the document body.
export function backgroundColorBehind(el: HTMLElement): RGBA {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const color = parseComputedColor(window.getComputedStyle(node).backgroundColor);
    if (color && color[3] > 0) return color;
  }
  return (
    parseComputedColor(window.getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]
  );
}

// Deliberately far below WCAG's 3:1 minimum. Muted grays like GitHub's `#555`
// code blocks (~1.9:1 on a dark theme) are still readable enough that flipping
// the whole message to a white page would be worse; the target is text that is
// nearly invisible, like `rgb(54,55,55)` body copy (~1.2:1).
const MIN_LEGIBLE_CONTRAST = 1.5;

// Mail clients serialize "default text" as an explicit black: Apple Mail wraps
// pasted signatures in `color: rgb(0, 0, 0)`, Outlook emits `color: black` and
// `color: windowtext`. Treat anything this dark as the sender's default rather
// than a design choice.
function isNearBlack([r, g, b]: RGBA): boolean {
  return r <= 32 && g <= 32 && b <= 32;
}

function hasOwnText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
  }
  return false;
}

// Backgrounds on inline elements are ignored so a highlighted word or styled
// link in an otherwise plain email doesn't count as painting the page.
function paintsOwnBackground(elements: HTMLElement[], win: Window): boolean {
  for (const el of elements) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.display.startsWith('inline')) continue;
    if (style.backgroundImage !== 'none') return true;
    const bg = parseComputedColor(style.backgroundColor);
    if (!bg || bg[3] > 0) return true;
  }
  return false;
}

// Decides how an email's colors should be rendered against the theme, and
// returns true when it should be shown on a white page.
//
// Emails that paint their own backgrounds (marketing tables, colored wrappers)
// were designed for a white page and almost always assume the default text
// color is black, so they get the white page and their colors are left alone.
//
// Emails with no backgrounds render transparent so they blend into the message
// list. Their text sits directly on the theme background, so hardcoded
// near-black colors are replaced with the theme's text color (see
// `isNearBlack`), and any other hardcoded color that would be illegible against
// the theme falls back to the white page. Link colors are ignored because
// nearly every email colors its links and the stylesheet already restyles them
// for the theme. Fully transparent text is ignored because marketing emails use
// it for hidden preheaders.
export function prepareEmailColors(wrapper: HTMLElement, behind: RGBA): boolean {
  const win = wrapper.ownerDocument.defaultView;
  if (!win) return false;

  const elements = Array.from(wrapper.querySelectorAll<HTMLElement>('*'));
  if (paintsOwnBackground(elements, win)) return true;

  const defaultColor = win.getComputedStyle(wrapper).color;
  const nearBlackElements: HTMLElement[] = [];

  for (const el of elements) {
    if (!hasOwnText(el) || el.closest('a')) continue;
    const style = win.getComputedStyle(el);
    if (style.display === 'none') continue;

    const color = parseComputedColor(style.color);
    if (!color) return true;
    if (color[3] === 0) continue;
    if (isNearBlack(color)) {
      nearBlackElements.push(el);
      continue;
    }
    if (contrastRatio(color, behind) < MIN_LEGIBLE_CONTRAST) return true;
  }

  // Only rewrite once we know the email stays transparent: on a white page the
  // sender's black is correct.
  for (const el of nearBlackElements) {
    el.style.color = defaultColor;
  }
  return false;
}
