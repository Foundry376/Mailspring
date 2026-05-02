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
  'signature',
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
// We use CSSStyleSheet.replaceSync, which silently drops `@import` from
// constructed stylesheets — and gets us the browser's own tokenizer for free,
// so CSS escapes like `@\69 mport`, CRLF preprocessing, etc. all just work
// without us reimplementing the spec.
//
// Reserializing via `cssRules.cssText` is lossy (drops comments, `@charset`,
// declarations the strict parser doesn't recognize like the IE6/7 `*display`
// hack, and normalizes whitespace). That's OK here: the only consumers are
// the same Chromium that just parsed the sheet (in the message iframe) and,
// on the draft path, juice — both of which would already have dropped the
// same things. If a future consumer needs byte-for-byte fidelity, this hook
// is the wrong place to do it.
function stripAtImportRules(cssText: string): string {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    return Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join('\n');
  } catch {
    // Parse failure — fall back to leaving the CSS untouched rather than
    // wiping the whole stylesheet. The DOMPurify allow-list still strips
    // <script>, <link>, etc., so this isn't a script-injection path.
    return cssText;
  }
}

DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName !== 'style') return;
  const styleEl = node as HTMLStyleElement;
  styleEl.textContent = stripAtImportRules(styleEl.textContent ?? '');
});

class SanitizeTransformer {
  runSync(bodyHTML: string) {
    return DOMPurify.sanitize(bodyHTML, {
      ALLOWED_TAGS: AllowedTags,
      ALLOWED_ATTR: AllowedAttributes,
      // Explicit allowlist of safe URI schemes for email content.
      // file: is intentionally absent — legitimate attachment file:// paths are
      // injected programmatically after sanitization, never from raw email HTML.
      ALLOWED_URI_REGEXP:
        /^(?:(?:https?|ftps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|(?!file:)[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
      KEEP_CONTENT: true,
    });
  }

  async run(bodyHTML: string) {
    return this.runSync(bodyHTML);
  }
}

export default new SanitizeTransformer();
