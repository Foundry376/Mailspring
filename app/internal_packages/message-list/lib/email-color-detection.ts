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

function hasOwnText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return true;
  }
  return false;
}

// Emails that paint their own backgrounds (marketing tables, colored wrappers)
// or hardcode text colors that would be illegible against the theme were
// designed for a white page and almost always assume the default text color is
// black, so we render them on white. Emails that do neither are rendered
// transparent with the theme's text color so they blend into the message list.
//
// Backgrounds on inline elements are ignored so a highlighted word or styled
// link in an otherwise plain email doesn't force the white background. Link
// colors are ignored because nearly every email colors its links and the
// stylesheet already restyles them for the theme. Fully transparent text is
// ignored because marketing emails use it for hidden preheaders.
export function isDesignedForWhiteBackground(wrapper: HTMLElement, behind: RGBA): boolean {
  const win = wrapper.ownerDocument.defaultView;
  if (!win) return false;

  for (const el of Array.from(wrapper.querySelectorAll<HTMLElement>('*'))) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none') continue;

    if (hasOwnText(el) && !el.closest('a')) {
      const color = parseComputedColor(style.color);
      if (!color) return true;
      if (color[3] > 0 && contrastRatio(color, behind) < MIN_LEGIBLE_CONTRAST) return true;
    }

    if (style.display.startsWith('inline')) continue;
    if (style.backgroundImage !== 'none') return true;
    const bg = parseComputedColor(style.backgroundColor);
    if (!bg || bg[3] > 0) return true;
  }
  return false;
}
