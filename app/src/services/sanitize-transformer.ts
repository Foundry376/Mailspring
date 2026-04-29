import DOMPurify from 'dompurify';

// <form>, <input>, and <button> are intentionally permitted: some marketing and
// transactional emails embed basic interactive forms (RSVPs, polls, feedback)
// and we want to keep rendering them. <meta> and <keygen> are not allowed —
// <meta http-equiv="refresh"> can navigate the message iframe to an attacker
// origin, and <keygen> is obsolete with no legitimate email use.
const AllowedTags = [
  '#text',
  'a',
  'abbr',
  'address',
  'area',
  'article',
  'aside',
  'b',
  'bdi',
  'bdo',
  'big',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'cite',
  'center',
  'code',
  'col',
  'colgroup',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'div',
  'dl',
  'dt',
  'em',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'font',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'img',
  'input',
  'ins',
  'kbd',
  'label',
  'legend',
  'li',
  'main',
  'map',
  'mark',
  'menu',
  'menuitem',
  'meter',
  'nav',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'param',
  'picture',
  'pre',
  'progress',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'select',
  'small',
  'source',
  'span',
  'strong',
  'style',
  'strike',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'u',
  'ul',
  'var',
  'wbr',
  'html',
];

const AllowedAttributes = [
  'abbr',
  'accept',
  'acceptcharset',
  'accesskey',
  'action',
  'align',
  'alt',
  'async',
  'autocomplete',
  'axis',
  'border',
  'background',
  'bgcolor',
  'cellpadding',
  'cellspacing',
  'char',
  'charoff',
  'charset',
  'checked',
  'classid',
  'class',
  'classname',
  'clear',
  'colspan',
  'cols',
  'color',
  'content',
  'contextmenu',
  'controls',
  'compact',
  'coords',
  'data',
  'datetime',
  'defer',
  'dir',
  'disabled',
  'download',
  'draggable',
  'enctype',
  'face',
  'form',
  'formenctype',
  'formmethod',
  'formnovalidate',
  'frame',
  'frameborder',
  'headers',
  'height',
  'hidden',
  'high',
  'href',
  'hreflang',
  'htmlfor',
  'hspace',
  'icon',
  'id',
  'label',
  'lang',
  'list',
  'loop',
  'low',
  'marginheight',
  'marginwidth',
  'max',
  'maxlength',
  'media',
  'mediagroup',
  'method',
  'min',
  'multiple',
  'muted',
  'name',
  'novalidate',
  'nowrap',
  'noshade',
  'open',
  'optimum',
  'pattern',
  'placeholder',
  'poster',
  'preload',
  'radiogroup',
  'readonly',
  'rel',
  'required',
  'role',
  'rowspan',
  'rows',
  'rules',
  'scope',
  'scoped',
  'scrolling',
  'seamless',
  'selected',
  'shape',
  'size',
  'sizes',
  'start',
  'sortable',
  'sorted',
  'span',
  'spellcheck',
  'src',
  'srcset',
  'start',
  'step',
  'style',
  'summary',
  'tabindex',
  'target',
  'title',
  'translate',
  'type',
  'usemap',
  'valign',
  'value',
  'vspace',
  'width',
  'wmode',
];

// Strip `@import` rules from <style> blocks. They reach the network even when
// the user has remote-content blocking enabled, so they're a silent
// open-tracking vector in HTML mail.
//
// We can't just regex `@import` — CSS hex-escapes like `@\69 mport` are valid
// spellings that the browser's CSS parser still resolves into real
// CSSImportRules and fetches. We also can't reserialize the parsed sheet via
// CSSStyleSheet/cssRules.cssText: that's lossy (drops comments, @charset,
// vendor hacks the strict parser doesn't recognize), which would mangle the
// many marketing emails that combine an @import line with cross-client
// fallbacks.
//
// Instead, walk the CSS surgically: tokenize enough to know when we're inside
// a string or comment (so an `@import` substring there is left alone), and at
// each top-level `@`, decode the at-keyword with CSS escape handling. If it
// resolves to "import", excise the at-rule (up to its `;`, its `{...}` block,
// or EOF — whichever ends it per CSS Syntax §5.4.1) and leave everything else
// byte-for-byte identical.

