import Html from 'slate-html-serializer';
import {
  TextJSON,
  InlineJSON,
  Value,
  Node as SlateNode,
  BlockJSON,
  DocumentJSON,
  Mark,
  NodeJSON,
  MarkJSON,
  Block,
} from 'slate';
import React from 'react';

import BaseMarkPlugins from './base-mark-plugins';
import TemplatePlugins, { VARIABLE_TYPE } from './template-plugins';
import SpellcheckPlugins from './spellcheck-plugins';
import UneditablePlugins, { UNEDITABLE_TYPE } from './uneditable-plugins';
import BaseBlockPlugins, { BLOCK_CONFIG, isQuoteNode } from './base-block-plugins';
import InlineAttachmentPlugins, { IMAGE_TYPE } from './inline-attachment-plugins';
import MarkdownPlugins from './markdown-plugins';
import LinkPlugins from './link-plugins';
import EmojiPlugins, { EMOJI_TYPE } from './emoji-plugins';
import { Rule, ComposerEditorPlugin } from './types';

import './patch-chrome-ime';
import { deepenPlaintextQuote } from './plaintext';

export const schema = {
  blocks: {
    [UNEDITABLE_TYPE]: {
      isVoid: true,
    },
  },
  inlines: {
    [VARIABLE_TYPE]: {
      isVoid: true,
    },
    [EMOJI_TYPE]: {
      isVoid: true,
    },
    [UNEDITABLE_TYPE]: {
      isVoid: true,
    },
    [IMAGE_TYPE]: {
      isVoid: true,
    },
  },
};

// Note: order is important here because we deserialize HTML with rules
// in this order. <code class="var"> before <code>, etc.
export const plugins: ComposerEditorPlugin[] = [
  ...InlineAttachmentPlugins,
  ...UneditablePlugins,
  ...BaseMarkPlugins,
  ...TemplatePlugins,
  ...EmojiPlugins,
  ...LinkPlugins,
  ...BaseBlockPlugins,
  ...MarkdownPlugins,
  ...SpellcheckPlugins,
];

const cssValueIsZero = (val: string | number) => {
  return val === '0' || val === '0px' || val === '0em' || val === 0;
};

const nodeIsEmpty = (node: Node) => {
  if (!node.childNodes || node.childNodes.length === 0) {
    return true;
  }
  if (
    node.childNodes.length === 1 &&
    node.childNodes[0].nodeType === Node.TEXT_NODE &&
    node.textContent.trim() === ''
  ) {
    return true;
  }
  return false;
};

function parseHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const tree = parsed.body;

  // whitespace /between/ HTML nodes really confuses the parser because
  // it doesn't know these `text` elements are meaningless. Strip them all.
  const collapse = require('collapse-whitespace');
  collapse(tree);

  // get rid of <meta> and <style> tags since styles have been inlined
  Array.from(tree.querySelectorAll('meta')).forEach(m => m.remove());
  Array.from(tree.querySelectorAll('style')).forEach(m => m.remove());
  Array.from(tree.querySelectorAll('title')).forEach(m => m.remove());

  // remove any display:none nodes. This is commonly used in HTML email to
  // send a plaintext "summary" sentence
  Array.from(tree.querySelectorAll('[style]')).forEach(m => {
    if ((m as HTMLElement).style.display === 'none') {
      m.remove();
    }
  });

  // remove any images with an explicit 1px by 1px size - they're often the
  // last node and tail void nodes break Slate's select-all. Also we
  // don't want to forward / reply with other people's tracking pixels
  Array.from(tree.querySelectorAll('img')).forEach(m => {
    const w = m.getAttribute('width') || m.style.width || '';
    const h = m.getAttribute('height') || m.style.height || '';
    if (w.replace('px', '') === '1' && h.replace('px', '') === '1') {
      m.remove();
    }
  });

  // We coerce <p> tags to <div> tags and don't apply any padding. Any incoming <p>
  // tags should be followed by <br> tags to maintain the intended spacing.
  const pWalker = document.createTreeWalker(tree, NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => {
      return node.nodeName === 'P' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  while (pWalker.nextNode()) {
    const p = pWalker.currentNode as HTMLElement;

    // if the <p> is followed by an empty <p> and then another <p>, remove the empty
    // because <p>'s margins almost always collapse during display.
    if (
      p.nextSibling &&
      p.nextSibling.nodeName === 'P' &&
      nodeIsEmpty(p.nextSibling) &&
      p.nextSibling.nextSibling &&
      p.nextSibling.nextSibling.nodeName === 'P' &&
      nodeIsEmpty(p.nextSibling.nextSibling)
    ) {
      (p.nextSibling as HTMLElement).remove();
    }

    const prHasExplicitZeroMargin =
      cssValueIsZero(p.style.marginTop) ||
      cssValueIsZero(p.style.marginBottom) ||
      cssValueIsZero(p.style.margin);

    // if the <p> is followed by a non-empty node and, insert a <br>
    if (!prHasExplicitZeroMargin && p.nextSibling && !nodeIsEmpty(p.nextSibling)) {
      const br = document.createElement('BR');
      p.parentNode.insertBefore(br, p.nextSibling);
    }
  }

  return tree;
}

// This is copied from slate-html-serializer/index.js and improved to preserve
// sequential space characters that would be compacted during the HTML display.
const TEXT_RULE_IMPROVED: Rule = {
  deserialize: el => {
    if (el.tagName && el.tagName.toLowerCase() === 'br') {
      return {
        object: 'text',
        leaves: [
          {
            object: 'leaf',
            text: '\n',
          },
        ],
      };
    }

    if (el.nodeName === '#text') {
      if (el.nodeValue && el.nodeValue.match(/<!--.*?-->/)) return;

      return {
        object: 'text',
        leaves: [
          {
            object: 'leaf',
            text: el.nodeValue,
          },
        ],
      };
    }
  },
  serialize: (obj, children) => {
    if (obj.object === 'string') {
      return children.split('\n').reduce((array, text, i) => {
        if (i !== 0) array.push(<br />);
        // BEGIN CHANGES

        // Replace "a   b c" with "a&nbsp;&nbsp; b c" (to match Gmail's behavior exactly.)
        // In a long run of spaces, all but the last space are converted to &nbsp;.
        // Note: This text is pushed through React's HTML serializer after we're done,
        // so we need to use `\u00A0` which is the unicode character for &nbsp;
        text = text.replace(/([ ]+) /g, (str, match) => match.replace(/ /g, '\u00A0') + ' ');

        // If the first character is whitespace (eg: " a" or " "), replace it with an nbsp.
        // Even if it's not a run of spaces, this character will be ignored because it's
        // considered HTML whitespace.
        text = text.replace(/^ /, '\u00A0');

        // \r handling: CRLF delimited text pasted into the editor (on Windows) is not processed
        // properly by Slate. It splits on \n leaving the preceding \r lying around. When the
        // serializer encounters text nodes containing just a `\r`, it doesn't flip them to
        // <br/> tags because they're not empty, but the character is HTML whitespace and
        // renders with zero height causing blank newlines to disappear.

        // If the only character is a \r, replace it with an nbsp.
        if (text === '\r') text = '\u00A0';

        // If the text contains a trailing \r, remove it. This stray char shouldn't matter but
        // also shouldn't be in the HTML string.
        text = text.replace(/\r$/, '');

        // END CHANGES
        array.push(text);
        return array;
      }, []);
    }
  },
};

const HtmlSerializer = new Html({
  defaultBlock: { type: BLOCK_CONFIG.div.type },
  rules: [].concat(...plugins.filter(p => p.rules).map(p => p.rules)).concat([TEXT_RULE_IMPROVED]),
  parseHtml: parseHtml,
});

/* Patch: The HTML Serializer doesn't properly handle nested marks
because when it discovers another mark it fails to call applyMark
on the result. */
(HtmlSerializer as any).deserializeMark = function(mark: Mark) {
  const type = mark.type;
  const data = mark.data;

  const applyMark = function applyMark(
    node: TextJSON | InlineJSON | BlockJSON | MarkJSON
  ): NodeJSON {
    // TODO BG
    if (node.object === 'mark') {
      // THIS LINE CONTAINS THE CHANGE. +map
      let result = (HtmlSerializer as any).deserializeMark(node);
      if (result && result instanceof Array) {
        result = result.map(applyMark);
      }
      return result;
    } else if (node.object === 'text') {
      node.leaves = node.leaves.map(function(leaf) {
        leaf.marks = leaf.marks || [];
        leaf.marks.push({ object: 'mark', type: type, data: data });
        return leaf;
      });
    } else {
      if (node.nodes && node.nodes instanceof Array) {
        node.nodes = node.nodes.map(applyMark);
      }
    }

    return node;
  };

  return mark.nodes.reduce(function(nodes, node) {
    var ret = applyMark(node);
    if (Array.isArray(ret)) return nodes.concat(ret);
    nodes.push(ret);
    return nodes;
  }, []);
};

export function convertFromHTML(html: string) {
  const json = HtmlSerializer.deserialize(html, { toJSON: true });

  /* Slate's default sanitization just obliterates block nodes that contain both
  inline+text children and block children. This happens very often because we
  preserve <div> nodes as blocks. Implement better coercion before theirs:
  
  - Find nodes with mixed children:
    + Wrap adjacent inline+text children in a new <div> block
  */
  const wrapMixedChildren = (node: DocumentJSON | NodeJSON) => {
    if (!('nodes' in node)) return;

    // visit all our children
    node.nodes.forEach(wrapMixedChildren);

    const blockChildren = node.nodes.filter(n => n.object === 'block');
    const mixed = blockChildren.length > 0 && blockChildren.length !== node.nodes.length;
    if (!mixed) {
      return;
    }

    const cleanNodes = [];
    let openWrapperBlock = null;
    for (const child of node.nodes) {
      if (child.object === 'block') {
        if (openWrapperBlock) {
          openWrapperBlock = null;
          // this node will close the wrapper block we've created and trigger a newline!
          // If this node is empty (was just a <br> or <p></p> to begin with) let's skip
          // it to avoid creating a double newline.
          if (child.type === BLOCK_CONFIG.div.type && child.nodes && child.nodes.length === 0) {
            continue;
          }
        }
        cleanNodes.push(child);
      } else {
        if (!openWrapperBlock) {
          openWrapperBlock = {
            type: BLOCK_CONFIG.div.type,
            object: 'block',
            nodes: [],
            data: {},
          };
          cleanNodes.push(openWrapperBlock);
        }
        openWrapperBlock.nodes.push(child);
      }
    }
    node.nodes = cleanNodes;
  };

  wrapMixedChildren(json.document);

  /* We often end up with bogus whitespace at the bottom of complex emails, either
  because the input contained whitespace, or because there were elements present
  that we didn't convert into anything. Prune the trailing empty node(s). */
  const cleanupTrailingWhitespace = (node: DocumentJSON | NodeJSON, isTopLevel: boolean) => {
    if (node.object === 'text') {
      return;
    }
    if (node.object === 'inline' && schema.inlines[node.type] && schema.inlines[node.type].isVoid) {
      return;
    }

    while (true) {
      const last = node.nodes[node.nodes.length - 1];
      if (!last) {
        break;
      }
      cleanupTrailingWhitespace(last, false);

      if (isTopLevel && node.nodes.length === 1) {
        break;
      }
      if (
        last.object === 'block' &&
        last.type === BLOCK_CONFIG.div.type &&
        last.nodes.length === 0
      ) {
        node.nodes.pop();
        continue;
      }
      if (last.object === 'text' && last.leaves.length === 1 && last.leaves[0].text === '') {
        node.nodes.pop();
        continue;
      }
      break;
    }
  };
  cleanupTrailingWhitespace(json.document, true);

  /* In Slate, `text` nodes contains an array of `leaves`, each of which has `marks`.
  When we deserialize HTML we convert "Hello <b>World</b> Again" into three adjacent
  text nodes, each with a single leaf with different marks, and Slate has to (very slowly)
  normalize it by merging the nodes into one text node with three leaves.

  - Convert adjacent text nodes into a single text node with all the leaves.
  - Ensure `block` elements have an empty text node child.
  */
  const optimizeTextNodesForNormalization = (node: DocumentJSON | NodeJSON) => {
    if (!('nodes' in node)) return;
    node.nodes.forEach(optimizeTextNodesForNormalization);

    // Convert adjacent text nodes into a single text node with all the leaves
    const cleanChildren = [];
    let lastChild = null;
    for (const child of node.nodes) {
      if (child.object === 'block') {
        return; // because of wrapMixedChildren, block child means no text children
      }
      if (lastChild && lastChild.object === 'text' && child.object === 'text') {
        lastChild.leaves.push(...child.leaves);
        continue;
      }
      cleanChildren.push(child);
      lastChild = child;
    }
    node.nodes = cleanChildren;

    // Ensure `block` elements have an empty text node child
    if (node.object === 'block' && node.nodes.length === 0) {
      node.nodes = [
        {
          object: 'text',
          leaves: [
            {
              object: 'leaf',
              text: '',
              marks: [],
            },
          ],
        },
      ];
    }
  };

  optimizeTextNodesForNormalization(json.document);

  return Value.fromJSON(json);
}

export function convertToHTML(value: Value) {
  if (!value) return '';
  return HtmlSerializer.serialize(value);
}

export function convertToPlainText(value: Value) {
  if (!value) return '';

  const serializeNode = (node: SlateNode) => {
    if (node.object === 'block' && node.type === UNEDITABLE_TYPE) {
      let html = node.data.get('html');

      // On detatched DOM nodes (where the content is not actually rendered onscreen),
      // innerText and textContent are the same and neither take into account CSS styles
      // of the various elements. To make the conversion from HTML to text decently well,
      // we insert newlines on </p> and <br> tags so their textContent contains them:
      html = html.replace(/<\/p ?>/g, '\n\n</p>');
      html = html.replace(/<br ?\/?>/g, '\n');
      html = html.replace(/<\/div ?>/g, '\n</div>');

      const div = document.createElement('div');
      div.innerHTML = html;

      // This creates a ton of extra newlines, so anywhere this more than two empty spaces
      // we collapse them back down to two.
      let text = div.textContent;
      text = text.replace(/\n\n\n+/g, '\n\n').trim();
      return text;
    }
    if (isQuoteNode(node)) {
      const content = node.nodes.map(serializeNode).join('\n');
      return deepenPlaintextQuote(content);
    }
    if (node.object === 'document' || (node.object === 'block' && Block.isBlockList(node.nodes))) {
      return node.nodes.map(serializeNode).join('\n');
    } else {
      return node.text;
    }
  };
  return serializeNode(value.document);
}

/* This is a utility method that converts the value to JSON and strips every node
of it's sensitive bigts, replacing text, links, images, etc. with "XXX" characers
of the same length. This allows us to log exceptions with the document's structure
so we can debug challenging problems but not leak PII. */
export function convertToShapeWithoutContent(value: Value) {
  // Sidenote: this uses JSON.stringify to "walk" every key-value pair
  // in the entire JSON tree and have the opportunity to replace the values.
  let json: object = { error: 'toJSON failed' };
  try {
    json = value.toJSON();
  } catch (err) {
    // pass
  }
  return JSON.stringify(json, (key, value) => {
    if (
      typeof value === 'string' &&
      ['text', 'href', 'html', 'contentId', 'className'].includes(key)
    ) {
      return 'X'.repeat(value.length);
    }
    return value;
  });
}
