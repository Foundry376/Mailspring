import React from 'react';
import { ViewManifest } from './view-registry';

/**
 * How a View is represented in the app's own UI (the nav rail): a drawing from the manifest's
 * `iconSvg`, else the manifest's emoji `icon`, else a monogram of its name.
 *
 * View code is untrusted, and this UI is drawn in the main window, outside the View's sandbox,
 * in a renderer with Node integration. So `iconSvg` is never loaded by URL and never put in the
 * DOM as live SVG. It is parsed into an inert XML document (a DOMParser document runs no script
 * and fetches nothing), and a new SVG is written out from an allowlist of shape elements and
 * presentation attributes, each value checked against a strict grammar. Anything outside the
 * allowlist rejects the whole icon, so the View gets its emoji rather than a half-drawn icon.
 *
 * The rebuilt SVG is drawn as a CSS mask image from a data: URL, so the host tints it exactly
 * as it tints its own mask icons, including the active state. An SVG used as an image also runs
 * no script and loads no subresources, which backs up the allowlist. Only the icon's alpha
 * reaches the screen, so colors and gradients don't matter and gradients aren't accepted. The
 * allowlist also leaves out <use>, filters, text and animation: a 1 KB SVG of nested <use>
 * elements stalls the renderer for seconds even as an image, and animation would keep moving
 * in the rail.
 */

/** Largest `iconSvg` accepted, in characters. */
export const ICON_SVG_MAX_LENGTH = 16 * 1024;
/** Most elements in an `iconSvg`, counting the root. */
export const ICON_SVG_MAX_ELEMENTS = 128;
/** Deepest nesting in an `iconSvg`, counting the root as 1. */
export const ICON_SVG_MAX_DEPTH = 8;
/** Longest single attribute value (path data, points), in characters. */
export const ICON_SVG_MAX_ATTRIBUTE_LENGTH = 8 * 1024;
/** Largest absolute viewBox coordinate or size. */
export const ICON_SVG_MAX_VIEWBOX = 10000;
/**
 * Longest single number (a length, opacity or viewBox value), in characters. The number
 * grammar backtracks quadratically on a long run of digits: 16K of them takes ~370 ms.
 */
export const ICON_SVG_MAX_NUMBER_LENGTH = 32;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const NUMBER = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
const NUMBER_RE = new RegExp(`^${NUMBER}$`);
const LENGTH_RE = new RegExp(`^${NUMBER}(?:%|px)?$`);
const PATH_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9eE+\-.,\s]*$/;
const POINTS_RE = /^[0-9eE+\-.,\s]*$/;
const TRANSFORM_RE = new RegExp(
  `^(?:\\s*(?:matrix|translate|scale|rotate|skewX|skewY)\\s*\\(\\s*${NUMBER}(?:(?:\\s*,\\s*|\\s+)${NUMBER}){0,5}\\s*\\)\\s*,?)+$`
);
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNCTION_COLOR_RE = /^(?:rgba?|hsla?)\(\s*[0-9.%\s,/+-]{1,64}\)$/;
const NAMED_COLOR_RE = /^[a-zA-Z]{3,20}$/;

type AttributeCheck = (value: string) => boolean;

const isNumber: AttributeCheck = (v) => v.length <= ICON_SVG_MAX_NUMBER_LENGTH && NUMBER_RE.test(v);
const isLength: AttributeCheck = (v) => v.length <= ICON_SVG_MAX_NUMBER_LENGTH && LENGTH_RE.test(v);
const isTransform: AttributeCheck = (v) => v.length <= 512 && TRANSFORM_RE.test(v);
const isPathData: AttributeCheck = (v) =>
  v.length <= ICON_SVG_MAX_ATTRIBUTE_LENGTH && PATH_RE.test(v);
const isPoints: AttributeCheck = (v) =>
  v.length <= ICON_SVG_MAX_ATTRIBUTE_LENGTH && POINTS_RE.test(v);
const oneOf =
  (...values: string[]): AttributeCheck =>
  (v) =>
    values.includes(v);

/** A plain color: no url(), var() or anything else that could reach outside the icon. */
const isColor: AttributeCheck = (v) =>
  HEX_COLOR_RE.test(v) || FUNCTION_COLOR_RE.test(v) || NAMED_COLOR_RE.test(v);

const PRESENTATION: { [attr: string]: AttributeCheck } = {
  fill: isColor,
  stroke: isColor,
  'fill-opacity': isLength,
  'stroke-opacity': isLength,
  opacity: isLength,
  'stroke-width': isLength,
  'stroke-linecap': oneOf('butt', 'round', 'square'),
  'stroke-linejoin': oneOf('miter', 'round', 'bevel', 'miter-clip', 'arcs'),
  'stroke-miterlimit': isNumber,
  'fill-rule': oneOf('nonzero', 'evenodd'),
  'clip-rule': oneOf('nonzero', 'evenodd'),
  transform: isTransform,
};