function decodeCssEscape(s: string, i: number): { value: string; end: number } {
  // Caller guarantees s[i] === '\\'.
  if (i + 1 >= s.length) return { value: '', end: i + 1 };
  const next = s[i + 1];
  if (/[0-9a-fA-F]/.test(next)) {
    let hex = '';
    let j = i + 1;
    while (j < s.length && hex.length < 6 && /[0-9a-fA-F]/.test(s[j])) {
      hex += s[j];
      j++;
    }
    if (j < s.length && /[\t\n\f\r ]/.test(s[j])) j++;
    let codePoint = parseInt(hex, 16);
    if (!Number.isFinite(codePoint) || codePoint === 0 || codePoint > 0x10ffff) {
      codePoint = 0xfffd;
    }
    return { value: String.fromCodePoint(codePoint), end: j };
  }
  return { value: next, end: i + 2 };
}

function readIdent(s: string, start: number): { name: string; end: number } {
  let name = '';
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const decoded = decodeCssEscape(s, i);
      name += decoded.value;
      i = decoded.end;
    } else if (/[a-zA-Z0-9_\-]/.test(c)) {
      name += c;
      i++;
    } else {
      break;
    }
  }
  return { name, end: i };
}

function skipString(s: string, i: number): number {
  const quote = s[i];
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      i += 2;
    } else if (c === quote) {
      return i + 1;
    } else if (c === '\n') {
      return i; // unterminated string
    } else {
      i++;
    }
  }
  return i;
}

function skipBlockComment(s: string, i: number): number {
  const close = s.indexOf('*/', i + 2);
  return close === -1 ? s.length : close + 2;
}

function findAtRuleEnd(s: string, start: number): number {
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === ';') return i + 1;
    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      i = skipBlockComment(s, i);
      continue;
    }
    if (c === '{') {
      let depth = 1;
      i++;
      while (i < s.length && depth > 0) {
        const cc = s[i];
        if (cc === '"' || cc === "'") {
          i = skipString(s, i);
        } else if (cc === '/' && s[i + 1] === '*') {
          i = skipBlockComment(s, i);
        } else if (cc === '{') {
          depth++;
          i++;
        } else if (cc === '}') {
          depth--;
          i++;
        } else {
          i++;
        }
      }
      return i;
    }
    i++;
  }
  return i;
}

function stripAtImportRules(cssText: string): string {
  let out = '';
  let i = 0;
  while (i < cssText.length) {
    const ch = cssText[i];

    if (ch === '/' && cssText[i + 1] === '*') {
      const end = skipBlockComment(cssText, i);
      out += cssText.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const end = skipString(cssText, i);
      out += cssText.slice(i, end);
      i = end;
      continue;
    }

    if (ch === '@') {
      const { name, end } = readIdent(cssText, i + 1);
      if (name.toLowerCase() === 'import') {
        // Per CSS Syntax §5.4.1, an at-rule ends at `;`, at `{...}`, or EOF.
        // Skip over strings and comments while scanning so a `;` inside a
        // string doesn't fool us, and walk balanced braces so a missing `;`
        // before a following ruleset doesn't make us gobble its content.
        i = findAtRuleEnd(cssText, end);
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'style') return;
  const styleEl = node as HTMLStyleElement;
  styleEl.textContent = stripAtImportRules(styleEl.textContent ?? '');
});

class SanitizeTransformer {
  async run(bodyHTML: string) {
    return DOMPurify.sanitize(bodyHTML, {
      ALLOWED_TAGS: AllowedTags,
      ALLOWED_ATTR: AllowedAttributes,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|xxx):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      KEEP_CONTENT: true,
    });
  }
}

export default new SanitizeTransformer();
