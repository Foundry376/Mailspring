import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { ViewManifest } from '../lib/view-registry';
import {
  ICON_SVG_MAX_DEPTH,
  ICON_SVG_MAX_ELEMENTS,
  ICON_SVG_MAX_LENGTH,
  ICON_SVG_MAX_NUMBER_LENGTH,
  ViewIcon,
  iconSvgDataUrl,
  sanitizeIconSvg,
  sanitizedIconSvg,
} from '../lib/view-icon';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const LUCIDE_ROOT = `${NS} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
const icon = (inner: string, root = LUCIDE_ROOT) => `<svg ${root}>${inner}</svg>`;
const SHAPE = '<path d="M8 7v7"/>';

const STARTERS_DIR = path.join(__dirname, '..', 'starters');
const starterManifest = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(STARTERS_DIR, name, 'manifest.json'), 'utf8'));
const starterIconSvg = () => starterManifest('kanban').iconSvg as string;

const accepted = (value: unknown) => {
  const check = sanitizeIconSvg(value);
  if (check.ok === false) throw new Error(`refused: ${check.reason}`);
  return check.svg;
};
const refused = (value: unknown) => sanitizeIconSvg(value).ok === false;
// Pairs the value with the result, so a failure names the input that got through.
const expectRefused = (value: unknown) => expect([value, refused(value)]).toEqual([value, true]);

// Each element and attribute of a parsed SVG, so two documents can be compared by structure.
function outline(svg: string) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const walk = (el: Element): any => ({
    name: el.localName,
    attrs: Array.from(el.attributes)
      .filter((a) => a.name !== 'xmlns')
      .map((a) => `${a.name}=${a.value}`)
      .sort(),
    children: Array.from(el.children).map(walk),
  });
  return walk(doc.documentElement);
}

// Draws an image URL on a canvas and returns its pixels.
async function pixels(src: string, size = 48) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  return Array.from(ctx.getImageData(0, 0, size, size).data);
}

const decode = (dataUrl: string) =>
  decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));

describe('View icons (manifest iconSvg)', function () {
  describe('allowlisted icons', function () {
    it("keeps the Board starter's lucide icon intact, element for element", function () {
      const original = starterIconSvg();
      const svg = accepted(original);
      expect(outline(svg)).toEqual(outline(original));
      expect(svg).toContain('stroke="currentColor"');
    });

    // The starters are also the authoring agent's examples, so their icons set the style.
    it('gives every page starter a thin-stroked iconSvg that is accepted intact', function () {
      const pages = fs
        .readdirSync(STARTERS_DIR)
        .filter((name) => starterManifest(name).placement === 'page');
      expect(pages.length).toBeGreaterThan(5);
      for (const name of pages) {
        const original = starterManifest(name).iconSvg;
        expect([name, refused(original)]).toEqual([name, false]);
        expect(outline(accepted(original))).toEqual(outline(original));
        expect([name, original.match(/stroke-width="([^"]+)"/g)]).toEqual([
          name,
          ['stroke-width="1.5"'],
        ]);
      }
    });

    it('draws the sanitized icon exactly as the original draws', async function () {
      const original = starterIconSvg();
      const before = await pixels(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(original)}`
      );
      const after = await pixels(iconSvgDataUrl(accepted(original)));
      expect(after).toEqual(before);
      expect(after.some((v) => v > 0)).toBe(true);
    });

    it('accepts an icon as icon libraries export it, dropping the harmless extras', function () {
      const svg = accepted(
        `<?xml version="1.0" encoding="UTF-8"?>
        <!-- lucide -->
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
          width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" class="lucide lucide-kanban" aria-hidden="true" data-x="1" xml:space="preserve">
          <title>Board</title><desc>A board</desc>
          <g transform="translate(1 1) rotate(45, 12, 12)" opacity=".5">
            <circle cx="12" cy="12" r="10" id="c"/><line x1="0" y1="0" x2="1e1" y2="10"/>
            <polyline points="1,2 3,4"/><polygon points="1 2 3 4 5 6" fill-rule="evenodd"/>
            <ellipse cx="1" cy="2" rx="3" ry="4"/><rect x="1" y="1" width="50%" height="4px"/>
          </g>
        </svg>`
      );
      for (const dropped of [
        'class',
        'aria-hidden',
        'data-x',
        'xlink',
        'title',
        'desc',
        'width="24"',
        'lucide',
        'id=',
        '<!--',
        'xml:space',
      ]) {
        expect(svg).not.toContain(dropped);
      }
      expect(svg).toContain('<circle cx="12" cy="12" r="10"/>');
      expect(svg).toContain('transform="translate(1 1) rotate(45, 12, 12)"');
    });

    it('drops <defs> and refuses gradients, which a mask has no use for', function () {
      const svg = accepted(
        icon(`<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>${SHAPE}`)
      );
      expect(svg).not.toContain('defs');
      expect(svg).not.toContain('Gradient');
      for (const bad of [
        icon(`<linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient>${SHAPE}`),
        icon('<radialGradient id="r"/><path d="M0 0h1"/>'),
        icon('<stop offset="0"/><path d="M0 0h1"/>'),
        icon('<defs><linearGradient id="g"/></defs><rect width="2" height="2" fill="url(#g)"/>'),
        icon('<rect id="a" width="2" height="2"/><rect width="2" height="2" fill="url(#a)"/>'),
      ]) {
        expectRefused(bad);
      }
    });
  });

  describe('refused content', function () {
    it('refuses script, event handlers and javascript: anywhere', function () {
      for (const bad of [
        icon(`<script>alert(1)</script>${SHAPE}`),
        icon(`<script href="file:///tmp/x.js"/>${SHAPE}`),
        icon(SHAPE, `${LUCIDE_ROOT} onload="alert(1)"`),
        icon('<path d="M8 7v7" onclick="alert(1)"/>'),
        icon('<path d="M8 7v7" ONLOAD="alert(1)"/>'),
        icon('<a href="javascript:alert(1)"><path d="M0 0h1"/></a>'),
        icon('<path d="javascript:alert(1)"/>'),
        icon('<path d="M0 0h1" fill="javascript:alert(1)"/>'),
        icon('<path d="M0 0h1" transform="javascript:alert(1)"/>'),
        icon('<path d="M0 0h1" fill="&#106;avascript:alert(1)"/>'),
      ]) {
        expectRefused(bad);
      }
    });

    it('refuses everything that loads or embeds other content', function () {
      for (const bad of [
        icon(
          '<foreignObject width="24" height="24"><div xmlns="http://www.w3.org/1999/xhtml">Sign in</div></foreignObject>'
        ),
        icon('<image href="https://example.com/a.png" width="24" height="24"/>'),
        icon('<image href="data:image/png;base64,iVBORw0KGgo=" width="24" height="24"/>'),
        icon('<use href="https://example.com/sprite.svg#a"/>'),
        icon('<use href="#a"/><path id="a" d="M0 0h1"/>'),
        icon('<path d="M0 0h1" href="#x"/>'),
        icon(
          '<path xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="https://example.com" d="M0 0h1"/>'
        ),
        icon('<path d="M0 0h1" fill="url(https://example.com/p.svg#g)"/>'),
        icon('<path d="M0 0h1" fill="url(&quot;https://example.com/p.svg#g&quot;)"/>'),
        icon('<path d="M0 0h1" stroke="url(//example.com/p.svg#g)"/>'),
        icon(
          '<path d="M0 0h1" filter="url(#f)"/><filter id="f"><feGaussianBlur stdDeviation="9"/></filter>'
        ),
        icon('<path d="M0 0h1" mask="url(#m)"/>'),
        icon('<path d="M0 0h1" clip-path="url(#c)"/>'),
        icon('<path d="M0 0h1" cursor="url(https://example.com/c.png), auto"/>'),
        icon(`<style>@import url(https://example.com/a.css);</style>${SHAPE}`),
        icon(
          `<style>@font-face { font-family: X; src: url(https://example.com/x.woff) }</style>${SHAPE}`
        ),
        icon('<path d="M0 0h1" style="fill: url(https://example.com/p.svg#g)"/>'),
        icon('<path d="M0 0h1" style="fill: red"/>'),
        icon('<text x="0" y="12" font-family="X">Sign in</text>'),
        icon(`<switch>${SHAPE}</switch>`),
        icon(`<pattern id="p" width="1" height="1">${SHAPE}</pattern>`),
        icon(`<marker id="m">${SHAPE}</marker>`),
        icon(`<svg viewBox="0 0 1 1">${SHAPE}</svg>`),
        icon(`<iframe xmlns="http://www.w3.org/1999/xhtml" src="https://example.com"/>${SHAPE}`),
        icon(`<x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script>${SHAPE}`),
      ]) {
        expectRefused(bad);
      }
    });

    it('refuses animation', function () {
      for (const bad of [
        icon(
          '<path d="M0 0h1"><animate attributeName="opacity" values="0;1" dur="0.1s" repeatCount="indefinite"/></path>'
        ),
        icon('<path d="M0 0h1"><set attributeName="fill" to="red"/></path>'),
        icon(
          '<path d="M0 0h1"><animateTransform attributeName="transform" type="rotate" dur="1s"/></path>'
        ),
        icon('<path d="M0 0h1"><animateMotion dur="1s" path="M0 0h9"/></path>'),
        icon(
          `<style>@keyframes k { to { opacity: 0 } } path { animation: k .1s infinite }</style>${SHAPE}`
        ),
      ]) {
        expectRefused(bad);
      }
    });

    it('refuses DOCTYPEs, entities, CDATA and processing instructions before parsing', function () {
      let entities = '<!ENTITY a0 "lol">';
      for (let k = 1; k <= 9; k++) entities += `<!ENTITY a${k} "${`&a${k - 1};`.repeat(10)}">`;
      for (const bad of [
        `<?xml version="1.0"?><!DOCTYPE svg [${entities}]><svg ${NS} viewBox="0 0 24 24"><path d="&a9;"/></svg>`,
        `<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg ${NS} viewBox="0 0 24 24"><path d="M0 0h1"/></svg>`,
        `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg ${NS} viewBox="0 0 24 24"><path d="M0 0h1"/></svg>`,
        `<?xml-stylesheet href="https://example.com/a.css"?><svg ${NS} viewBox="0 0 24 24"><path d="M0 0h1"/></svg>`,
        icon('<path d="M0 0h1"><![CDATA[x]]></path>'),
        icon('<path d="&nbsp;M0 0h1"/>'),
      ]) {
        expectRefused(bad);
      }
    });

    it('refuses anything that is not a well-formed SVG document', function () {
      for (const bad of [
        42,
        null,
        { svg: '<svg/>' },
        '',
        'icon.svg',
        'https://example.com/icon.svg',
        'data:image/svg+xml,<svg/>',
        `<svg viewBox="0 0 24 24">${SHAPE}</svg>`, // no SVG namespace
        `<html><svg ${NS} viewBox="0 0 24 24">${SHAPE}</svg></html>`,
        `<svg ${NS} viewBox="0 0 24 24"><path d="M0 0h1">`,
        `${icon(SHAPE)}<svg ${NS}/>`,
        icon(`hello${SHAPE}`),
        icon('<defs/>'), // draws nothing
        icon('<path d="M0 0h1" fill="var(--x)"/>'),
        icon('<path d="M0 0h1" stroke-linecap="round;x"/>'),
        icon('<path d="M0 0h1" opacity="calc(1)"/>'),
      ]) {
        expectRefused(bad);
      }
    });
  });

  describe('limits', function () {
    it('refuses oversize input', function () {
      const longPath = `<path d="M0 0${' h1'.repeat(ICON_SVG_MAX_LENGTH / 3)}"/>`;
      expect(refused(icon(longPath))).toBe(true);
      expect(sanitizeIconSvg(icon(longPath))).toEqual({
        ok: false,
        reason: `is longer than ${ICON_SVG_MAX_LENGTH} characters`,
      });
      // A single attribute over its own limit, within the overall one
      expect(refused(icon(`<path d="M0 0${'h1'.repeat(4200)}"/>`))).toBe(true);
    });

    it('refuses over-long numbers without stalling on them', function () {
      const digits = '1'.repeat(ICON_SVG_MAX_LENGTH - 200);
      const started = Date.now();
      expectRefused(icon(SHAPE.replace('<path', `<path stroke-width="${digits}x"`)));
      expectRefused(icon(SHAPE, `${NS} viewBox="0 0 24 ${digits}"`));
      expect(Date.now() - started).toBeLessThan(50);
      const longest = `1.${'0'.repeat(ICON_SVG_MAX_NUMBER_LENGTH - 2)}`;
      expect(
        accepted(icon(SHAPE.replace('<path', `<path stroke-width="${longest}"`)))
      ).toBeTruthy();
      expectRefused(icon(SHAPE.replace('<path', `<path stroke-width="${longest}0"`)));
    });

    it('refuses too many elements and too deep nesting', function () {
      expect(accepted(icon(SHAPE.repeat(ICON_SVG_MAX_ELEMENTS - 1)))).toBeTruthy();
      expect(refused(icon(SHAPE.repeat(ICON_SVG_MAX_ELEMENTS)))).toBe(true);
      const nest = (n: number) => '<g>'.repeat(n) + SHAPE + '</g>'.repeat(n);
      expect(accepted(icon(nest(ICON_SVG_MAX_DEPTH - 2)))).toBeTruthy();
      expect(refused(icon(nest(ICON_SVG_MAX_DEPTH - 1)))).toBe(true);
    });

    it('requires a sane viewBox', function () {
      const root = (viewBox: string) => `${NS}${viewBox} stroke="currentColor"`;
      expect(accepted(icon(SHAPE, root(' viewBox="0,0,48,48"')))).toBeTruthy();
      for (const viewBox of [
        '',
        ' viewBox=""',
        ' viewBox="0 0 24"',
        ' viewBox="0 0 24 24 24"',
        ' viewBox="0 0 0 24"',
        ' viewBox="0 0 -24 24"',
        ' viewBox="0 0 1e9 1e9"',
        ' viewBox="0 0 24 1e-3"',
        ' viewBox="0 0 100 10"',
        ' viewBox="0 0 Infinity 24"',
        ' viewBox="0 0 24px 24"',
      ]) {
        expectRefused(icon(SHAPE, root(viewBox)));
      }
    });
  });

  describe('drawing', function () {
    it('encodes the sanitized icon as an opaque data: URL, for use as a mask', async function () {
      const svg = accepted(icon('<rect width="24" height="24" fill="currentColor"/>'));
      const url = iconSvgDataUrl(svg);
      expect(decode(url)).toEqual(svg);
      expect(url).not.toContain('"'); // it sits in url("…") in an inline style
      const data = await pixels(url, 4);
      expect(data[3]).toEqual(255);
    });
  });

  describe('ViewIcon', function () {
    const view = (json: any): ViewManifest =>
      ({
        id: 'board',
        name: 'Board',
        dir: '/tmp/board',
        placement: 'page',
        permissions: [],
        json,
      }) as any;
    const markup = (json: any) =>
      ReactDOMServer.renderToStaticMarkup(React.createElement(ViewIcon, { view: view(json) }));

    it('draws the iconSvg, else the emoji, else a monogram', function () {
      spyOn(console, 'warn');
      const drawn = markup({ icon: '📋', iconSvg: starterIconSvg() });
      expect(drawn).toContain(
        '<span class="view-icon" style="-webkit-mask-image:url(&quot;data:image/svg+xml;charset=utf-8,'
      );
      expect(markup({ icon: '📋', iconSvg: icon(`<script>alert(1)</script>${SHAPE}`) })).toEqual(
        '📋'
      );
      expect(console.warn).toHaveBeenCalled();
      expect(markup({ icon: '📋' })).toEqual('📋');
      expect(markup({ iconSvg: '<svg/>' })).toContain('nav-rail-monogram');
    });

    it('remembers each check by value', function () {
      const value = icon(SHAPE);
      const first = sanitizedIconSvg({ id: 'a', json: { iconSvg: value } });
      expect(first).toBeTruthy();
      expect(sanitizedIconSvg({ id: 'b', json: { iconSvg: value } })).toBe(first);
      expect(sanitizedIconSvg({ id: 'a', json: {} })).toBe(null);
    });
  });
});