const lengths = (...names: string[]) => {
  const attrs: { [attr: string]: AttributeCheck } = {};
  for (const name of names) attrs[name] = isLength;
  return attrs;
};

/** The elements an icon may contain, and the attributes each may carry. */
const ELEMENTS: { [name: string]: { [attr: string]: AttributeCheck } } = {
  svg: { ...PRESENTATION, viewBox: () => true }, // viewBox is checked on its own
  g: PRESENTATION,
  path: { ...PRESENTATION, d: isPathData },
  circle: { ...PRESENTATION, ...lengths('cx', 'cy', 'r') },
  ellipse: { ...PRESENTATION, ...lengths('cx', 'cy', 'rx', 'ry') },
  rect: { ...PRESENTATION, ...lengths('x', 'y', 'width', 'height', 'rx', 'ry') },
  line: { ...PRESENTATION, ...lengths('x1', 'y1', 'x2', 'y2') },
  polyline: { ...PRESENTATION, points: isPoints },
  polygon: { ...PRESENTATION, points: isPoints },
};
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);

// Copied from icon libraries and editors and harmless to leave out: dropped with their
// contents, not refused. <defs> holds nothing an icon can use without url() references.
const IGNORED_ELEMENTS = new Set(['title', 'desc', 'metadata', 'defs']);
const IGNORED_ATTRIBUTES = new Set(['version', 'class', 'role', 'focusable', 'color', 'id']);
// The host sizes the icon, so the root's own size is dropped.
const IGNORED_ROOT_ATTRIBUTES = new Set(['width', 'height']);

function isIgnoredAttribute(element: string, name: string) {
  if (name in ELEMENTS[element]) return false;
  if (element === 'svg' && IGNORED_ROOT_ATTRIBUTES.has(name)) return true;
  return IGNORED_ATTRIBUTES.has(name) || name.startsWith('data-') || name.startsWith('aria-');
}

export type IconSvgCheck = { ok: true; svg: string } | { ok: false; reason: string };

const escapeAttribute = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Why `viewBox` isn't four sane numbers (positive, bounded size), or null if it is. */
function viewBoxProblem(viewBox: string | null) {
  if (viewBox === null) return 'has no viewBox';
  const parts = viewBox.trim().split(/[\s,]+/);
  if (parts.length !== 4 || !parts.every(isNumber)) {
    return 'has a malformed viewBox';
  }
  const [x, y, w, h] = parts.map(Number);
  if (!(w > 0 && h > 0)) return 'has an empty viewBox';
  if ([x, y, w, h].some((n) => !isFinite(n) || Math.abs(n) > ICON_SVG_MAX_VIEWBOX)) {
    return `has a viewBox beyond ±${ICON_SVG_MAX_VIEWBOX}`;
  }
  if (w / h > 4 || h / w > 4)
    return 'has a viewBox over four times as wide as it is tall, or as tall as it is wide';
  return null;
}

class Refused extends Error {}

/**
 * Checks a manifest `iconSvg` value and, if it is acceptable, returns a copy rebuilt from only
 * the allowlisted elements and attributes.
 */
