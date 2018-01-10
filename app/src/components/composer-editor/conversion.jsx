import Html from 'slate-html-serializer';
import { Value } from 'slate';

import BaseMarkPlugins from './base-mark-plugins';
import TemplatePlugins from './template-plugins';
import UneditablePlugins from './uneditable-plugins';
import BaseBlockPlugins from './base-block-plugins';
import InlineAttachmentPlugins from './inline-attachment-plugins';
import MarkdownPlugins from './markdown-plugins';
import LinkPlugins from './link-plugins';

// Note: order is important here because we deserialize HTML with rules
// in this order. <code class="var"> before <code>, etc.
export const plugins = [
  ...InlineAttachmentPlugins,
  ...UneditablePlugins,
  ...TemplatePlugins,
  ...BaseMarkPlugins,
  ...BaseBlockPlugins,
  ...LinkPlugins,
  ...MarkdownPlugins,
];

const HtmlSerializer = new Html({
  rules: [].concat(...plugins.filter(p => p.rules).map(p => p.rules)),
});

const cssValueIsZero = val => {
  return val === '0' || val === '0px' || val === '0em' || val === 0;
};

const nodeIsEmpty = node => {
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

const DefaultParse = HtmlSerializer.parseHtml;
HtmlSerializer.parseHtml = html => {
  const tree = DefaultParse.apply(HtmlSerializer, [html]);
  const collapse = require('collapse-whitespace');
  collapse(tree);

  // get rid of <meta> and <style> tags since styles have been inlined
  Array.from(tree.querySelectorAll('meta')).forEach(m => m.remove());
  Array.from(tree.querySelectorAll('style')).forEach(m => m.remove());
  Array.from(tree.querySelectorAll('title')).forEach(m => m.remove());

  // remove any display:none nodes. This is commonly used in HTML email to
  // send a plaintext header
  Array.from(tree.querySelectorAll('[style]')).forEach(m => {
    if (m.style.display === 'none') {
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
    const p = pWalker.currentNode;

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
      p.nextSibling.remove();
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
};

export function convertFromHTML(html) {
  const json = HtmlSerializer.deserialize(html, { toJSON: true });

  /* Slate's default sanitization just obliterates block nodes that contain both
  inline+text children and block children. This happens very often because we
  preserve <div> nodes as blocks. Implement better coercion before theirs:
  
  - Find nodes with mixed children:
    + Wrap adjacent inline+text children in a new <div> block
  */
  const wrapMixedChildren = node => {
    if (!node.nodes) return;

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
          if (child.type === 'div' && child.nodes && child.nodes.length === 0) {
            continue;
          }
        }
        cleanNodes.push(child);
      } else {
        if (!openWrapperBlock) {
          openWrapperBlock = {
            type: 'div',
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

  return Value.fromJSON(json);
}

export function convertToHTML(value) {
  return HtmlSerializer.serialize(value);
}
