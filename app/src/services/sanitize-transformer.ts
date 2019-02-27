/*
The sanitizer implementation here is loosely based on
https://www.quaxio.com/html_white_listed_sanitizer/
*/

const asMap = arr => {
  const obj = {};
  arr.forEach(k => (obj[k] = true));
  return obj;
};

const sanitizeURL = function(val, rules) {
  if (!val) {
    return null;
  }
  if (rules.except && rules.except.find(scheme => val.startsWith(scheme))) {
    return null;
  }

  return val;
};

// https://stackoverflow.com/questions/2725156/complete-list-of-html-tag-attributes-which-have-a-url-value
const AttributesContainingLinks = [
  'src',
  'codebase',
  'cite',
  'background',
  'longdesc',
  'profile',
  'usemap',
  'data',
  'href',
  'action',
  'formaction',
  'icon',
  'manifest',
  'poster',
  'srcdoc',
  'srcset',
  'archive',
  'classid',
];

const NodesWithNonTextContent = asMap(['script', 'style', 'iframe', 'object', 'meta']);

const Preset = {
  PasteFragment: {
    fragment: true,
    allowedTags: asMap([
      'p',
      'b',
      'i',
      'em',
      'u',
      's',
      'strong',
      'center',
      'a',
      'br',
      'img',
      'ul',
      'ol',
      'li',
      'strike',
      'table',
      'tr',
      'td',
      'th',
      'col',
      'colgroup',
      'div',
      'html',
      'font',
    ]),
    allowedSchemes: {
      default: { except: ['file:'] },
    },
    allowedAttributes: {
      default: asMap([
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
        'class',
        'classid',
        'classname',
        'color',
        'colspan',
        'cols',
        'content',
        'contextmenu',
        'controls',
        'coords',
        'data-overlay-id',
        'data-component-props',
        'data-component-key',
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
        'formaction',
        'formenctype',
        'formmethod',
        'formnovalidate',
        'formtarget',
        'frame',
        'frameborder',
        'headers',
        'height',
        'hidden',
        'high',
        'href',
        'hreflang',
        'htmlfor',
        'httpequiv',
        'icon',
        'id',
        'label',
        'lang',
        'list',
        'loop',
        'low',
        'manifest',
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
        'sandbox',
        'scope',
        'scoped',
        'scrolling',
        'seamless',
        'selected',
        'shape',
        'size',
        'sizes',
        'sortable',
        'sorted',
        'span',
        'spellcheck',
        'src',
        'srcdoc',
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
        'width',
        'wmode',
      ]),
    },
  },

  UnsafeOnly: {
    allowedTags: asMap([
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
      'keygen',
      'label',
      'legend',
      'li',
      'main',
      'map',
      'mark',
      'menu',
      'menuitem',
      'meta',
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
    ]),
    allowedAttributes: {
      default: asMap([
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
        'formaction',
        'formenctype',
        'formmethod',
        'formnovalidate',
        'formtarget',
        'frame',
        'frameborder',
        'headers',
        'height',
        'hidden',
        'high',
        'href',
        'hreflang',
        'htmlfor',
        'httpequiv',
        'hspace',
        'icon',
        'id',
        'label',
        'lang',
        'list',
        'loop',
        'low',
        'manifest',
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
        'sandbox',
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
        'srcdoc',
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
      ]),
    },
    allowedSchemes: {
      default: { except: ['file:'] },
    },
  },
};

class SanitizeTransformer {
  Preset = Preset;

  sanitizeNode(node: Element, settings) {
    let nodeName = node.nodeName.toLowerCase();
    if (nodeName === '#text') {
      return true; // text nodes are always safe, don't need to clone them
    }

    if (nodeName === '#comment') {
      return false; // always strip comments
    }

    if (!settings.allowedTags.hasOwnProperty(nodeName)) {
      // this node isn't allowed - what should we do with it?

      // Nodes with non-text contents: completely remove them
      if (NodesWithNonTextContent.hasOwnProperty(nodeName)) {
        return false;
      }

      // Nodes with text contents / no contents: replace with a `span` with the same children.
      // This allows us to ignore things like tables / table cells and still get their contents.
      let replacementNode = document.createElement('span');
      for (const child of Array.from(node.childNodes)) {
        replacementNode.appendChild(child);
      }
      node.parentNode.replaceChild(replacementNode, node);
      node = replacementNode;
    }

    // identify the allowed attributes based on our settings
    let allowedForNodeName = settings.allowedAttributes.default;
    if (settings.allowedAttributes.hasOwnProperty(nodeName)) {
      allowedForNodeName = settings.allowedAttributes[nodeName];
    }

    // remove and sanitize attributes using the whitelist / URL scheme rules
    for (let i = node.attributes.length - 1; i >= 0; i--) {
      const attr = node.attributes.item(i).name;
      if (!allowedForNodeName.hasOwnProperty(attr)) {
        node.removeAttribute(attr);
        continue;
      }
      if (AttributesContainingLinks.includes(attr)) {
        let rules = settings.allowedSchemes.default;
        if (settings.allowedSchemes.hasOwnProperty(nodeName)) {
          rules = settings.allowedSchemes[nodeName];
        }
        const sanitizedValue = sanitizeURL(node.getAttribute(attr), rules);
        if (sanitizedValue !== null) {
          node.setAttribute(attr, sanitizedValue);
        } else {
          node.removeAttribute(attr);
        }
      }
    }

    // recursively sanitize child nodes
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      if (!this.sanitizeNode(node.childNodes[i] as Element, settings)) {
        node.childNodes[i].remove();
      }
    }

    return true;
  }

  async run(body, settings) {
    if (settings.fragment) {
      var doc = document.implementation.createHTMLDocument();
      var div = doc.createElement('div');
      div.innerHTML = body;
      this.sanitizeNode(div, settings);
      return div.innerHTML;
    } else {
      const parser = new DOMParser();
      const doc = parser.parseFromString(body, 'text/html');
      this.sanitizeNode(doc.documentElement, settings);
      return doc.documentElement.innerHTML;
    }
  }
}

export default new SanitizeTransformer();