export function sanitizeIconSvg(value: unknown): IconSvgCheck {
  if (typeof value !== 'string') return { ok: false, reason: 'is not a string' };
  if (value.length > ICON_SVG_MAX_LENGTH) {
    return { ok: false, reason: `is longer than ${ICON_SVG_MAX_LENGTH} characters` };
  }
  // An optional XML declaration, then no DOCTYPE, entity declarations, CDATA or processing
  // instructions: entity expansion (billion laughs) and external entities never reach the parser.
  const source = value.trim().replace(/^<\?xml\s[^<>?]*\?>/, '');
  if (/<!(?!--)|<\?/.test(source)) {
    return { ok: false, reason: 'has a DOCTYPE, CDATA section or processing instruction' };
  }
  if (!/^\s*(?:<!--[\s\S]*?-->\s*)*<svg[\s>/]/.test(source)) {
    return { ok: false, reason: 'does not start with <svg>' };
  }

  // A DOMParser document has no browsing context: its scripts never run, its event handlers
  // never fire, and its images, stylesheets and fonts are never fetched.
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length) {
    return { ok: false, reason: 'is not well-formed XML' };
  }
  if (root.namespaceURI !== SVG_NS || root.localName !== 'svg') {
    return { ok: false, reason: 'is not an <svg> element in the SVG namespace' };
  }
  const viewBoxIssue = viewBoxProblem(root.getAttribute('viewBox'));
  if (viewBoxIssue) return { ok: false, reason: viewBoxIssue };

  let elements = 0;
  let shapes = 0;

  const write = (el: Element, depth: number, isRoot: boolean): string => {
    const name = el.localName;
    if (el.namespaceURI !== SVG_NS || !(name in ELEMENTS) || (name === 'svg' && !isRoot)) {
      throw new Refused(`uses <${el.nodeName}>, which icons can't`);
    }
    elements += 1;
    if (SHAPES.has(name)) shapes += 1;
    if (elements > ICON_SVG_MAX_ELEMENTS) {
      throw new Refused(`has more than ${ICON_SVG_MAX_ELEMENTS} elements`);
    }
    if (depth > ICON_SVG_MAX_DEPTH) {
      throw new Refused(`nests elements more than ${ICON_SVG_MAX_DEPTH} deep`);
    }

    const allowed = ELEMENTS[name];
    let attrs = isRoot ? ` xmlns="${SVG_NS}"` : '';
    for (const attr of Array.from(el.attributes)) {
      // Namespace declarations are dropped. Other namespaced attributes (xlink:href,
      // xml:base, editor extensions) are refused, as is anything not on the list.
      if (attr.name === 'xmlns' || attr.prefix === 'xmlns') continue;
      if (attr.namespaceURI === XML_NS && ['space', 'lang'].includes(attr.localName)) continue;
      if (!attr.namespaceURI && isIgnoredAttribute(name, attr.name)) continue;
      if (attr.namespaceURI || !Object.prototype.hasOwnProperty.call(allowed, attr.name)) {
        throw new Refused(`uses ${attr.name} on <${name}>, which icons can't`);
      }
      const v = attr.value.trim();
      if (!allowed[attr.name](v)) {
        throw new Refused(`has an unusable ${attr.name} on <${name}>`);
      }
      attrs += ` ${attr.name}="${escapeAttribute(v)}"`;
    }

    let children = '';
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node as Element;
        if (child.namespaceURI === SVG_NS && IGNORED_ELEMENTS.has(child.localName)) continue;
        children += write(child, depth + 1, false);
      } else if (node.nodeType === Node.TEXT_NODE) {
        // Whitespace between elements is dropped. Nothing an icon can use holds text.
        if (node.textContent.trim()) throw new Refused(`has text inside <${name}>`);
      } else if (node.nodeType !== Node.COMMENT_NODE) {
        throw new Refused(`has unexpected markup inside <${name}>`);
      }
    }
    return children ? `<${name}${attrs}>${children}</${name}>` : `<${name}${attrs}/>`;
  };

  let svg: string;
  try {
    svg = write(root, 1, true);
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.message };
    throw err;
  }
  if (!shapes) return { ok: false, reason: 'draws nothing' };
  return { ok: true, svg };
}

/** A data: URL of a sanitized icon (from `sanitizeIconSvg`). */
export function iconSvgDataUrl(sanitizedSvg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedSvg)}`;
}

// Rail items re-render on every badge and pin change, so checks are remembered by value.
const MAX_CACHED_ICONS = 64;
const iconCache = new Map<string, string | null>();

/** The View's `iconSvg`, sanitized, or null if it has none or it isn't acceptable. */
export function sanitizedIconSvg(view: Pick<ViewManifest, 'id' | 'json'>): string | null {
  const value = view.json && view.json.iconSvg;
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && iconCache.has(value)) return iconCache.get(value);
  const check = sanitizeIconSvg(value);
  let result: string | null = null;
  if (check.ok === true) {
    result = check.svg;
  } else {
    console.warn(`Views: ignoring ${view.id}'s iconSvg, which ${check.reason}.`);
  }
  if (typeof value === 'string') {
    if (iconCache.size >= MAX_CACHED_ICONS) iconCache.clear();
    iconCache.set(value, result);
  }
  return result;
}

// A manifest `icon` is a short emoji; anything else falls back to a monogram.
export function emojiIcon(icon: unknown): string | null {
  if (typeof icon !== 'string') return null;
  const trimmed = icon.trim();
  if (!trimmed || trimmed.length > 8) return null;
  if (!/\p{Extended_Pictographic}/u.test(trimmed) || /[\x21-\x7e]/.test(trimmed)) return null;
  return trimmed;
}

const MONOGRAM_HUES = [210, 265, 330, 15, 35, 150, 185, 235];

export function monogramFor(name: string) {
  const letter = (name.trim().match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = MONOGRAM_HUES[Math.abs(hash) % MONOGRAM_HUES.length];
  return { letter, background: `hsl(${hue}, 55%, 52%)` };
}

/**
 * The View's icon, for places in the app's UI that show one. A drawn icon is a `.view-icon`
 * mask: the container sets its size and its color with `background-color`, as for
 * `img.content-mask`.
 */
export function ViewIcon({ view }: { view: ViewManifest }) {
  const svg = sanitizedIconSvg(view);
  if (svg) {
    return (
      <span className="view-icon" style={{ WebkitMaskImage: `url("${iconSvgDataUrl(svg)}")` }} />
    );
  }
  const emoji = emojiIcon(view.json && view.json.icon);
  if (emoji) return <>{emoji}</>;
  const { letter, background } = monogramFor(view.name);
  return (
    <span className="nav-rail-monogram" style={{ background }}>
      {letter}
    </span>
  );
}
